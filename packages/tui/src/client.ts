import { readFileSync, accessSync, copyFileSync, mkdirSync, constants } from "node:fs";
import { request } from "node:http";
import { homedir, userInfo } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync, spawn } from "node:child_process";

function resolveIpcPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\peer-reviewer-${userInfo().username}`;
  }
  return join(homedir(), ".peer-reviewer", "service.sock");
}

function readToken(): string {
  return readFileSync(join(homedir(), ".peer-reviewer", "session.token"), "utf-8").trim();
}

export type Severity = "info" | "low" | "medium" | "high";
export type ProviderId = "codex" | "llama-cpp" | "claude" | "opencode" | "kiro";

export interface Finding {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  category: string;
  title: string;
  message: string;
  provider: ProviderId;
  dismissed: boolean;
  createdAt: string;
}

export interface PeerReviewerConfig {
  activeProvider: ProviderId;
  providers: {
    codex: { command: string; args: string[] };
    llamaCpp: { baseUrl: string };
    claude: { command: string; args: string[] };
    opencode: { command: string; args: string[] };
    kiro: { command: string; args: string[] };
  };
  systemPrompt: { mode: "default" | "append" | "replace"; text: string };
  preCommit: { blockOnFindings: boolean };
  autoAnalyse: { trigger: "disabled" | "on-save" | "periodically"; intervalMinutes: number };
  codingStandardsFolder: string | null;
  maxFilesPerRun: number | null;
  debugLogging: boolean;
}

export interface AnalysisProgress {
  total: number;
  completed: number;
  startedAt: number;
}

function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: resolveIpcPath(),
        path,
        method,
        headers: { "x-peer-reviewer-token": readToken(), "content-type": "application/json" },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk: Buffer) => (responseBody += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`service responded ${res.statusCode}: ${responseBody}`));
            return;
          }
          resolve(JSON.parse(responseBody) as T);
        });
      }
    );
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

export async function registerRepo(path: string): Promise<string> {
  const { repoRoot } = await call<{ repoRoot: string }>("POST", "/repos", { path });
  return repoRoot;
}

export async function getAllFindings(repo: string): Promise<Finding[]> {
  const { findings } = await call<{ findings: Finding[] }>("GET", `/findings?repo=${encodeURIComponent(repo)}`);
  return findings;
}

export function dismissFinding(id: string): Promise<{ ok: boolean }> {
  return call("POST", `/findings/${id}/dismiss`);
}

export function analyzeChanges(repo: string): Promise<{ ok: boolean }> {
  return call("POST", `/analyze?repo=${encodeURIComponent(repo)}`, { scope: "changes" });
}

export function analyzeProject(repo: string): Promise<{ ok: boolean }> {
  return call("POST", `/analyze?repo=${encodeURIComponent(repo)}`, { scope: "project" });
}

export function getAnalysisProgress(repo: string): Promise<AnalysisProgress> {
  return call("GET", `/analyze/progress?repo=${encodeURIComponent(repo)}`);
}

export function getConfig(): Promise<PeerReviewerConfig> {
  return call("GET", "/config");
}

export function updateConfig(config: PeerReviewerConfig): Promise<PeerReviewerConfig> {
  return call("PUT", "/config", config);
}

export function testProvider(config: PeerReviewerConfig): Promise<{ ok: boolean; error?: string }> {
  return call("POST", "/providers/test", config);
}

export function findServiceBinary(): string | null {
  const binName = process.platform === "win32" ? "peer-reviewer-service.exe" : "peer-reviewer-service";
  const installDir = join(homedir(), ".peer-reviewer");
  const installedPath = join(installDir, binName);

  // 1. Check if already installed to ~/.peer-reviewer/
  if (fileExists(installedPath)) return installedPath;

  // 2. Check next to the TUI executable
  const exeDir = dirname(process.execPath);
  const besidePath = join(exeDir, binName);
  if (fileExists(besidePath)) return besidePath;

  // 3. Check current working directory
  const cwdPath = join(process.cwd(), binName);
  if (fileExists(cwdPath)) return cwdPath;

  // 4. Check node_modules/.bin
  const nmPath = join(process.cwd(), "node_modules", ".bin", binName);
  if (fileExists(nmPath)) return nmPath;

  // 5. Check PATH
  const pathDirs = (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":");
  for (const dir of pathDirs) {
    const loc = join(dir, binName);
    if (fileExists(loc)) return loc;
  }

  // 6. Try to extract bundled service binary (pkg asset)
  const bundledPath = join(__dirname, "..", "service-bin", binName);
  try {
    readFileSync(bundledPath);
    // It exists in the pkg snapshot — extract to ~/.peer-reviewer/
    mkdirSync(installDir, { recursive: true });
    copyFileSync(bundledPath, installedPath);
    if (process.platform !== "win32") {
      const { chmodSync } = require("node:fs");
      chmodSync(installedPath, 0o755);
    }
    return installedPath;
  } catch {
    // Not bundled or extraction failed
  }

  return null;
}

function fileExists(path: string): boolean {
  try {
    accessSync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function ensureServiceRunning(): boolean {
  try {
    readToken();
    return true;
  } catch {
    return false;
  }
}

export async function ensureRunningAndRegister(repoPath: string): Promise<string> {
  // Try connecting first
  try {
    return await registerRepo(repoPath);
  } catch {
    // Service not running — try to start it
  }

  const binary = findServiceBinary();
  if (!binary) {
    throw new Error("peer-reviewer-service binary not found. Is the service installed?");
  }

  const proc = spawn(binary, [], {
    detached: true,
    stdio: "ignore",
    ...(process.platform === "win32" ? { windowsHide: true } : {}),
  });
  proc.unref();

  // Poll for up to 10 seconds
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      return await registerRepo(repoPath);
    } catch {
      // not ready yet
    }
  }
  throw new Error("Failed to start peer-reviewer-service within 10 seconds");
}
