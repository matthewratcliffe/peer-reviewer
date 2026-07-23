"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRepo = registerRepo;
exports.getAllFindings = getAllFindings;
exports.dismissFinding = dismissFinding;
exports.analyzeChanges = analyzeChanges;
exports.analyzeProject = analyzeProject;
exports.getAnalysisProgress = getAnalysisProgress;
exports.getConfig = getConfig;
exports.updateConfig = updateConfig;
exports.testProvider = testProvider;
exports.findServiceBinary = findServiceBinary;
exports.ensureServiceRunning = ensureServiceRunning;
exports.ensureRunningAndRegister = ensureRunningAndRegister;
const node_fs_1 = require("node:fs");
const node_http_1 = require("node:http");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
function resolveIpcPath() {
    if (process.platform === "win32") {
        return `\\\\.\\pipe\\peer-reviewer-${(0, node_os_1.userInfo)().username}`;
    }
    return (0, node_path_1.join)((0, node_os_1.homedir)(), ".peer-reviewer", "service.sock");
}
function readToken() {
    return (0, node_fs_1.readFileSync)((0, node_path_1.join)((0, node_os_1.homedir)(), ".peer-reviewer", "session.token"), "utf-8").trim();
}
function call(method, path, body) {
    return new Promise((resolve, reject) => {
        const req = (0, node_http_1.request)({
            socketPath: resolveIpcPath(),
            path,
            method,
            headers: { "x-peer-reviewer-token": readToken(), "content-type": "application/json" },
        }, (res) => {
            let responseBody = "";
            res.on("data", (chunk) => (responseBody += chunk));
            res.on("end", () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`service responded ${res.statusCode}: ${responseBody}`));
                    return;
                }
                resolve(JSON.parse(responseBody));
            });
        });
        req.on("error", reject);
        if (body !== undefined)
            req.write(JSON.stringify(body));
        req.end();
    });
}
async function registerRepo(path) {
    const { repoRoot } = await call("POST", "/repos", { path });
    return repoRoot;
}
async function getAllFindings(repo) {
    const { findings } = await call("GET", `/findings?repo=${encodeURIComponent(repo)}`);
    return findings;
}
function dismissFinding(id) {
    return call("POST", `/findings/${id}/dismiss`);
}
function analyzeChanges(repo) {
    return call("POST", `/analyze?repo=${encodeURIComponent(repo)}`, { scope: "changes" });
}
function analyzeProject(repo) {
    return call("POST", `/analyze?repo=${encodeURIComponent(repo)}`, { scope: "project" });
}
function getAnalysisProgress(repo) {
    return call("GET", `/analyze/progress?repo=${encodeURIComponent(repo)}`);
}
function getConfig() {
    return call("GET", "/config");
}
function updateConfig(config) {
    return call("PUT", "/config", config);
}
function testProvider(config) {
    return call("POST", "/providers/test", config);
}
function findServiceBinary() {
    const binName = process.platform === "win32" ? "peer-reviewer-service.exe" : "peer-reviewer-service";
    const locations = [
        (0, node_path_1.join)((0, node_os_1.homedir)(), ".peer-reviewer", binName),
        (0, node_path_1.join)(process.cwd(), "node_modules", ".bin", binName),
    ];
    for (const loc of locations) {
        try {
            (0, node_fs_1.readFileSync)(loc);
            return loc;
        }
        catch {
            // not here
        }
    }
    return null;
}
function ensureServiceRunning() {
    try {
        readToken();
        return true;
    }
    catch {
        return false;
    }
}
async function ensureRunningAndRegister(repoPath) {
    // Try connecting first
    try {
        return await registerRepo(repoPath);
    }
    catch {
        // Service not running — try to start it
    }
    const binary = findServiceBinary();
    if (!binary) {
        throw new Error("peer-reviewer-service binary not found. Is the service installed?");
    }
    const proc = (0, node_child_process_1.spawn)(binary, [], {
        detached: true,
        stdio: "ignore",
        ...(process.platform === "win32" ? { windowsHide: true } : {}),
    });
    proc.unref();
    // Poll for up to 10 seconds
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        try {
            return await registerRepo(repoPath);
        }
        catch {
            // not ready yet
        }
    }
    throw new Error("Failed to start peer-reviewer-service within 10 seconds");
}
