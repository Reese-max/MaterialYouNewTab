import net from 'node:net';
import { connectWindows } from './windows-ipc.mjs';
import { randomUUID } from 'node:crypto';
import { verifiedSocket, decoder, send, fail } from './protocol.mjs';
export function callBrowser(tool, args, timeout = 12000) {
  return new Promise(resolve => {
    let socket;
    try { socket = process.platform === 'win32' ? connectWindows() : net.createConnection(verifiedSocket()); } catch (e) { resolve(fail(e.code === 'ENOENT' ? 'BROKER_OFFLINE' : 'UNSAFE_RUNTIME', 'Local broker unavailable or unsafe. Start the approved broker manually.')); return; }
    const id = randomUUID(); let done = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timer); socket.destroy(); resolve(result); };
    const timer = setTimeout(() => finish(fail('TIMEOUT', 'No broker reply; read state before retrying mutations.')), timeout);
    socket.on('connect', () => send(socket, { kind: 'hello', role: 'client' }));
    socket.on('error', () => finish(fail('BROKER_OFFLINE', 'Local broker is not running.')));
    socket.on('close', () => finish(fail('BROKER_DISCONNECTED', 'Broker connection closed; mutation outcome may be uncertain.')));
    socket.on('data', decoder(msg => {
      if (msg.kind === 'ready') send(socket, { id, tool, args, expectedRevision: args.expectedRevision, requestId: args.requestId });
      else if (msg.id === id) { const { id: ignored, ...result } = msg; finish(result); }
    }, () => finish(fail('INVALID_FRAME', 'Malformed broker response.'))));
  });
}
