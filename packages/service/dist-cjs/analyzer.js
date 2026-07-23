"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Analyzer = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const simple_git_1 = require("simple-git");
class Analyzer {
    repoRoot;
    providers;
    store;
    emit;
    maxFilesPerRun;
    git;
    progress = null;
    lastAnalysedAt = new Map();
    cancelled = false;
    constructor(repoRoot, providers, store, emit, maxFilesPerRun = null) {
        this.repoRoot = repoRoot;
        this.providers = providers;
        this.store = store;
        this.emit = emit;
        this.maxFilesPerRun = maxFilesPerRun;
        this.git = (0, simple_git_1.simpleGit)(repoRoot);
    }
    setProviders(providers) {
        this.providers = providers;
    }
    setMaxFilesPerRun(max) {
        this.maxFilesPerRun = max;
    }
    getProgress() {
        return this.progress;
    }
    cancelAnalysis() {
        this.cancelled = true;
    }
    async analyzeFile(absolutePath) {
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
    async analyzeChangedFiles() {
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
            if (!effectiveDiff.trim())
                return;
            await this.runAnalysis(relativePath, effectiveDiff);
        });
    }
    /** Reviews every tracked/untracked (non-ignored) file in the repo from scratch. */
    async analyzeProject() {
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
            if (!diff.trim())
                return;
            await this.runAnalysis(relativePath, diff);
        });
    }
    async runBatch(relativePaths, task) {
        this.cancelled = false;
        this.progress = { total: relativePaths.length, completed: 0, startedAt: Date.now() };
        try {
            await Promise.all(relativePaths.map(async (relativePath) => {
                if (this.cancelled)
                    return;
                try {
                    await task(relativePath);
                }
                finally {
                    if (this.progress)
                        this.progress.completed += 1;
                }
            }));
        }
        finally {
            this.progress = null;
            this.cancelled = false;
        }
    }
    async buildFullFileDiff(relativePath) {
        const absolutePath = `${this.repoRoot}/${relativePath}`;
        const content = await (0, promises_1.readFile)(absolutePath, "utf-8").catch(() => "");
        if (!content)
            return "";
        const lines = content.split("\n");
        const body = lines.map((line) => `+${line}`).join("\n");
        return `--- /dev/null\n+++ b/${relativePath}\n@@ -0,0 +1,${lines.length} @@\n${body}`;
    }
    async runAnalysis(relativePath, diff) {
        this.emit({ type: "analysis-started", file: relativePath });
        const absolutePath = `${this.repoRoot}/${relativePath}`;
        const fullContent = await (0, promises_1.readFile)(absolutePath, "utf-8").catch(() => "");
        const results = await Promise.allSettled(this.providers.map((provider) => provider.analyze({ file: relativePath, diff, fullContent })));
        const findings = [];
        results.forEach((result, index) => {
            const provider = this.providers[index];
            if (result.status === "fulfilled") {
                for (const item of result.value) {
                    findings.push({
                        ...item,
                        id: (0, node_crypto_1.randomUUID)(),
                        provider: provider.id,
                        dismissed: false,
                        createdAt: new Date().toISOString(),
                    });
                }
            }
            else {
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
exports.Analyzer = Analyzer;
