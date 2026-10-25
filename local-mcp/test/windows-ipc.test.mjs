import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VirtualPeer, helperPath } from '../windows-ipc.mjs';
import { encode, decoder, MAX_FRAME } from '../protocol.mjs';

test('Windows multiplex adapter preserves binary frames, chunks and peer isolation', () => {
  const sent = [], incoming = [], other = [];
  const peer = new VirtualPeer('a'.repeat(32), m => { sent.push(m); return true; });
  const second = new VirtualPeer('b'.repeat(32), () => true);
  peer.on('data', decoder(m => incoming.push(m), e => { throw e; }));
  second.on('data', data => other.push(data));
  const frame = encode({ text: '中文'.repeat(18000) });
  assert.equal(peer.write(frame), true); assert.ok(sent.length > 1);
  assert.ok(sent.every(m => m.id === 'a'.repeat(32) && m.data.length <= 45000));
  for (const message of sent) peer.receive(message.data);
  assert.equal(incoming[0].text.length, 36000); assert.equal(other.length, 0);
  peer.destroy(); assert.equal(peer.destroyed, true); assert.equal(second.destroyed, false);
});

test('Windows multiplex adapter rejects malformed data and excess queues', () => {
  for (const bad of ['***', 'A'.repeat(45004), null]) { const peer = new VirtualPeer('a'.repeat(32), () => true); peer.receive(bad); assert.equal(peer.destroyed, true); }
  const blocked = new VirtualPeer('a'.repeat(32), () => true, () => MAX_FRAME * 2 + 1);
  assert.equal(blocked.write(Buffer.from('abc')), false); assert.equal(blocked.destroyed, true);
});

test('Windows security source keeps explicit SID DACL, local-only and connected-owner checks', () => {
  // Static assertions are change guards, NOT proof that Windows APIs compile or
  // enforce ACLs. Run the helper selftest and cross-account tests on Windows.
  const source = fs.readFileSync(new URL('../windows/Program.cs', import.meta.url), 'utf8');
  assert.ok(source.includes('"O:" + Sid + "D:P(A;;GA;;;" + Sid + ")"'));
  assert.ok(source.includes('identity.User?.Value')); assert.ok(!source.includes('identity.Owner'));
  assert.ok(source.includes('RejectRemoteClients = 0x8')); assert.ok(source.includes('FirstInstance = 0x00080000'));
  assert.ok(source.includes('VerifyOwner(pipe.SafePipeHandle)')); assert.ok(source.includes('TokenImpersonationLevel.Identification'));
  assert.ok(source.includes('WindowsBuiltInRole.Administrator')); assert.ok(source.includes('new NamedPipeClientStream(".", PipeName'));
  assert.ok(source.includes('if (Peers.Count >= MaxPeers - 1) { connected.Disconnect(); continue; }'));
  assert.ok(source.includes('catch { Stop.Cancel(); throw; } // A partial shared frame'));
  assert.ok(source.includes('length > MaxFrame')); assert.ok(source.includes('first ? FirstInstance : 0'));
  assert.ok(!/Everyone|AnonymousSid|SetAccessRuleProtection\(false|RunAs|RegistryKey/.test(source));
});

test('Windows helper absence fails closed rather than opening an unsecured Node pipe', () => {
  if (!fs.existsSync(new URL('../windows/bin/MyntPipe.exe', import.meta.url))) assert.throws(helperPath);
  const broker = fs.readFileSync(new URL('../broker.mjs', import.meta.url), 'utf8');
  assert.match(broker, /process\.platform === 'win32'\) return startWindowsBroker\(accept\)/);
});
