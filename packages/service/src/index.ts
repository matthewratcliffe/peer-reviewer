import { generateSessionToken } from "./auth.js";
import { loadConfig } from "./config.js";
import { RepoManager } from "./repo-manager.js";
import { startServer } from "./server.js";
import type { ServiceEvent } from "./api-types.js";

async function main() {
  const config = loadConfig();
  const token = generateSessionToken();

  let broadcast: (repoRoot: string, event: ServiceEvent) => void = () => {};
  const repos = new RepoManager(config, (repoRoot, event) => broadcast(repoRoot, event));

  const server = startServer(repos, token);
  broadcast = server.broadcast;
}

main().catch((error) => {
  console.error("peer-reviewer-service failed to start:", error);
  process.exit(1);
});
