import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { simpleGit, type SimpleGit } from "simple-git";
import type {
  AnalysisFailedEvent,
  AnalysisStartedEvent,
  Finding,
  FindingsUpdatedEvent,
} from "./api-types.js";
import { FindingsStore } from "./findings-store.js";
import type { Provider } from "./providers/types.js";

export type RepoScopedEvent =
  | Omit<FindingsUpdatedEvent, "repo">
  | Omit<AnalysisStartedEvent, "repo">
  | Omit<AnalysisFailedEvent, "repo">;

export interface AnalysisProgress {
  total: number;
  completed: number;
  startedAt: number;
}

export class Analyzer {
  private git: SimpleGit;
  private progress: AnalysisProgress | null = null;
  private lastAnalysedAt = new Map<string, number>();
  private cancelled = false;

  constructor(
    private repoRoot: string,
    private providers: Provider[],
    private store: FindingsStore,
    private emit: (event: RepoScopedEvent) => void,
    private maxFilesPerRun: number | null = null
  ) {
    this.git = simpleGit(repoRoot);
  }

  setProviders(providers: Provider[]): void {
    this.providers = providers;
  }

  setMaxFilesPerRun(max: number | null): void {
    this.maxFilesPerRun = max;
  }

  getProgress(): AnalysisProgress | null {
    return this.progress;
  }

  cancelAnalysis(): void {
    this.cancelled = true;
  }

  async analyzeFile(absolutePath: string): Promise<void> {
    const relativePath = absolutePath.replace(this.repoRoot, "").replace(/^[/\\]/, "");
    const diff = await this.git.diff(["HEAD", "--", relativePath]);
    if (!diff.trim()) {
      this.store.replaceForFile(relativePath, []);
      this.emit({ type: "findings-updated", file: relativePath });
      return;
    }
    await this.runAnalysis(relativePath, diff);
  }

  /** Re-runs analysis for every file with uncommitted changes (modified, staged, or untracked). */
  async analyzeChangedFiles(): Promise<void> {
    const status = await this.git.status();
    let relativePaths = [
      ...new Set([
        ...status.modified,
        ...status.created,
        ...status.not_added,
        ...status.renamed.map((r) => r.to),
      ]),
    ];

    if (this.maxFilesPerRun && relativePaths.length > this.maxFilesPerRun) {
      relativePaths = relativePaths.slice(0, this.maxFilesPerRun);
    }

    await this.runBatch(relativePaths, async (relativePath) => {
      const diff = await this.git.diff(["HEAD", "--", relativePath]);
      const effectiveDiff = diff.trim() ? diff : await this.buildFullFileDiff(relativePath);
      if (!effectiveDiff.trim()) return;
      await this.runAnalysis(relativePath, effectiveDiff);
    });
  }

  /** Reviews every tracked/untracked (non-ignored) file in the repo from scratch. */
  async analyzeProject(): Promise<void> {
    const status = await this.git.status();
    const changedSet = new Set([
      ...status.modified,
      ...status.created,
      ...status.not_added,
      ...status.renamed.map((r) => r.to),
    ]);

    const output = await this.git.raw(["ls-files", "--cached", "--others", "--exclude-standard"]);
    const allFiles = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const changedFiles = allFiles.filter((f) => changedSet.has(f));
    const otherFiles = allFiles.filter((f) => !changedSet.has(f));

    // Sort non-changed files by last-analysed time ascending (oldest first, never-analysed at top)
    otherFiles.sort((a, b) => {
      const aTime = this.lastAnalysedAt.get(a) ?? 0;
      const bTime = this.lastAnalysedAt.get(b) ?? 0;
      return aTime - bTime;
    });

    // Priority: changed files first, then oldest-analysed
    let relativePaths = [...changedFiles, ...otherFiles];

    if (this.maxFilesPerRun && relativePaths.length > this.maxFilesPerRun) {
      relativePaths = relativePaths.slice(0, this.maxFilesPerRun);
    }

    await this.runBatch(relativePaths, async (relativePath) => {
      const diff = changedSet.has(relativePath)
        ? (await this.git.diff(["HEAD", "--", relativePath])).trim() || await this.buildFullFileDiff(relativePath)
        : await this.buildFullFileDiff(relativePath);
      if (!diff.trim()) return;
      await this.runAnalysis(relativePath, diff);
    });
  }

  private async runBatch(relativePaths: string[], task: (relativePath: string) => Promise<void>): Promise<void> {
    this.cancelled = false;
    this.progress = { total: relativePaths.length, completed: 0, startedAt: Date.now() };
    try {
      await Promise.all(
        relativePaths.map(async (relativePath) => {
          if (this.cancelled) return;
          try {
            await task(relativePath);
          } finally {
            if (this.progress) this.progress.completed += 1;
          }
        })
      );
    } finally {
      this.progress = null;
      this.cancelled = false;
    }
  }

  private async buildFullFileDiff(relativePath: string): Promise<string> {
    const absolutePath = `${this.repoRoot}/${relativePath}`;
    const content = await readFile(absolutePath, "utf-8").catch(() => "");
    if (!content) return "";
    const lines = content.split("\n");
    const body = lines.map((line) => `+${line}`).join("\n");
    return `--- /dev/null\n+++ b/${relativePath}\n@@ -0,0 +1,${lines.length} @@\n${body}`;
  }

  private async runAnalysis(relativePath: string, diff: string): Promise<void> {
    this.emit({ type: "analysis-started", file: relativePath });
    const absolutePath = `${this.repoRoot}/${relativePath}`;
    const fullContent = await readFile(absolutePath, "utf-8").catch(() => "");

    const results = await Promise.allSettled(
      this.providers.map((provider) => provider.analyze({ file: relativePath, diff, fullContent }))
    );

    const findings: Finding[] = [];
    results.forEach((result, index) => {
      const provider = this.providers[index];
      if (result.status === "fulfilled") {
        for (const item of result.value) {
          findings.push({
            ...item,
            id: randomUUID(),
            provider: provider.id,
            dismissed: false,
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        this.emit({
          type: "analysis-failed",
          file: relativePath,
          provider: provider.id,
          error: String(result.reason),
        });
      }
    });

    this.store.replaceForFile(relativePath, findings);
    this.lastAnalysedAt.set(relativePath, Date.now());
    this.emit({ type: "findings-updated", file: relativePath });
  }
}
