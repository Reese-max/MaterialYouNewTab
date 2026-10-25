// Source-only security boundary. No installer, registry edits or permission grants.
using System.Collections.Concurrent;
using System.ComponentModel;
using System.Diagnostics;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Security.AccessControl;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

internal static class Program
{
    private const int MaxFrame = 512 * 1024;
    private const int MaxPeers = 32;
    private static readonly Stream Input = Console.OpenStandardInput();
    private static readonly Stream Output = Console.OpenStandardOutput();
    private static readonly SemaphoreSlim OutputLock = new(1, 1);
    private static readonly CancellationTokenSource Stop = new();
    private static readonly ConcurrentDictionary<string, NamedPipeServerStream> Peers = new();
    private static string Sid = "";
    private static string PipeName = "";

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes { public int Length; public IntPtr Descriptor; [MarshalAs(UnmanagedType.Bool)] public bool Inherit; }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string text, uint revision, out IntPtr descriptor, out uint size);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafePipeHandle CreateNamedPipeW(string name, uint openMode, uint mode, uint instances, uint outSize, uint inSize, uint timeout, ref SecurityAttributes security);
    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern uint GetSecurityInfo(SafePipeHandle handle, int objectType, uint information, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll")]
    private static extern uint GetSecurityDescriptorLength(IntPtr descriptor);
    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    private static void InitializeIdentity()
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Windows helper only.");
        using var identity = WindowsIdentity.GetCurrent();
        if (identity.IsSystem || identity.IsAnonymous || new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
            throw new UnauthorizedAccessException("Run as the normal non-elevated browser user, never Administrator or SYSTEM.");
        Sid = identity.User?.Value ?? throw new UnauthorizedAccessException("Missing user SID.");
        PipeName = "mynt-local-mcp-v1-" + Sid + "-" + Process.GetCurrentProcess().SessionId;
    }
    private static NamedPipeServerStream CreateServer(bool first)
    {
        // Protected DACL, exactly one grant to this actual user SID, not the
        // token Owner (which can be a shared Administrators group).
        string sddl = "O:" + Sid + "D:P(A;;GA;;;" + Sid + ")";
        if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, out var descriptor, out _)) throw new Win32Exception(Marshal.GetLastWin32Error());
        try
        {
            var attributes = new SecurityAttributes { Length = Marshal.SizeOf<SecurityAttributes>(), Descriptor = descriptor, Inherit = false };
            const uint Duplex = 0x3, Overlapped = 0x40000000, FirstInstance = 0x00080000, RejectRemoteClients = 0x8;
            var handle = CreateNamedPipeW(@"\\.\pipe\" + PipeName, Duplex | Overlapped | (first ? FirstInstance : 0), RejectRemoteClients, MaxPeers, 65536, 65536, 0, ref attributes);
            if (handle.IsInvalid) { int error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new Win32Exception(error); }
            try { return new NamedPipeServerStream(PipeDirection.InOut, true, false, handle); }
            catch { handle.Dispose(); throw; }
        }
        finally { LocalFree(descriptor); }
    }
    private static void VerifyOwner(SafePipeHandle handle)
    {
        // Verify the connected handle, not a pathname that can be replaced.
        uint error = GetSecurityInfo(handle, 6 /* SE_KERNEL_OBJECT */, 1 /* OWNER_SECURITY_INFORMATION */, out var owner, out _, out _, out _, out var descriptor);
        if (error != 0) throw new Win32Exception((int)error);
        try { if (owner == IntPtr.Zero || new SecurityIdentifier(owner).Value != Sid) throw new UnauthorizedAccessException("Pipe server owner differs from current user."); }
        finally { LocalFree(descriptor); }
    }
    private static async Task<NamedPipeClientStream> Connect()
    {
        // Identification prevents a malicious same-user endpoint impersonating
        // the caller. Host is fixed '.', never a remote machine.
        var pipe = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
        try { await pipe.ConnectAsync(3000, Stop.Token); VerifyOwner(pipe.SafePipeHandle); return pipe; }
        catch { pipe.Dispose(); throw; }
    }
    private static async Task<byte[]?> ReadFrame(Stream stream, CancellationToken token)
    {
        byte[] header = new byte[4];
        int first = await stream.ReadAsync(header.AsMemory(0, 4), token);
        if (first == 0) return null;
        await stream.ReadExactlyAsync(header.AsMemory(first, 4 - first), token);
        uint length = System.Buffers.Binary.BinaryPrimitives.ReadUInt32LittleEndian(header);
        if (length == 0 || length > MaxFrame) throw new InvalidDataException("Frame exceeds bound.");
        byte[] body = new byte[(int)length]; await stream.ReadExactlyAsync(body, token);
        return body;
    }
    private static async Task WriteFrame(Stream stream, byte[] bytes, CancellationToken token)
    {
        if (bytes.Length == 0 || bytes.Length > MaxFrame) throw new InvalidDataException("Frame exceeds bound.");
        byte[] header = new byte[4]; System.Buffers.Binary.BinaryPrimitives.WriteUInt32LittleEndian(header, (uint)bytes.Length);
        await stream.WriteAsync(header, token); await stream.WriteAsync(bytes, token); await stream.FlushAsync(token);
    }
    private static async Task Emit(object message)
    {
        byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(message);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(Stop.Token); deadline.CancelAfter(10000);
        await OutputLock.WaitAsync(deadline.Token);
        try { await WriteFrame(Output, bytes, deadline.Token); }
        catch { Stop.Cancel(); throw; } // A partial shared frame invalidates the whole multiplex stream.
        finally { OutputLock.Release(); }
    }
    private static async Task Relay(bool native)
    {
        using var pipe = await Connect();
        if (!native) Console.Error.WriteLine("MYNT_PIPE_CONNECTED");
        if (native) await WriteFrame(pipe, JsonSerializer.SerializeToUtf8Bytes(new { kind = "hello", role = "browser" }), Stop.Token);
        async Task CopyFrames(Stream from, Stream to)
        {
            while (!Stop.IsCancellationRequested)
            {
                byte[]? bytes = await ReadFrame(from, Stop.Token); if (bytes is null) return;
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(Stop.Token); deadline.CancelAfter(10000);
                await WriteFrame(to, bytes, deadline.Token);
            }
        }
        await await Task.WhenAny(CopyFrames(Input, pipe), CopyFrames(pipe, Output));
        Stop.Cancel();
    }
    private static void Drop(string id)
    {
        if (Peers.TryRemove(id, out var pipe)) pipe.Dispose();
    }
    private static async Task Pump(string id, NamedPipeServerStream pipe)
    {
        try
        {
            byte[] buffer = new byte[32768];
            while (!Stop.IsCancellationRequested)
            {
                int count = await pipe.ReadAsync(buffer, Stop.Token); if (count == 0) break;
                await Emit(new { kind = "data", id, data = Convert.ToBase64String(buffer, 0, count) });
            }
        }
        catch (Exception error) when (error is IOException or OperationCanceledException or ObjectDisposedException) { }
        finally { Drop(id); if (!Stop.IsCancellationRequested) try { await Emit(new { kind = "close", id }); } catch { Stop.Cancel(); } }
    }
    private static async Task Commands()
    {
        while (!Stop.IsCancellationRequested)
        {
            byte[]? bytes = await ReadFrame(Input, Stop.Token); if (bytes is null) return;
            using var doc = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 8 });
            var root = doc.RootElement;
            string id = root.GetProperty("id").GetString() ?? "";
            if (id.Length != 32 || id.Any(c => !Uri.IsHexDigit(c))) throw new InvalidDataException("Invalid peer ID.");
            string? kind = root.GetProperty("kind").GetString();
            if (kind == "close") { Drop(id); continue; }
            if (kind != "data") throw new InvalidDataException("Invalid multiplex command.");
            string data = root.GetProperty("data").GetString() ?? "";
            if (data.Length > 45000) throw new InvalidDataException("Multiplex data too large.");
            byte[] raw = Convert.FromBase64String(data);
            if (raw.Length > 32768) throw new InvalidDataException("Multiplex data too large.");
            if (!Peers.TryGetValue(id, out var pipe)) continue;
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(Stop.Token); deadline.CancelAfter(10000);
            try { await pipe.WriteAsync(raw, deadline.Token); await pipe.FlushAsync(deadline.Token); }
            catch (Exception error) when (error is IOException or OperationCanceledException or ObjectDisposedException) { Drop(id); }
        }
    }
    private static async Task Broker()
    {
        // Keep an unconnected listener alive while peers come and go, so the
        // original pipe namespace is continuously owned until broker shutdown.
        NamedPipeServerStream? listener = CreateServer(true);
        var pumps = new List<Task>();
        Task commands = Commands();
        try
        {
            await Emit(new { kind = "ready" });
            while (!Stop.IsCancellationRequested)
            {
                Task connection = listener.WaitForConnectionAsync(Stop.Token);
                if (await Task.WhenAny(connection, commands) == commands) { await commands; break; }
                await connection;
                var connected = listener;
                // Reserve one instance for the listener. Excess peers fail closed.
                if (Peers.Count >= MaxPeers - 1) { connected.Disconnect(); continue; } // Reuse the listener handle: never relinquish namespace ownership at capacity.
                listener = CreateServer(false);
                string id = Guid.NewGuid().ToString("N"); Peers[id] = connected;
                await Emit(new { kind = "open", id }); pumps.RemoveAll(t => t.IsCompleted); pumps.Add(Pump(id, connected));
            }
        }
        finally
        {
            Stop.Cancel(); listener?.Dispose(); foreach (var id in Peers.Keys) Drop(id);
            try { await Task.WhenAll(pumps); } catch { }
        }
    }
    private static async Task SelfTest()
    {
        // Isolated random endpoint, never the live browser/broker endpoint.
        PipeName += "-test-" + Guid.NewGuid().ToString("N");
        using var server = CreateServer(true);
        uint result = GetSecurityInfo(server.SafePipeHandle, 6, 5, out _, out _, out _, out _, out var descriptor);
        if (result != 0) throw new Win32Exception((int)result);
        try
        {
            byte[] binary = new byte[GetSecurityDescriptorLength(descriptor)]; Marshal.Copy(descriptor, binary, 0, binary.Length);
            var security = new RawSecurityDescriptor(binary, 0);
            var acl = security.DiscretionaryAcl;
            if (security.Owner?.Value != Sid || !security.ControlFlags.HasFlag(ControlFlags.DiscretionaryAclProtected) || acl is null || acl.Count != 1)
                throw new UnauthorizedAccessException("ACL self-test failed.");
            if (acl[0] is not CommonAce ace || ace.AceQualifier != AceQualifier.AccessAllowed || ace.SecurityIdentifier.Value != Sid)
                throw new UnauthorizedAccessException("ACL must grant only the current user.");
        }
        finally { LocalFree(descriptor); }
        bool duplicateRejected = false;
        try { using var duplicate = CreateServer(true); } catch (Win32Exception) { duplicateRejected = true; }
        if (!duplicateRejected) throw new InvalidDataException("First-instance protection failed.");
        Task waiting = server.WaitForConnectionAsync(Stop.Token);
        using var client = await Connect(); await waiting;
        byte[] sample = JsonSerializer.SerializeToUtf8Bytes(new { test = "same-user-roundtrip" });
        await WriteFrame(client, sample, Stop.Token);
        byte[]? received = await ReadFrame(server, Stop.Token);
        if (received is null || !sample.SequenceEqual(received)) throw new InvalidDataException("Roundtrip failed.");
        await WriteFrame(server, received, Stop.Token);
        byte[]? response = await ReadFrame(client, Stop.Token);
        if (response is null || !sample.SequenceEqual(response)) throw new InvalidDataException("Return roundtrip failed.");
        Console.Error.WriteLine("Windows isolated ACL/owner/first-instance/frame self-test passed. Cross-user/live-browser checks still required.");
    }
    public static async Task<int> Main(string[] args)
    {
        bool native = args.Length == 0 || (args[0] != "broker" && args[0] != "relay" && args[0] != "selftest");
        try { InitializeIdentity(); if (!native && args[0] == "broker") await Broker(); else if (!native && args[0] == "selftest") await SelfTest(); else await Relay(native); return 0; }
        catch (Exception)
        {
            // Avoid including paths, SID, browser data, or stack traces in protocol errors.
            if (native) try { await WriteFrame(Output, JsonSerializer.SerializeToUtf8Bytes(new { kind = "bridge_error", ok = false, error = new { code = "BROKER_OFFLINE", message = "Approved Windows broker unavailable, unsafe, or running at a different elevation/session." } }), CancellationToken.None); } catch { }
            Console.Error.WriteLine("MYNT Windows pipe unavailable or security verification failed."); return 1;
        }
        finally { Stop.Cancel(); foreach (var id in Peers.Keys) Drop(id); }
    }
}
