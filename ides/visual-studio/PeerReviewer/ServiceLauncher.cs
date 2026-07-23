using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

namespace PeerReviewer
{
    public static class ServiceLauncher
    {
        private const int ConnectRetryMs = 300;
        private const int ConnectTimeoutMs = 15000;

        private static readonly string HomeDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".peer-reviewer");

        private static readonly string LockFilePath = Path.Combine(HomeDir, "launch.lock");

        public static string EnsureRunningAndRegister(IpcClient client, string repoPath)
        {
            var result = TryRegister(client, repoPath);
            if (result != null)
                return result;

            Directory.CreateDirectory(HomeDir);

            using (var lockStream = new FileStream(LockFilePath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None))
            {
                result = TryRegister(client, repoPath);
                if (result != null)
                    return result;

                SpawnService();
            }

            return WaitUntilRegistered(client, repoPath);
        }

        private static string TryRegister(IpcClient client, string repoPath)
        {
            try
            {
                return client.RegisterRepo(repoPath);
            }
            catch
            {
                return null;
            }
        }

        private static string WaitUntilRegistered(IpcClient client, string repoPath)
        {
            var deadline = Environment.TickCount + ConnectTimeoutMs;
            while (Environment.TickCount < deadline)
            {
                var result = TryRegister(client, repoPath);
                if (result != null)
                    return result;
                Thread.Sleep(ConnectRetryMs);
            }
            throw new TimeoutException(
                $"peer-reviewer-service did not become reachable within {ConnectTimeoutMs}ms");
        }

        private static void SpawnService()
        {
            var binaryPath = ResolveServiceBinaryPath();
            if (!File.Exists(binaryPath))
                throw new FileNotFoundException($"bundled service binary not found at {binaryPath}");

            var logFile = Path.Combine(HomeDir, "service.log");

            var startInfo = new ProcessStartInfo
            {
                FileName = binaryPath,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            var process = Process.Start(startInfo);
            if (process != null)
            {
                // Redirect output to log file asynchronously
                var logWriter = new StreamWriter(logFile, append: true) { AutoFlush = true };
                process.OutputDataReceived += (s, e) => { if (e.Data != null) logWriter.WriteLine(e.Data); };
                process.ErrorDataReceived += (s, e) => { if (e.Data != null) logWriter.WriteLine(e.Data); };
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
            }
        }

        private static string ResolveServiceBinaryPath()
        {
            // Look relative to the extension assembly location
            var assemblyDir = Path.GetDirectoryName(typeof(ServiceLauncher).Assembly.Location) ?? "";

            // The binary is at ../../dist-bin/peer-reviewer-service.exe relative to ides/visual-studio/PeerReviewer
            // From the installed extension location, try several resolution strategies:
            // 1. Adjacent dist-bin folder (development layout)
            var devPath = Path.GetFullPath(Path.Combine(assemblyDir, "..", "..", "..", "..", "dist-bin", "peer-reviewer-service.exe"));
            if (File.Exists(devPath))
                return devPath;

            // 2. Bundled inside the extension's own folder
            var bundledPath = Path.Combine(assemblyDir, "peer-reviewer-service.exe");
            if (File.Exists(bundledPath))
                return bundledPath;

            // 3. In the user's .peer-reviewer directory
            var homePath = Path.Combine(HomeDir, "peer-reviewer-service.exe");
            if (File.Exists(homePath))
                return homePath;

            // 4. On the system PATH
            var pathDirs = Environment.GetEnvironmentVariable("PATH")?.Split(';') ?? new string[0];
            foreach (var dir in pathDirs)
            {
                var candidate = Path.Combine(dir.Trim(), "peer-reviewer-service.exe");
                if (File.Exists(candidate))
                    return candidate;
            }

            return bundledPath;
        }
    }
}
