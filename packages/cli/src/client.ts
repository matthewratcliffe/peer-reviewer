import { readFileSync } from "node:fs";
import { request } from "node:http";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

function resolveIpcPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\review-notes-${userInfo().username}`;
  }
  return join(homedir(), ".review-notes", "service.sock");
}

function readToken(): string {
  return readFileSync(join(homedir(), ".review-notes", "session.token"), "utf-8").trim();
}

export interface Finding {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: "info" | "low" | "medium" | "high";
  category: string;
  title: string;
  message: string;
  provider: string;
  dismissed: boolean;
}

function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: resolveIpcPath(),
        path,
        method,
        headers: { "x-review-notes-token": readToken(), "content-type": "application/json" },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk) => (responseBody += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`review-notes-service responded ${res.statusCode}: ${responseBody}`));
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

export async function getAllFindings(repo: string): Promise<{ findings: Finding[] }> {
  return call("GET", `/findings?repo=${encodeURIComponent(repo)}`);
}

export function dismissFinding(id: string): Promise<{ ok: boolean }> {
  return call("POST", `/findings/${id}/dismiss`);
}

export interface ReviewNotesConfig {
  activeProvider: "codex" | "llama-cpp" | "claude";
  providers: {
    codex: { command: string; args: string[] };
    llamaCpp: { baseUrl: string };
    claude: { command: string; args: string[] };
  };
  systemPrompt: { mode: "default" | "append" | "replace"; text: string };
  preCommit: { blockOnFindings: boolean };
}

export function getConfig(): Promise<ReviewNotesConfig> {
  return call("GET", "/config");
}
