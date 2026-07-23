import chokidar from "chokidar";
import type { Analyzer } from "./analyzer.js";

const DEBOUNCE_MS = 500;

export function watchRepo(repoRoot: string, analyzer: Analyzer): void {
  const timers = new Map<string, NodeJS.Timeout>();

  const watcher = chokidar.watch(repoRoot, {
    ignored: [/node_modules/, /\.git/],
    ignoreInitial: true,
  });

  watcher.on("all", (_event, path) => {
    const existing = timers.get(path);
    if (existing) clearTimeout(existing);
    timers.set(
      path,
      setTimeout(() => {
        timers.delete(path);
        analyzer.analyzeFile(path).catch((error) => {
          console.error(`Analysis failed for ${path}:`, error);
        });
      }, DEBOUNCE_MS)
    );
  });
}
