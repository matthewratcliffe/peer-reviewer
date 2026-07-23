"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_js_1 = require("./auth.js");
const config_js_1 = require("./config.js");
const repo_manager_js_1 = require("./repo-manager.js");
const server_js_1 = require("./server.js");
async function main() {
    const config = (0, config_js_1.loadConfig)();
    const token = (0, auth_js_1.generateSessionToken)();
    let broadcast = () => { };
    const repos = new repo_manager_js_1.RepoManager(config, (repoRoot, event) => broadcast(repoRoot, event));
    const server = (0, server_js_1.startServer)(repos, token);
    broadcast = server.broadcast;
}
main().catch((error) => {
    console.error("review-notes-service failed to start:", error);
    process.exit(1);
});
