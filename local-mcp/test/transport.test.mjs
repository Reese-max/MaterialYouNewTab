import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startBroker, uncertainTombstone } from '../broker.mjs';
import { encode, decoder, send, MAX_FRAME } from '../protocol.mjs';
import { callBrowser } from '../client.mjs';
import { connectWindows } from '../windows-ipc.mjs';
import { tools } from '../registry.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'mynt-mcp-test-'));
process.env.MYNT_MCP_RUNTIME = runtime;
const readTool = () => tools.find(t => t.readOnly && (t.inputSchema.required ?? []).length === 0)?.name;

test('native framing supports fragmented UTF-8, batches and rejects oversized/invalid input', () => {
  const out = [], errors = []; const read = decoder(v => out.push(v), e => errors.push(e));
  const frame = encode({ text: '繁體中文' }); for (const byte of frame) read(Buffer.from([byte]));
  read(Buffer.concat([encode({ x: 1 }), encode({ x: 2 })])); assert.equal(out.length, 3); assert.equal(out[0].text, '繁體中文');
  const huge = Buffer.alloc(4); huge.writeUInt32LE(MAX_FRAME + 1); read(huge); assert.equal(errors.length, 1);
});

test('real official SDK stdio initialize, tools/list and explicit offline call', async () => {
  assert.ok(readTool(), 'Tool descriptors must exist');
  const client = new Client({ name: 'mynt-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'server.mjs')], env: { MYNT_MCP_RUNTIME: runtime }, stderr: 'pipe' });
  try { await client.connect(transport); const listed = await client.listTools(); assert.equal(listed.tools.length, tools.length);
    assert.ok(listed.tools.filter(t => !t.annotations.readOnlyHint).every(t => t.inputSchema.required.includes('requestId')));
    const result = await client.callTool({ name: readTool(), arguments: {} }); assert.equal(result.isError, true); assert.equal(JSON.parse(result.content[0].text).error.code, 'BROKER_OFFLINE');
    const missingId = await client.callTool({ name: 'mynt_scratchpad_update', arguments: { operation: 'append', text: 'test', expectedRevision: '0'.repeat(64) } }); assert.equal(JSON.parse(missingId.content[0].text).error.code, 'INVALID_ARGUMENTS');
    const invalid = await client.callTool({ name: 'arbitrary_js', arguments: {} }); assert.equal(JSON.parse(invalid.content[0].text).error.code, 'INVALID_ARGUMENTS');
  } finally { await client.close(); }
});

test('private broker: offline, multiple clients, idempotency, timeout, native host roundtrip', { timeout: 30000 }, async () => {
  const broker = await startBroker({ timeout: process.platform === 'win32' ? 2000 : 100 }); let native;
  try {
    if (process.platform !== 'win32') assert.equal(fs.statSync(broker.socketPath).mode & 0o777, 0o600);
    await assert.rejects(startBroker(), /SOCKET_EXISTS|WINDOWS_HELPER_STOPPED/);
    assert.equal((await callBrowser(readTool(), {})).error.code, 'BRIDGE_OFFLINE');
    native = spawn(process.execPath, [path.join(root, 'native-host.mjs')], { env: { ...process.env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let requests = 0, mode = 'reply';
    const ready = new Promise((resolve, reject) => { native.once('error', reject); native.stdout.on('data', decoder(msg => {
      if (msg.kind === 'ready') { resolve(); return; }
      requests++;
      if (mode === 'revoked') native.stdin.write(encode({ id: msg.id, ok: false, error: { code: 'ACCESS_DISABLED', message: 'Private data access revoked' } }));
      if (mode === 'reply') setTimeout(() => native.stdin.write(encode({ id: msg.id, ok: true, data: { marker: 'native-roundtrip' }, revision: 'r1' })), 10);
    }, reject)); });
    await ready;
    const results = await Promise.all(Array.from({ length: 5 }, () => callBrowser(readTool(), {})));
    assert.ok(results.every(r => r.ok && r.data.marker === 'native-roundtrip')); assert.equal(requests, 5);
    const sdkClients = [];
    try {
      for (let i = 0; i < 2; i++) {
        const c = new Client({ name: `concurrent-${i}`, version: '1' });
        await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'server.mjs')], env: { MYNT_MCP_RUNTIME: runtime }, stderr: 'pipe' }));
        sdkClients.push(c);
      }
      const replies = await Promise.all(sdkClients.map(c => c.callTool({ name: readTool(), arguments: {} })));
      assert.ok(replies.every(r => !r.isError && JSON.parse(r.content[0].text).data.marker === 'native-roundtrip'));
    } finally { await Promise.all(sdkClients.map(c => c.close())); }
    const priorRequests = requests;
    // Raw requests let a read-only schema remain strict while exercising envelope IDs.
    const raw = (requestId, args = {}, expectedRevision, tool = readTool()) => new Promise(resolve => {
      const s = process.platform === 'win32' ? connectWindows() : net.createConnection(broker.socketPath); s.on('error', () => {}); s.on('connect', () => send(s, { kind: 'hello', role: 'client' }));
      s.on('data', decoder(msg => { if (msg.kind === 'ready') send(s, { id: 'test', tool, args, requestId, expectedRevision }); else { s.destroy(); resolve(msg); } }, e => { throw e; }));
    });
    const pair = await Promise.all([raw('stable-key-1'), raw('stable-key-1')]); assert.ok(pair.every(r => r.ok)); assert.equal(requests, priorRequests + 1);
    assert.equal((await raw('stable-key-1')).ok, true); assert.equal(requests, priorRequests + 2);
    // Completed requests revisit browser scope rather than replay broker data.
    const privateArgs = { expectedRevision: '0'.repeat(64), operation: 'append', text: 'private text', requestId: 'private-mutation-1' };
    assert.equal((await raw('private-mutation-1', privateArgs, privateArgs.expectedRevision, 'mynt_scratchpad_update')).ok, true);
    mode = 'revoked';
    assert.equal((await raw('private-mutation-1', privateArgs, privateArgs.expectedRevision, 'mynt_scratchpad_update')).error.code, 'ACCESS_DISABLED');
    mode = 'reply';
    mode = 'ignore'; assert.equal((await callBrowser(readTool(), {})).error.code, 'TIMEOUT');
    const uncertainArgs = { ...privateArgs, requestId: 'uncertain-write-1' };
    assert.equal((await raw('uncertain-write-1', uncertainArgs, uncertainArgs.expectedRevision, 'mynt_scratchpad_update')).error.code, 'TIMEOUT');
    const afterUncertain = requests;
    mode = 'reply';
    assert.equal((await raw('uncertain-write-1', uncertainArgs, uncertainArgs.expectedRevision, 'mynt_scratchpad_update')).error.code, 'TIMEOUT');
    assert.equal(requests, afterUncertain);
    assert.equal((await raw('uncertain-write-1', { ...uncertainArgs, text: 'different' }, uncertainArgs.expectedRevision, 'mynt_scratchpad_update')).error.code, 'REQUEST_ID_REUSED');
    mode = 'reply'; assert.equal((await callBrowser(readTool(), {})).ok, true);
    native.kill(); await new Promise(resolve => native.once('exit', resolve));
    assert.equal((await raw('private-mutation-1', privateArgs, privateArgs.expectedRevision, 'mynt_scratchpad_update')).error.code, 'BRIDGE_OFFLINE');
  } finally { native?.kill(); await broker.close(); }
});

