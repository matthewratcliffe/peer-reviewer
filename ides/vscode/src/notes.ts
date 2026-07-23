import * as fs from "fs";
import * as path from "path";
import type { Finding } from "./ipc-client";

function notesDir(repoRoot: string): string {
  return path.join(repoRoot, ".peer-review", "notes");
}

function sanitize(str: string): string {
  return str.replace(/[^a-zA-Z0-9_\-\.]/g, "_").slice(0, 100);
}

function noteFileForFinding(repoRoot: string, finding: Finding): string {
  const filePart = sanitize(path.basename(finding.file));
  const linePart = `L${finding.startLine}`;
  const catPart = sanitize(finding.category);
  const filename = `${filePart}_${linePart}_${catPart}.md`;
  return path.join(notesDir(repoRoot), filename);
}

export function loadNote(repoRoot: string, finding: Finding): string {
  const filePath = noteFileForFinding(repoRoot, finding);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

export function saveNote(repoRoot: string, finding: Finding, content: string): void {
  const dir = notesDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = noteFileForFinding(repoRoot, finding);
  fs.writeFileSync(filePath, content, "utf-8");
}
