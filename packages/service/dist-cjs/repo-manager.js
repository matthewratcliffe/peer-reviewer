"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepoManager = void 0;
const simple_git_1 = require("simple-git");
const analyzer_js_1 = require("./analyzer.js");
const findings_store_js_1 = require("./findings-store.js");
const registry_js_1 = require("./providers/registry.js");
const watcher_js_1 = require("./watcher.js");
class RepoManager {
    config;
    emit;
    sessions = new Map();
    constructor(config, emit) {
        this.config = config;
        this.emit = emit;
    }
    async register(pathHint) {
        const repoRoot = (await (0, simple_git_1.simpleGit)(pathHint).revparse(["--show-toplevel"])).trim();
        if (this.sessions.has(repoRoot))
            return repoRoot;
        const store = new findings_store_js_1.FindingsStore();
        const providers = (0, registry_js_1.buildProviderRegistry)(this.config);
        const analyzer = new analyzer_js_1.Analyzer(repoRoot, providers, store, (event) => this.emit(repoRoot, { ...event, repo: repoRoot }), this.config.maxFilesPerRun);
        this.sessions.set(repoRoot, { repoRoot, store, analyzer });
        (0, watcher_js_1.watchRepo)(repoRoot, analyzer);
        return repoRoot;
    }
    getConfig() {
        return this.config;
    }
    updateConfig(config) {
        this.config = config;
        const providers = (0, registry_js_1.buildProviderRegistry)(config);
        for (const session of this.sessions.values()) {
            session.analyzer.setProviders(providers);
            session.analyzer.setMaxFilesPerRun(config.maxFilesPerRun);
        }
    }
    storeFor(repoRoot) {
        return this.sessions.get(repoRoot)?.store;
    }
    analyzerFor(repoRoot) {
        return this.sessions.get(repoRoot)?.analyzer;
    }
    storeForFinding(id) {
        for (const session of this.sessions.values()) {
            if (session.store.all().some((f) => f.id === id))
                return session.store;
        }
        return undefined;
    }
    allRepoRoots() {
        return [...this.sessions.keys()];
    }
}
exports.RepoManager = RepoManager;
