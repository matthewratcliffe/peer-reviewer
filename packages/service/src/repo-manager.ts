import { simpleGit } from "simple-git";
import type { Config } from "./config.js";
import { Analyzer, type RepoScopedEvent } from "./analyzer.js";
import { FindingsStore } from "./findings-store.js";
import { buildProviderRegistry } from "./providers/registry.js";
import { watchRepo } from "./watcher.js";
import type { ServiceEvent } from "./api-types.js";

interface RepoSession {
  repoRoot: string;
  store: FindingsStore;
  analyzer: Analyzer;
}

export class RepoManager {
  private sessions = new Map<string, RepoSession>();

  constructor(
    private config: Config,
    private emit: (repoRoot: string, event: ServiceEvent) => void
  ) {}

  async register(pathHint: string): Promise<string> {
    const repoRoot = (await simpleGit(pathHint).revparse(["--show-toplevel"])).trim();
    if (this.sessions.has(repoRoot)) return repoRoot;

    const store = new FindingsStore();
    const providers = buildProviderRegistry(this.config);
    const analyzer = new Analyzer(repoRoot, providers, store, (event: RepoScopedEvent) =>
      this.emit(repoRoot, { ...event, repo: repoRoot } as ServiceEvent),
      this.config.maxFilesPerRun
    );
    this.sessions.set(repoRoot, { repoRoot, store, analyzer });
    watchRepo(repoRoot, analyzer);
    return repoRoot;
  }

  getConfig(): Config {
    return this.config;
  }

  updateConfig(config: Config): void {
    this.config = config;
    const providers = buildProviderRegistry(config);
    for (const session of this.sessions.values()) {
      session.analyzer.setProviders(providers);
      session.analyzer.setMaxFilesPerRun(config.maxFilesPerRun);
    }
  }

  storeFor(repoRoot: string): FindingsStore | undefined {
    return this.sessions.get(repoRoot)?.store;
  }

  analyzerFor(repoRoot: string): Analyzer | undefined {
    return this.sessions.get(repoRoot)?.analyzer;
  }

  storeForFinding(id: string): FindingsStore | undefined {
    for (const session of this.sessions.values()) {
      if (session.store.all().some((f) => f.id === id)) return session.store;
    }
    return undefined;
  }

  allRepoRoots(): string[] {
    return [...this.sessions.keys()];
  }
}
