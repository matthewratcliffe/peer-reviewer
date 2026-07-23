"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const node_http_1 = require("node:http");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const simple_git_1 = require("simple-git");
const config_js_1 = require("./config.js");
const ipc_path_js_1 = require("./ipc-path.js");
const cli_runner_js_1 = require("./providers/cli-runner.js");
const prompt_js_1 = require("./providers/prompt.js");
const test_connection_js_1 = require("./providers/test-connection.js");
function startServer(repos, token) {
    const app = (0, express_1.default)();
    app.use((req, res, next) => {
        if (req.headers["x-review-notes-token"] !== token) {
            res.status(403).json({ error: "invalid token" });
            return;
        }
        next();
    });
    app.use(express_1.default.json());
    app.post("/repos", async (req, res) => {
        const path = req.body?.path;
        if (!path) {
            res.status(400).json({ error: "path is required" });
            return;
        }
        try {
            const repoRoot = await repos.register(path);
            res.json({ repoRoot });
        }
        catch (error) {
            res.status(400).json({ error: String(error) });
        }
    });
    app.get("/findings", (req, res) => {
        const repo = req.query.repo;
        if (!repo) {
            res.status(400).json({ error: "repo query param is required" });
            return;
        }
        const store = repos.storeFor(repo);
        if (!store) {
            res.status(404).json({ error: "repo not registered; POST /repos first" });
            return;
        }
        const file = req.query.file;
        const findings = file ? store.forFile(file) : store.all();
        res.json({ findings });
    });
    app.post("/analyze", async (req, res) => {
        const repo = req.query.repo;
        if (!repo) {
            res.status(400).json({ error: "repo query param is required" });
            return;
        }
        const analyzer = repos.analyzerFor(repo);
        if (!analyzer) {
            res.status(404).json({ error: "repo not registered; POST /repos first" });
            return;
        }
        const scope = req.body?.scope;
        if (scope !== "changes" && scope !== "project") {
            res.status(400).json({ error: "scope must be 'changes' or 'project'" });
            return;
        }
        try {
            await (scope === "changes" ? analyzer.analyzeChangedFiles() : analyzer.analyzeProject());
            res.json({ ok: true });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.post("/analyze/cancel", (req, res) => {
        const repo = req.query.repo;
        if (!repo) {
            res.status(400).json({ error: "repo query param is required" });
            return;
        }
        const analyzer = repos.analyzerFor(repo);
        if (!analyzer) {
            res.status(404).json({ error: "repo not registered; POST /repos first" });
            return;
        }
        analyzer.cancelAnalysis();
        res.json({ ok: true });
    });
    app.post("/providers/test", async (req, res) => {
        const parsed = config_js_1.ConfigSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.message });
            return;
        }
        try {
            await (0, test_connection_js_1.testProviderConnection)(parsed.data);
            res.json({ ok: true });
        }
        catch (error) {
            res.status(502).json({ error: String(error) });
        }
    });
    app.post("/commit-message", async (req, res) => {
        const repo = req.query.repo;
        if (!repo) {
            res.status(400).json({ error: "repo query param is required" });
            return;
        }
        const config = repos.getConfig();
        const git = (0, simple_git_1.simpleGit)(repo);
        try {
            const stagedDiff = await git.diff(["--cached"]);
            const unstagedDiff = await git.diff(["HEAD"]);
            let combinedDiff = [stagedDiff, unstagedDiff].filter((d) => d.trim()).join("\n");
            if (!combinedDiff.trim()) {
                res.json({ message: "chore: no changes detected" });
                return;
            }
            // Truncate diff if too large for LLM context (keep under ~12k chars)
            const MAX_DIFF_CHARS = 12000;
            if (combinedDiff.length > MAX_DIFF_CHARS) {
                const stat = await git.diff(["--stat", "HEAD"]);
                combinedDiff = combinedDiff.substring(0, MAX_DIFF_CHARS) +
                    "\n\n[diff truncated]\n\nFull change summary:\n" + stat;
            }
            const prompt = (0, prompt_js_1.buildCommitMessagePrompt)(combinedDiff);
            let message;
            if (config.activeProvider === "llama-cpp") {
                const response = await fetch(`${config.providers.llamaCpp.baseUrl}/v1/chat/completions`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        messages: [
                            { role: "system", content: prompt_js_1.COMMIT_MESSAGE_PROMPT },
                            { role: "user", content: `Diff:\n${combinedDiff}` },
                        ],
                        temperature: 0.3,
                    }),
                });
                if (!response.ok) {
                    const errorBody = await response.text();
                    throw new Error(`llama.cpp responded ${response.status}: ${errorBody}`);
                }
                const body = (await response.json());
                message = body.choices[0]?.message.content ?? "";
            }
            else {
                const providerConfig = config.activeProvider === "codex" ? config.providers.codex : config.providers.claude;
                message = await (0, cli_runner_js_1.runCliCommand)(providerConfig.command, providerConfig.args, prompt, config.debugLogging);
            }
            res.json({ message: message.trim() });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    app.get("/analyze/progress", (req, res) => {
        const repo = req.query.repo;
        if (!repo) {
            res.status(400).json({ error: "repo query param is required" });
            return;
        }
        const analyzer = repos.analyzerFor(repo);
        if (!analyzer) {
            res.status(404).json({ error: "repo not registered; POST /repos first" });
            return;
        }
        res.json(analyzer.getProgress() ?? { total: 0, completed: 0, startedAt: 0 });
    });
    app.get("/config", (req, res) => {
        res.json(repos.getConfig());
    });
    app.put("/config", (req, res) => {
        const parsed = config_js_1.ConfigSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.message });
            return;
        }
        repos.updateConfig(parsed.data);
        (0, config_js_1.saveConfig)(parsed.data);
        res.json(parsed.data);
    });
    app.post("/findings/:id/dismiss", (req, res) => {
        const store = repos.storeForFinding(req.params.id);
        const ok = store?.dismiss(req.params.id) ?? false;
        if (!ok) {
            res.status(404).json({ error: "finding not found" });
            return;
        }
        res.json({ ok: true });
    });
    const httpServer = (0, node_http_1.createServer)(app);
    httpServer.on("connection", (socket) => {
        socket.on("error", () => { });
    });
    const wss = new ws_1.WebSocketServer({
        server: httpServer,
        path: "/events",
        verifyClient: (info, callback) => {
            callback(info.req.headers["x-review-notes-token"] === token);
        },
    });
    function broadcast(_repoRoot, event) {
        const payload = JSON.stringify(event);
        for (const client of wss.clients) {
            if (client.readyState === client.OPEN)
                client.send(payload);
        }
    }
    const socketPath = (0, ipc_path_js_1.resolveIpcPath)();
    if (process.platform !== "win32") {
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(socketPath), { recursive: true });
        if ((0, node_fs_1.existsSync)(socketPath))
            (0, node_fs_1.unlinkSync)(socketPath);
    }
    httpServer.listen(socketPath, () => {
        console.log(`review-notes-service listening on ${socketPath}`);
    });
    return { broadcast };
}
