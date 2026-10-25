# MYNT local MCP (staged, not enabled)

This directory implements a local-only, explicit-opt-in bridge. Merely checking
out, testing, or installing this package does **not** register a native host,
change browser permissions, install a daemon, enable the browser bridge, or
modify an AI client's configuration. Activation is a separate user decision.
There are no paid API calls, HTTP listeners, telemetry, bundled secrets,
arbitrary JavaScript execution, filesystem tools, or binary media export tools.

## Architecture and trust

AI client ⇄ official MCP SDK stdio server ⇄ private local IPC broker ⇄ native
messaging host ⇄ explicitly enabled extension bridge ⇄ an open MYNT tab.

Linux/macOS use Unix sockets with Node 22+. Windows now has a staged, source-only
.NET 8 helper with explicitly protected named pipes; see [WINDOWS.md](WINDOWS.md).
Its compilation and live Windows ACL enforcement have not yet been verified in
this environment, so Windows must not be represented as release-ready. Browser native
host registration and live end-to-end browser verification are separate from
these transport tests. Do not describe a passing mock-browser test as an
installed browser integration.

On Linux/macOS, the manually started broker owns a 0700 runtime directory and 0600 socket,
refuses symlink paths or wrong ownership/mode, and never replaces an existing
socket. No TCP port is opened. The default runtime directory is under the real
system temporary directory, named `mynt-mcp-<uid>`. `MYNT_MCP_RUNTIME` can select
an absolute, existing-parent path; use the same value for broker, native host
and MCP clients. Windows ignores this Unix-only override and derives a fixed
pipe name from the current user SID and Windows session. No static authentication secret is used. This is an OS-user
trust boundary: **other processes running as the same OS user can access it**.
Only run trusted clients, keep the extension opt-in off when not in use, and do
not use this design to isolate mutually hostile same-user processes.

Multiple stdio clients share one broker and exactly one browser authority. A
second browser host is rejected, rather than silently selecting another profile.
Closing the active tab/browser causes explicit offline/disconnected results.
Start the broker manually again after stopping it. Never delete a socket until
you have verified that its broker is no longer running.

## Build and isolated verification

From this directory:

```sh
npm ci --ignore-scripts
npm test
```

Dependencies are locked to official npm registry packages. The tests start only
short-lived private temporary IPC sockets, official SDK stdio clients, and a
native-host subprocess with a simulated browser. They do not register hosts or
touch browser/client settings. `npm run broker` is a foreground service, not an
installer. Ctrl-C stops it and removes its own socket.

### Current execution evidence

In the implementation sandbox, official SDK stdio initialization, tool listing,
offline errors, fragmented frame handling and unsafe runtime rejection passed.
The complete IPC/native-host round-trip test remains enabled but could not run:
the environment returned `listen EPERM` for its temporary Unix socket. An
escalated test launch failed in the environment before execution. This is not
proof of working live IPC or installed Chromium/Firefox integration. Run the full
suite in an approved environment allowing private Unix sockets before release.

## Activation checklist (requires separate approval)

1. Review the tool catalog and information visible to connected AI clients.
   Backup previews omit secrets and media bytes; never add credentials to generic
   settings tools or client config.
2. Approve the browser's nativeMessaging permission and exact extension build.
   The shipped live manifests do not activate this permission automatically.
3. Copy and customize a template from `templates/` outside the repository only
   after approval. Use an absolute Node binary path and this checkout's absolute
   native-host script path. Make the launcher executable. Host name is
   `io.mynt.local_mcp`; restrict the host allowlist to the verified extension ID,
   never a wildcard. Register it according to the browser's official native
   messaging documentation. This repository supplies no automatic registrar.
4. Start the broker in a terminal, open one MYNT new-tab page, and explicitly
   enable its local bridge. Read-only discovery should work before any mutation.
5. Add only the chosen AI client configuration below after approval. A client
   config launches a stdio process; it does not start the broker or enable MYNT.
