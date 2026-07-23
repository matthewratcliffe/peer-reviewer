"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.watchRepo = watchRepo;
const chokidar_1 = __importDefault(require("chokidar"));
const DEBOUNCE_MS = 500;
function watchRepo(repoRoot, analyzer) {
    const timers = new Map();
    const watcher = chokidar_1.default.watch(repoRoot, {
        ignored: [/node_modules/, /\.git/],
        ignoreInitial: true,
    });
    watcher.on("all", (_event, path) => {
        const existing = timers.get(path);
        if (existing)
            clearTimeout(existing);
        timers.set(path, setTimeout(() => {
            timers.delete(path);
            analyzer.analyzeFile(path).catch((error) => {
                console.error(`Analysis failed for ${path}:`, error);
            });
        }, DEBOUNCE_MS));
    });
}