test('broker replay retention excludes successes, private data and read-only outcomes', () => {
  assert.equal(uncertainTombstone({ ok: true, data: { text: 'private text' } }, false), null);
  assert.equal(uncertainTombstone({ ok: false, error: { code: 'ACCESS_DISABLED', message: 'private' } }, false), null);
  assert.equal(uncertainTombstone({ ok: false, error: { code: 'TIMEOUT', message: 'private' } }, true), null);
  const tombstone = uncertainTombstone({ ok: false, data: { text: 'private' }, error: { code: 'TIMEOUT', message: 'private' } }, false);
  assert.equal(tombstone.error.code, 'TIMEOUT'); assert.ok(!JSON.stringify(tombstone).includes('private')); assert.equal(tombstone.data, undefined);
});

test('unsafe runtime and symlink paths fail closed', { skip: process.platform === 'win32' ? 'Unix filesystem security only; Windows uses helper ACL selftest.' : false }, async () => {
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'mynt-unsafe-')); fs.chmodSync(bad, 0o755); process.env.MYNT_MCP_RUNTIME = bad;
  try { await assert.rejects(startBroker(), /UNSAFE_RUNTIME/); } finally { process.env.MYNT_MCP_RUNTIME = runtime; fs.rmdirSync(bad); }
  const link = `${runtime}-link`; fs.symlinkSync(runtime, link); process.env.MYNT_MCP_RUNTIME = link;
  try { await assert.rejects(startBroker(), /UNSAFE_RUNTIME/); } finally { process.env.MYNT_MCP_RUNTIME = runtime; fs.unlinkSync(link); }
});

test.after(() => fs.rmSync(runtime, { recursive: true, force: true }));
