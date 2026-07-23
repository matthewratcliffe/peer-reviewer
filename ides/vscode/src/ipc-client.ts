import * as net from "net";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

export type Severity = "info" | "low" | "medium" | "high";

export type ProviderId = "codex" | "llama-cpp" | "claude" | "opencode" | "kiro";

export type ReviewCategory =
  | "correctness"
  | "security"
  | "penetration-testing"
  | "naming"
  | "best-practice"
  | "unintended-consequence"
  | "error-handling"
  | "performance"
  | "concurrency"
  | "resource-leak"
  | "test-coverage"
  | "api-contract"
  | "maintainability";

export interface Finding {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  category: ReviewCategory;
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
  maxFilesPerRun: number | null;
  debugLogging: boolean;
}

export interface AnalysisProgress {
  total: number;
  completed: number;
  startedAt: number;
}

function resolveIpcPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\peer-reviewer-${os.userInfo().username}`;
  }
  return path.join(os.homedir(), ".peer-reviewer", "service.sock");
}

function readToken(): string {
  const tokenPath = path.join(os.homedir(), ".peer-reviewer", "session.token");
  try {
    return fs.readFileSync(tokenPath, "utf-8").trim();
  } catch {
    return "";
  }
}

interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export class IpcClient {
  private ipcPath: string;
  private token: string;

  constructor() {
    this.ipcPath = resolveIpcPath();
    this.token = readToken();
  }

  refreshToken(): void {
    this.token = readToken();
  }

  async request(method: string, urlPath: string, body?: unknown): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.ipcPath, () => {
        const bodyStr = body !== undefined ? JSON.stringify(body) : "";
        const lines: string[] = [
          `${method} ${urlPath} HTTP/1.1`,
          `Host: localhost`,
          `x-peer-reviewer-token: ${this.token}`,
          `Content-Type: application/json`,
          `Content-Length: ${Buffer.byteLength(bodyStr)}`,
          `Connection: close`,
          ``,
          bodyStr,
        ];
        socket.write(lines.join("\r\n"));
      });

      let data = "";
      socket.on("data", (chunk) => {
        data += chunk.toString();
      });

      socket.on("end", () => {
        const headerEnd = data.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          reject(new Error("Invalid HTTP response from service"));
          return;
        }
        const headerSection = data.slice(0, headerEnd);
        const responseBody = data.slice(headerEnd + 4);

        const statusLine = headerSection.split("\r\n")[0];
        const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;

        const headers: Record<string, string> = {};
        const headerLines = headerSection.split("\r\n").slice(1);
        for (const line of headerLines) {
          const colonIdx = line.indexOf(":");
          if (colonIdx > 0) {
            headers[line.slice(0, colonIdx).toLowerCase().trim()] = line.slice(colonIdx + 1).trim();
          }
        }

        // Handle chunked transfer encoding
        let finalBody = responseBody;
        if (headers["transfer-encoding"]?.includes("chunked")) {
          finalBody = decodeChunked(responseBody);
        }

        resolve({ statusCode, headers, body: finalBody });
      });

      socket.on("error", (err) => {
        reject(err);
      });

      socket.setTimeout(120000, () => {
        socket.destroy();
        reject(new Error("IPC request timed out"));
      });
    });
  }

  async registerRepo(repoPath: string): Promise<{ repoRoot: string }> {
    const resp = await this.request("POST", "/repos", { path: repoPath });
    if (resp.statusCode !== 200) {
      throw new Error(`registerRepo failed (${resp.statusCode}): ${resp.body}`);
    }
    return JSON.parse(resp.body);
  }

  async getAllFindings(repoRoot: string): Promise<Finding[]> {
    const resp = await this.request("GET", `/findings?repo=${encodeURIComponent(repoRoot)}`);
    if (resp.statusCode !== 200) {
      throw new Error(`getAllFindings failed (${resp.statusCode}): ${resp.body}`);
    }
    return JSON.parse(resp.body).findings;
  }

  async analyzeChanges(repoRoot: string): Promise<void> {
    const resp = await this.request("POST", `/analyze?repo=${encodeURIComponent(repoRoot)}`, { scope: "changes" });
    if (resp.statusCode !== 200) {
      throw new Error(`analyzeChanges failed (${resp.statusCode}): ${resp.body}`);
    }
  }

  async analyzeProject(repoRoot: string): Promise<void> {
    const resp = await this.request("POST", `/analyze?repo=${encodeURIComponent(repoRoot)}`, { scope: "project" });
    if (resp.statusCode !== 200) {
      throw new Error(`analyzeProject failed (${resp.statusCode}): ${resp.body}`);
    }
  }

  async getAnalysisProgress(repoRoot: string): Promise<AnalysisProgress> {
    const resp = await this.request("GET", `/analyze/progress?repo=${encodeURIComponent(repoRoot)}`);
    if (resp.statusCode !== 200) {
      throw new Error(`getAnalysisProgress failed (${resp.statusCode}): ${resp.body}`);
    }
    return JSON.parse(resp.body);
  }

  async cancelAnalysis(repoRoot: string): Promise<void> {
    const resp = await this.request("POST", `/analyze/cancel?repo=${encodeURIComponent(repoRoot)}`);
    if (resp.statusCode !== 200 && resp.statusCode !== 204) {
      throw new Error(`cancelAnalysis failed (${resp.statusCode}): ${resp.body}`);
    }
  }

  async getConfig(): Promise<PeerReviewerConfig> {
    const resp = await this.request("GET", "/config");
    if (resp.statusCode !== 200) {
      throw new Error(`getConfig failed (${resp.statusCode}): ${resp.body}`);
    }
    return JSON.parse(resp.body);
  }

  async updateConfig(config: PeerReviewerConfig): Promise<void> {
    const resp = await this.request("PUT", "/config", config);
    if (resp.statusCode !== 200 && resp.statusCode !== 204) {
      throw new Error(`updateConfig failed (${resp.statusCode}): ${resp.body}`);
    }
  }

  async testProvider(config: PeerReviewerConfig): Promise<{ ok: boolean; error?: string }> {
    const resp = await this.request("POST", "/providers/test", config);
    if (resp.statusCode === 200) {
      return JSON.parse(resp.body);
    }
    if (resp.statusCode === 502) {
      return JSON.parse(resp.body);
    }
    throw new Error(`testProvider failed (${resp.statusCode}): ${resp.body}`);
  }

  async dismissFinding(findingId: string): Promise<void> {
    const resp = await this.request("POST", `/findings/${findingId}/dismiss`);
    if (resp.statusCode !== 200 && resp.statusCode !== 204) {
      throw new Error(`dismissFinding failed (${resp.statusCode}): ${resp.body}`);
    }
  }
}

function decodeChunked(raw: string): string {
  let result = "";
  let pos = 0;
  while (pos < raw.length) {
    const lineEnd = raw.indexOf("\r\n", pos);
    if (lineEnd === -1) break;
    const sizeStr = raw.slice(pos, lineEnd).trim();
    const size = parseInt(sizeStr, 16);
    if (isNaN(size) || size === 0) break;
    const chunkStart = lineEnd + 2;
    result += raw.slice(chunkStart, chunkStart + size);
    pos = chunkStart + size + 2;
  }
  return result;
}
