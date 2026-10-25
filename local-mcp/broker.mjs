import net from 'node:net';
import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { secureRuntime, decoder, send, fail } from './protocol.mjs';
import { startWindowsBroker } from './windows-ipc.mjs';
import { tools, validate } from './registry.mjs';
const readOnlyTools = new Set(tools.filter(tool => tool.readOnly).map(tool => tool.name));
// Never retain browser data or browser-provided messages. Successful retries must
// revisit the browser's current access checks and session-scoped replay cache.
export function uncertainTombstone(result, readOnly) {
  if (readOnly || result.ok || !['TIMEOUT', 'BRIDGE_DISCONNECTED'].includes(result.error?.code)) return null;
  return fail(result.error.code, 'A previous attempt has an uncertain outcome. Read current state before retrying with a new requestId.');
}
export async function startBroker({ timeout = 10000 } = {}) {
  const socketPath = process.platform === 'win32' ? null : secureRuntime(true);
  if (socketPath && fs.existsSync(socketPath)) throw new Error('SOCKET_EXISTS: refuse replacing an active or stale socket; inspect and remove manually after stopping broker.');
  const peers = new Set(), pending = new Map(), cache = new Map();
  let browser;
  const finish = (id, result) => {
    const p = pending.get(id); if (!p) return;
    clearTimeout(p.timer); pending.delete(id);
    const tombstone = uncertainTombstone(result, p.readOnly);
    if (p.key && tombstone) { cache.set(p.key, { signature: p.signature, result: tombstone, at: Date.now() }); while (cache.size > 256) cache.delete(cache.keys().next().value); }
    for (const w of p.waiters) send(w.socket, { ...result, id: w.id });
  };
  const accept = socket => {
    if (peers.size >= 32) { socket.destroy(); return; }
    peers.add(socket); let role;
    const helloTimer = setTimeout(() => socket.destroy(), 2000);
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(helloTimer); peers.delete(socket);
      if (browser === socket) { browser = undefined; for (const id of pending.keys()) finish(id, fail('BRIDGE_DISCONNECTED', 'Browser disconnected; mutation outcome may be uncertain. Read state before retrying.')); }
    });
    socket.on('data', decoder(msg => {
      if (!role) {
        if (msg.kind !== 'hello' || !['client', 'browser'].includes(msg.role)) { socket.destroy(); return; }
        if (msg.role === 'browser' && browser) { send(socket, fail('BRIDGE_BUSY', 'Only one browser authority is supported.')); socket.end(); return; }
        role = msg.role; clearTimeout(helloTimer); if (role === 'browser') browser = socket;
        send(socket, { kind: 'ready', role }); return;
      }
      if (role === 'browser') {
        if (typeof msg.id !== 'string' || typeof msg.ok !== 'boolean' || (!msg.ok && (!msg.error || typeof msg.error.code !== 'string' || typeof msg.error.message !== 'string'))) { socket.destroy(); return; }
        finish(msg.id, msg); return;
      }
      const reply = result => send(socket, { ...result, id: msg.id });
      if (typeof msg.id !== 'string' || msg.id.length > 128 || typeof msg.tool !== 'string') { socket.destroy(); return; }
      const error = validate(msg.tool, msg.args);
      if (error) return reply(fail('INVALID_ARGUMENTS', error));
      const key = msg.requestId ?? msg.args?.requestId;
      if (key !== undefined && (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(key))) return reply(fail('INVALID_REQUEST_ID', 'requestId must be 8–100 letters, digits, underscores or hyphens.'));
      const revision = msg.expectedRevision ?? msg.args?.expectedRevision;
      const signature = createHash('sha256').update(JSON.stringify([msg.tool, msg.args, revision])).digest('hex');
      if (!browser) return reply(fail('BRIDGE_OFFLINE', 'Open a MYNT tab and explicitly enable its local bridge after approved setup.'));
      for (const [k, value] of cache) if (Date.now() - value.at > 300000) cache.delete(k);
      if (key && cache.has(key)) { const old = cache.get(key); return reply(old.signature === signature ? old.result : fail('REQUEST_ID_REUSED', 'requestId was already used with different arguments.')); }
      if (key) for (const p of pending.values()) if (p.key === key) {
        if (p.signature !== signature) return reply(fail('REQUEST_ID_REUSED', 'requestId is already pending with different arguments.'));
        if (p.waiters.length >= 32) return reply(fail('BUSY', 'Too many duplicate waiters.'));
        p.waiters.push({ socket, id: msg.id }); return;
      }
      if (pending.size >= 64) return reply(fail('BUSY', 'Too many pending requests.'));
      const id = randomUUID();
      const timer = setTimeout(() => finish(id, fail('TIMEOUT', 'Browser did not reply; outcome may be uncertain. Read state before retrying.')), timeout);
      pending.set(id, { key, signature, readOnly: readOnlyTools.has(msg.tool), timer, waiters: [{ socket, id: msg.id }] });
      if (!send(browser, { id, tool: msg.tool, args: msg.args, ...(revision !== undefined ? { expectedRevision: revision } : {}), ...(key ? { requestId: key } : {}) })) finish(id, fail('BRIDGE_DISCONNECTED', 'Browser connection lost.'));
    }, () => socket.destroy()));
  };
  if (process.platform === 'win32') return startWindowsBroker(accept);
  const server = net.createServer(accept);
  const oldMask = process.umask(0o077);
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); }); } finally { process.umask(oldMask); }
  fs.chmodSync(socketPath, 0o600);
  const inode = fs.lstatSync(socketPath).ino;
  return { socketPath, close: async () => { for (const p of pending.values()) clearTimeout(p.timer); for (const peer of peers) peer.destroy(); await new Promise(resolve => server.close(resolve)); try { if (fs.lstatSync(socketPath).ino === inode) fs.unlinkSync(socketPath); } catch (e) { if (e.code !== 'ENOENT') throw e; } } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const broker = await startBroker(); process.stderr.write('MYNT broker listening on private local IPC. No browser is enabled automatically.\n'); for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await broker.close(); process.exit(0); }); } catch (e) { process.stderr.write(`${e.message}\n`); process.exitCode = 1; }
}
