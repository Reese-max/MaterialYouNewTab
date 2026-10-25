# Windows local MCP: staged source, not activated

The user's Windows route is implemented in source, but **Windows compilation,
real ACL enforcement, cross-user rejection and browser-native integration have
not yet been verified**. This Linux implementation workspace contains neither
`dotnet` nor PowerShell. Passing JavaScript simulations is not evidence that a
Windows helper executable exists or works. Do not activate or ship this route
until the validation checklist below is completed in an approved environment.
No host registration, registry editing, permission grant, client setup, service,
scheduled task, startup item, UAC change or execution-policy change was performed.

## Security architecture

Node's ordinary Windows named-pipe listener is deliberately not used: the
implementation needs an explicit ACL rather than a default security descriptor.
`windows/Program.cs` is a small .NET helper, with no third-party package references.
The broker launches that helper as a foreground child using its fixed, reviewed
path. Client/native relays use the same helper; they do not bypass its checks.

The Windows server constructs a protected DACL with one allow entry for the
actual current user SID and sets that SID as owner. It rejects network pipe
clients, uses first-instance protection, and keeps a listener alive throughout
the broker session. The pipe name includes the SID and local Windows session.
Every client verifies the owner of the connected pipe handle before sending
application data. Clients connect only to the local machine and use
Identification-level impersonation. Elevated administrators and SYSTEM are
rejected, rather than relaxing permissions to make mismatched sessions work.

This isolates different unprivileged OS users, not hostile processes under the
same user identity; administrators capable of overriding OS security are also
outside this boundary. A same-user process can connect or impersonate a peer.
Only enable trusted clients and turn the browser bridge off when finished.
The implementation does not use token Owner as the user identity and does not
rely on the `CurrentUserOnly` flag alone.

Node and the broker helper exchange bounded length-prefixed multiplex messages.
Each peer has its own decoder; maximum pipe instances are 32, including the
reserved listener (at most 31 connected clients). Frames remain limited to
512 KiB. Multiplex chunks are 32 KiB; writes have deadlines, invalid peer IDs
and oversized chunks fail closed. Existing schema validation, mutation revisions,
request-ID replay rules, private-read switches and write opt-in still apply.
No successful/private result is cached in the broker.

## Build only, before activation

Use an already installed, trusted .NET 8 SDK and Node 22+ in a normal,
non-administrator terminal. If either is missing, installing it requires the
appropriate separate approval; these instructions do not install software.
Review source first. From `local-mcp`:

```powershell
dotnet publish .\windows\MyntPipe.csproj -c Release -r win-x64 --self-contained false -o .\windows\bin
.\windows\bin\MyntPipe.exe selftest
node --test .\test\windows-ipc.test.mjs
npm test
```

For an ARM64 machine, explicitly choose `win-arm64` instead. Do not copy an
unverified binary from another source. Keep the publish directory intact:
framework-dependent publishing also creates the DLL, deps and runtimeconfig
files. Output is ignored by Git. Builds do not register or enable anything.

The helper `selftest` uses a random test-only pipe name and checks the actual
owner/protected single-user ACL, first-instance rejection and bidirectional
framed messages. It performs no registry or browser changes. Its success alone
does not prove cross-account or live-browser behavior.

## Validation gates before release

1. Build with warnings as errors. Run the actual helper selftest as the normal
   user. Inspect its real DACL and verify no Everyone, Anonymous or broad group
   grants. Do not replace these checks with source-text assertions.
2. Test a second ordinary Windows account cannot connect to the first account's
   endpoint. Verify an unrelated-user pipe with a colliding name is rejected by
   owner verification. Verify remote-machine connections fail. Account creation,
   credentials or session changes require separately authorized test setup.
3. Run multiple real MCP SDK stdio clients through the broker. Verify one browser
   authority, schema failure, conflict, timeout, duplicate suppression, private
   access revocation, browser exit and broker restart. A timeout can mean a write
   already happened; read state before a new request ID.
4. Verify an elevated helper fails closed. Do not run the broker as a service or
   administrator, weaken ACLs, change UAC or enable anonymous named-pipe access.
5. Only after explicit native-host/permission approval, verify Chrome and Firefox
   separately using the actual registered extension IDs. The live extension
   manifests still do not silently grant nativeMessaging.

## Activation after explicit approval

Native-host registration creates persistent access and is a distinct approval
step. Do not run it merely because implementation was requested.

1. Keep the reviewed helper and checkout in a stable, user-controlled directory.
   Use the fixed `local-mcp\windows\bin\MyntPipe.exe` location expected by Node.
2. Copy the applicable `templates/windows-*-host.json.example` to a real JSON
   manifest outside the extension package. Replace only verified absolute paths
   and the exact extension/add-on ID. Never use wildcard origins. The manifest
   points directly at the helper executable, not a shell command. Its default
   mode is a bounded native-messaging relay; no extra launcher is needed.
3. Inspect and, after approval, create only the appropriate current-user native
   host registration. `templates/windows-registration.txt.example` lists the
   Chrome and Firefox HKCU key/value shapes. Do not overwrite existing unrelated
   entries or use HKLM. These templates are inert text, not installer scripts.
4. Start the broker manually with the reviewed absolute Node/script paths. The
   optional `.cmd.example` is an inert foreground-launcher template, not an
   auto-start mechanism. All participants must use the same non-elevated Windows
   account and session. `MYNT_MCP_RUNTIME` is Unix-only and is ignored on Windows.
5. Approve the exact browser nativeMessaging permission/build, open one MYNT tab,
   click Connect, and keep writes/private reads off until intentionally enabled.
6. Configure only the chosen MCP client after approval. The stdio command is the
   absolute Node path plus the absolute `local-mcp\server.mjs` argument, not the
   helper executable. Existing README client schemas apply. JSON backslashes
   must be escaped. For example, an OpenCode command array is:

```json
["C:\\Program Files\\nodejs\\node.exe", "C:\\APPROVED\\mynt-daily\\local-mcp\\server.mjs"]
```

If a helper is missing, unsafe, mismatched in elevation/session, or offline, the
bridge returns explicit unavailable/offline errors. Do not disable a security
check or silently switch to TCP to make it work.

## Disable and uninstall

Disconnect in MYNT first; disable writes/private reads. Stop the foreground
broker and client processes, which also closes the Windows pipe handles. Remove
only the `mynt` entry from whichever AI client was approved. After approval,
remove only the exact `io.mynt.local_mcp` HKCU native-host registration created
for this installation and its manifest; leave other hosts untouched. Revoke the
browser permission or return to the non-activated extension build. Delete the
reviewed helper publish directory/source only if no longer needed. No MYNT user
data is deleted and there is no installed service or startup item to remove.

## Official references, reviewed 2026-10-24

- [Windows named-pipe security](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights): default ACLs are not a same-user-only guarantee.
- [CreateNamedPipe](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createnamedpipea): explicit security attributes, first-instance and local-only flags.
- [GetSecurityInfo](https://learn.microsoft.com/en-us/windows/win32/api/aclapi/nf-aclapi-getsecurityinfo): handle-based owner/security inspection.
- [.NET named-pipe stream](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.namedpipeserverstream): async stream and safe-handle integration.
- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) and [Firefox native manifests](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests): browser registration and exact extension allowlists.
