import { createServer } from "node:http";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import type { Finding, ServiceEvent } from "./api-types.js";
import { ConfigSchema, saveConfig } from "./config.js";
import { resolveIpcPath } from "./ipc-path.js";
import { testProviderConnection } from "./providers/test-connection.js";
import type { RepoManager } from "./repo-manager.js";

export function startServer(repos: RepoManager, token: string) {
  const app = express();
  app.use((req, res, next) => {
    if (req.headers["x-peer-reviewer-token"] !== token) {
      res.status(403).json({ error: "invalid token" });
      return;
    }
    next();
  });
  app.use(express.json());

  app.post("/repos", async (req, res) => {
    const path = req.body?.path as string | undefined;
    if (!path) {
      res.status(400).json({ error: "path is required" });
      return;
    }
    try {
      const repoRoot = await repos.register(path);
      res.json({ repoRoot });
    } catch (error) {
      res.status(400).json({ error: String(error) });
    }
  });

  app.get("/findings", (req, res) => {
    const repo = req.query.repo as string | undefined;
    if (!repo) {
      res.status(400).json({ error: "repo query param is required" });
      return;
    }
    const store = repos.storeFor(repo);
    if (!store) {
      res.status(404).json({ error: "repo not registered; POST /repos first" });
      return;
    }
    const file = req.query.file as string | undefined;
    const findings: Finding[] = file ? store.forFile(file) : store.all();
    res.json({ findings });
  });

  app.post("/analyze", async (req, res) => {
    const repo = req.query.repo as string | undefined;
    if (!repo) {
      res.status(400).json({ error: "repo query param is required" });
      return;
    }
    const analyzer = repos.analyzerFor(repo);
    if (!analyzer) {
      res.status(404).json({ error: "repo not registered; POST /repos first" });
      return;
    }
    const scope = req.body?.scope as string | undefined;
    if (scope !== "changes" && scope !== "project") {
      res.status(400).json({ error: "scope must be 'changes' or 'project'" });
      return;
    }

    try {
      await (scope === "changes" ? analyzer.analyzeChangedFiles() : analyzer.analyzeProject());
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post("/analyze/cancel", (req, res) => {
    const repo = req.query.repo as string | undefined;
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
    const parsed = ConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      await testProviderConnection(parsed.data);
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ error: String(error) });
    }
  });

  app.get("/analyze/progress", (req, res) => {
    const repo = req.query.repo as string | undefined;
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
    const parsed = ConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    repos.updateConfig(parsed.data);
    saveConfig(parsed.data);
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

  const httpServer = createServer(app);
  httpServer.on("connection", (socket) => {
    socket.on("error", () => {});
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/events",
    verifyClient: (info, callback) => {
      callback(info.req.headers["x-peer-reviewer-token"] === token);
    },
  });

  function broadcast(_repoRoot: string, event: ServiceEvent) {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  }

  const socketPath = resolveIpcPath();
  if (process.platform !== "win32") {
    mkdirSync(dirname(socketPath), { recursive: true });
    if (existsSync(socketPath)) unlinkSync(socketPath);
  }

  httpServer.listen(socketPath, () => {
    console.log(`peer-reviewer-service listening on ${socketPath}`);
  });

  return { broadcast };
}
