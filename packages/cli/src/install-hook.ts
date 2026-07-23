import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

export function installHook(): void {
  const repoRoot = execSync("git rev-parse --show-toplevel").toString().trim();
  const hooksDir = join(repoRoot, ".git", "hooks");
  const target = join(hooksDir, "pre-commit");
  const source = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "pre-commit");

  if (existsSync(target)) {
    throw new Error(`${target} already exists. Remove it or merge peer-reviewer' hook manually.`);
  }

  mkdirSync(hooksDir, { recursive: true });
  copyFileSync(source, target);
  chmodSync(target, 0o755);
  console.log(`peer-reviewer: installed pre-commit hook at ${target}`);
}