6. Verify tools/list, a read-only get, revision-checked mutation, and disconnect.
   Check both browsers independently before claiming either is supported live.

## Client examples (documentation only)

Replace `/ABSOLUTE/PATH/TO` and use a verified Node executable. These snippets
are not installed, and commands below should not be executed without approval.
Consult current official documentation for client-specific trust prompts.

Claude Code supports stdio registration:

```sh
claude mcp add --transport stdio mynt -- /ABSOLUTE/PATH/TO/node /ABSOLUTE/PATH/TO/mynt-daily/local-mcp/server.mjs
```

Codex uses a named table in its configuration:

```toml
[mcp_servers.mynt]
command = "/ABSOLUTE/PATH/TO/node"
args = ["/ABSOLUTE/PATH/TO/mynt-daily/local-mcp/server.mjs"]
```

OpenCode uses a local command array; this example is deliberately disabled:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "mynt": {
      "type": "local",
      "command": ["/ABSOLUTE/PATH/TO/node", "/ABSOLUTE/PATH/TO/mynt-daily/local-mcp/server.mjs"],
      "enabled": false
    }
  }
}
```

Official configuration references (checked 2026-10-24):
- https://code.claude.com/docs/en/mcp
- https://developers.openai.com/codex/mcp/
- https://opencode.ai/docs/mcp-servers/
- https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging
- https://ts.sdk.modelcontextprotocol.io/server

## Wire contract and limits

`*-tools.json` files are the single transport registry; only registered tool
names with valid JSON Schema arguments are forwarded. The browser validates
again. Each native request is `{id, tool, args, expectedRevision?, requestId?}`;
responses are `{id, ok, data?, error?: {code,message}, revision?}`. The native
host emits `{kind:"ready",role:"browser"}` when attached, and may emit
`{kind:"bridge_error",ok:false,error:{code,message}}` on startup failure.
The browser need not send a hello: the native host sends it to the broker.

MCP stdio uses official SDK JSON-RPC framing. Broker and native messaging use
4-byte little-endian length-prefixed UTF-8 JSON. Each frame is at most 512 KiB;
MCP input lines use the same bound. Broker limits are 32 peers, 64 pending
requests, 32 waiters per request, a 10-second response deadline, and 1 MiB queued
socket-output rejection threshold (two 512 KiB frames). No browser connection
is made implicitly by tool calls. Unavailable brokers/browsers return
`BROKER_OFFLINE` / `BRIDGE_OFFLINE`, not simulated success.

Mutating tools use an opaque expectedRevision from the corresponding getter.
Every advertised mutation schema requires requestId. Use a fresh requestId for each intended operation and reuse that exact ID and
arguments only for a transport retry. Request IDs accept 8–100 ASCII letters,
digits, hyphens and underscores. Broker deduplication coalesces concurrent matching requests across clients.
It retains only up to 256 sanitized uncertain-mutation tombstones for five
minutes; no successful result, private data, or read-only result is cached in
the broker. Completed requests revisit the browser's current scope checks and
its bounded session replay cache. Reusing an active/tombstoned ID with different
arguments is rejected. Browser disconnection always returns an offline error,
not an old successful response. This is **not** a
durable exactly-once guarantee: cache expiry, eviction or broker/browser
restart ends the guarantee. TIMEOUT and disconnect can mean an uncertain write;
read state first, never blindly repeat a mutation with a new requestId.

## Disable and uninstall

Turn off MYNT's bridge first. Stop the foreground broker and MCP processes.
Remove only the `mynt` entry from the client you configured (Claude Code also
supports `claude mcp remove mynt`; remove the Codex table or OpenCode object).
Remove the exact native-host registration manifest and launcher you installed,
then revoke nativeMessaging access or return to the non-activated extension
build. Leave unrelated host/client entries untouched. Once no broker process
uses it, remove a leftover owned runtime socket/directory if necessary. Deleting
this local-mcp directory removes its source/dependencies, not MYNT user data.
