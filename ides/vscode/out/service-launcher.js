"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureRunningAndRegister = ensureRunningAndRegister;
const path = __importStar(require("path"));
const child_process = __importStar(require("child_process"));
function getServiceBinaryPath(extensionPath) {
    const binName = process.platform === "win32" ? "review-notes-service.exe" : "review-notes-service";
    return path.join(extensionPath, "bin", binName);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function ensureRunningAndRegister(client, repoPath, extensionPath, output) {
    // Try registering directly first — service may already be running
    try {
        const result = await client.registerRepo(repoPath);
        return result.repoRoot;
    }
    catch {
        output.appendLine("Service not reachable, attempting to start...");
    }
    // Spawn the service binary
    const binaryPath = getServiceBinaryPath(extensionPath);
    output.appendLine(`Starting service: ${binaryPath}`);
    const proc = child_process.spawn(binaryPath, [], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
    });
    proc.unref();
    // Wait up to 15s for the service to become reachable
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        await sleep(500);
        client.refreshToken();
        try {
            const result = await client.registerRepo(repoPath);
            output.appendLine("Service started and repo registered.");
            return result.repoRoot;
        }
        catch {
            // not ready yet
        }
    }
    throw new Error("Failed to start review-notes service within 15 seconds");
}
//# sourceMappingURL=service-launcher.js.map