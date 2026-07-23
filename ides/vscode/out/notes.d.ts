import type { Finding } from "./ipc-client";
export declare function loadNote(repoRoot: string, finding: Finding): string;
export declare function saveNote(repoRoot: string, finding: Finding, content: string): void;
