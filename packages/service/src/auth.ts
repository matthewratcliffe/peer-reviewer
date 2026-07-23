import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tokenFilePath } from "./ipc-path.js";

export function generateSessionToken(): string {
  const token = randomBytes(32).toString("hex");
  const path = tokenFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, token, { mode: 0o600 });
  return token;
}
