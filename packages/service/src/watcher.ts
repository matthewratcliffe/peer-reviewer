import chokidar from "chokidar";
import type { Analyzer } from "./analyzer.js";

const DEBOUNCE_MS = 500;
const MAX_CONCURRENT_WATCHES = 3;

export function watchRepo(repoRoot: string, analyzer: Analyzer): void {
  const timers = new Map<string, NodeJS.Timeout>();
  const queue: string[] = [];
  let running = 0;

  function drain(): void {
    while (running < MAX_CONCURRENT_WATCHES && queue.length > 0) {
      const path = queue.shift()!;
      running++;
      analyzer.analyzeFile(path).catch((error) => {
        console.error(`Analysis failed for ${path}:`, error);
      }).finally(() => {
        running--;
        drain();
      });
    }
  }

  function enqueue(path: string): void {
    if (!queue.includes(path)) queue.push(path);
    drain();
  }

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
        enqueue(path);
      }, DEBOUNCE_MS)
    );
  });
}
