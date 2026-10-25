import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
export const MAX_FRAME = 512 * 1024;
export const fail = (code, message) => ({ ok: false, error: { code, message } });
export function runtimePath() {
  if (process.platform === 'win32' || !process.getuid) throw new Error('UNIX_RUNTIME_ONLY: Windows uses the protected named-pipe helper, not Unix sockets.');
  return process.env.MYNT_MCP_RUNTIME || path.join(fs.realpathSync(os.tmpdir()), `mynt-mcp-${process.getuid()}`);
}
export function secureRuntime(create = false) {
  const dir = runtimePath();
  if (!path.isAbsolute(dir)) throw new Error('Runtime directory must be absolute');
  if (create) { try { fs.mkdirSync(dir, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; } }
  const st = fs.lstatSync(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('UNSAFE_RUNTIME: expected owned directory mode 0700');
  // Reject symlink ancestors too. Never follow a user-supplied runtime symlink.
  for (let p = path.dirname(dir); ; p = path.dirname(p)) { if (fs.lstatSync(p).isSymbolicLink()) throw new Error('UNSAFE_RUNTIME: symlink ancestor'); if (p === path.dirname(p)) break; }
  return path.join(dir, 'broker.sock');
}
export function verifiedSocket() {
  const socket = secureRuntime();
  const st = fs.lstatSync(socket);
  if (!st.isSocket() || st.uid !== process.getuid() || (st.mode & 0o077)) throw new Error('UNSAFE_SOCKET: expected owned socket mode 0600');
  return socket;
}
export function encode(value) {
  const data = Buffer.from(JSON.stringify(value));
  if (data.length > MAX_FRAME) throw new Error('FRAME_TOO_LARGE');
  const header = Buffer.alloc(4); header.writeUInt32LE(data.length); return Buffer.concat([header, data]);
}
export function decoder(onMessage, onError) {
  let buffer = Buffer.alloc(0), failed = false;
  return chunk => {
    if (failed) return;
    try {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32LE(0);
        if (!length || length > MAX_FRAME) throw new Error('FRAME_TOO_LARGE');
        if (buffer.length < length + 4) break;
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(4, length + 4)));
        buffer = buffer.subarray(length + 4);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_FRAME');
        onMessage(value);
      }
      if (buffer.length > MAX_FRAME + 4) throw new Error('FRAME_TOO_LARGE');
    } catch (e) { failed = true; onError(e); }
  };
}
export function send(socket, value) {
  if (socket.destroyed || socket.writableLength > MAX_FRAME * 2) { socket.destroy(); return false; }
  try { socket.write(encode(value)); return true; } catch { socket.destroy(); return false; }
}
