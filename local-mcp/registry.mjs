import fs from 'node:fs';
import Ajv from 'ajv';
const root = new URL('./', import.meta.url);
export const tools = fs.readdirSync(root).filter(n => n.endsWith('-tools.json')).sort().flatMap(n => JSON.parse(fs.readFileSync(new URL(n, root), 'utf8'))).map(tool => ({ ...tool, readOnly: tool.readOnly ?? tool.annotations?.readOnlyHint ?? false }));
// MCP entry points require replay IDs; browser adapters can still be called
// internally without one because the browser bridge independently enforces it.
for (const tool of tools) if (!tool.readOnly) {
  tool.inputSchema = { ...tool.inputSchema, properties: { ...tool.inputSchema.properties,
    requestId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{8,100}$', minLength: 8, maxLength: 100 }
  }, required: [...new Set([...(tool.inputSchema.required ?? []), 'requestId'])] };
}
const ajv = new Ajv({ strict: false, allErrors: false });
const validators = new Map();
for (const tool of tools) {
  if (validators.has(tool.name)) throw new Error(`Duplicate tool ${tool.name}`);
  validators.set(tool.name, ajv.compile(tool.inputSchema));
}
export function validate(tool, args) {
  const validator = validators.get(tool);
  if (!validator) return 'Unknown tool';
  if (!validator(args)) return 'Arguments do not match the advertised schema';
  return null;
}
