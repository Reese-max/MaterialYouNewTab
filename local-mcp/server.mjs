#!/usr/bin/env node
import { Transform } from 'node:stream';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools, validate } from './registry.mjs';
import { callBrowser } from './client.mjs';
import { fail, MAX_FRAME } from './protocol.mjs';
const server = new Server({ name: 'mynt-local', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(({ readOnly, ...tool }) => ({ ...tool, annotations: { readOnlyHint: !!readOnly, destructiveHint: !readOnly, openWorldHint: false } })) }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  const args = request.params.arguments ?? {};
  const invalid = Buffer.byteLength(JSON.stringify(args)) > MAX_FRAME - 1024 ? 'Arguments too large' : validate(request.params.name, args);
  const result = invalid ? fail('INVALID_ARGUMENTS', invalid) : await callBrowser(request.params.name, args);
  return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok };
});
let lineBytes = 0;
const boundedInput = new Transform({ transform(chunk, encoding, callback) {
  for (const byte of chunk) { lineBytes = byte === 10 ? 0 : lineBytes + 1; if (lineBytes > MAX_FRAME) return callback(new Error('MCP_FRAME_TOO_LARGE')); }
  callback(null, chunk);
} });
boundedInput.on('error', () => { process.stderr.write('MCP input frame exceeded bound.\n'); process.stdin.destroy(); server.close(); });
process.stdin.pipe(boundedInput);
const transport = new StdioServerTransport(boundedInput, process.stdout);
await server.connect(transport);
// Official SDK owns MCP framing; all diagnostics go to stderr, never stdout.
process.stdin.on('end', () => server.close());
