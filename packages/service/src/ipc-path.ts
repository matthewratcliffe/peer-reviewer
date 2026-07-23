import { homedir, userInfo } from "node:os";
import { join } from "node:path";

export function resolveIpcPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\review-notes-${userInfo().username}`;
  }
  return join(homedir(), ".review-notes", "service.sock");
}

export function tokenFilePath(): string {
  return join(homedir(), ".review-notes", "session.token");
}
