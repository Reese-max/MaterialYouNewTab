import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { decoder, encode, MAX_FRAME } from './protocol.mjs';
const HELPER = fileURLToPath(new URL('./windows/bin/MyntPipe.exe', import.meta.url));
export function helperPath() {
  const stat = fs.lstatSync(HELPER);
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error('WINDOWS_HELPER_UNAVAILABLE: build the reviewed helper first.');
  return HELPER;
}
function launch(mode) { return spawn(helperPath(), [mode], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }); }
export class VirtualPeer extends EventEmitter {
  constructor(id, output, queueLength = () => 0) { super(); this.id = id; this.output = output; this.queueLength = queueLength; this.destroyed = false; this.on('error', () => {}); }
  get writableLength() { return this.queueLength(); }
  write(bytes) {
    if (this.destroyed || this.writableLength > MAX_FRAME * 2) { this.destroy(); return false; }
    for (let i = 0; i < bytes.length; i += 32768) if (!this.output({ kind: 'data', id: this.id, data: bytes.subarray(i, i + 32768).toString('base64') })) { this.destroy(); return false; }
    return true;
  }
  receive(base64) {
    if (typeof base64 !== 'string' || base64.length > 45000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) return this.destroy();
    if (!this.destroyed) this.emit('data', Buffer.from(base64, 'base64'));
  }
  end() { this.destroy(); }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.output({ kind: 'close', id: this.id }); this.emit('close'); }
}
export function connectWindows() {
  const child = launch('relay'), socket = new EventEmitter(); socket.destroyed = false;
  Object.defineProperty(socket, 'writableLength', { get: () => child.stdin.writableLength });
  socket.write = bytes => child.stdin.write(bytes); socket.end = () => child.stdin.end();
  socket.destroy = () => { if (!socket.destroyed) { socket.destroyed = true; child.kill(); socket.emit('close'); } };
  let connected = false, diagnostic = '';
  child.stdout.on('data', data => socket.emit('data', data));
  child.stderr.on('data', chunk => {
    diagnostic += chunk.toString('utf8');
    if (diagnostic.length > 4096) { socket.emit('error', Error('WINDOWS_HELPER_INVALID_STATUS')); socket.destroy(); return; }
    let newline;
    while ((newline = diagnostic.indexOf('\n')) >= 0) {
      const line = diagnostic.slice(0, newline).trim(); diagnostic = diagnostic.slice(newline + 1);
      if (line === 'MYNT_PIPE_CONNECTED' && !connected) { connected = true; socket.emit('connect'); }
    }
  }); // Status travels on stderr; it never contaminates native/MCP protocol data.
  child.stdin.on('error', error => { socket.emit('error', error); socket.destroy(); });
  child.once('error', error => { socket.emit('error', error); socket.destroy(); });
  child.once('exit', () => { if (!connected && !socket.destroyed) socket.emit('error', Error('BROKER_OFFLINE')); socket.destroy(); });
  return socket;
}
export async function startWindowsBroker(accept) {
  const child = launch('broker'), peers = new Map(); let closed = false;
  const output = message => {
    if (closed || child.stdin.destroyed || child.stdin.writableLength > MAX_FRAME * 2) return false;
    try { child.stdin.write(encode(message)); return true; } catch { return false; }
  };
  const close = async () => { if (closed) return; closed = true; for (const peer of peers.values()) peer.destroy(); peers.clear(); child.stdin.destroy(); child.kill(); };
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(Error('WINDOWS_HELPER_TIMEOUT')); close(); }, 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); close(); });
    child.once('exit', () => { clearTimeout(timer); reject(Error('WINDOWS_HELPER_STOPPED')); close(); });
    child.stdin.on('error', () => close()); child.stderr.resume();
    child.stdout.on('data', decoder(message => {
      if (message.kind === 'ready') { clearTimeout(timer); resolve(); return; }
      if (typeof message.id !== 'string' || !/^[a-f0-9]{32}$/.test(message.id)) { close(); return; }
      if (message.kind === 'open') {
        if (peers.size >= 32 || peers.has(message.id)) { output({ kind: 'close', id: message.id }); return; }
        const peer = new VirtualPeer(message.id, output, () => child.stdin.writableLength);
        peers.set(message.id, peer); peer.once('close', () => peers.delete(message.id)); accept(peer);
      } else if (message.kind === 'data') peers.get(message.id)?.receive(message.data);
      else if (message.kind === 'close') peers.get(message.id)?.destroy();
      else close();
    }, () => close()));
  });
  await ready;
  return { socketPath: 'Windows current-user/session protected named pipe', close };
}
