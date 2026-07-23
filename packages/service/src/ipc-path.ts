import { homedir, userInfo } from "node:os";
import { join } from "node:path";

export function resolveIpcPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\peer-reviewer-${userInfo().username}`;
  }
  return join(homedir(), ".peer-reviewer", "service.sock");
}

export function tokenFilePath(): string {
  return join(homedir(), ".peer-reviewer", "session.token");
}
