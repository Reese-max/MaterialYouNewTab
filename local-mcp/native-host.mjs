#!/usr/bin/env node
import net from 'node:net';
import { connectWindows } from './windows-ipc.mjs';
import { verifiedSocket, decoder, send, encode, fail } from './protocol.mjs';
// Native messaging uses little-endian 32-bit length-prefixed UTF-8 JSON on
// Chromium/Firefox's supported little-endian Unix platforms, not MCP stdio JSONL.
let socket;
function stop(code, message) {
  try { process.stdout.write(encode({ kind: 'bridge_error', ...fail(code, message) })); } catch {}
  socket?.destroy(); process.stdin.pause(); process.exitCode = 1;
}
try {
  socket = process.platform === 'win32' ? connectWindows() : net.createConnection(verifiedSocket());
  socket.on('connect', () => send(socket, { kind: 'hello', role: 'browser' }));
  socket.on('error', () => stop('BROKER_OFFLINE', 'Start the approved local broker before connecting.'));
  socket.on('close', () => { process.stdin.pause(); });
  socket.on('data', decoder(message => {
    if (process.stdout.writableLength > 1024 * 1024) return stop('BACKPRESSURE', 'Native output exceeded bound.');
    process.stdout.write(encode(message));
  }, () => stop('INVALID_FRAME', 'Malformed broker frame.')));
  process.stdin.on('data', decoder(message => send(socket, message), () => stop('INVALID_FRAME', 'Malformed native message.')));
  process.stdin.on('end', () => socket.destroy());
  process.stdout.on('error', () => socket.destroy());
} catch { stop('BROKER_OFFLINE', 'Local broker unavailable or unsafe; nothing was enabled.'); }
