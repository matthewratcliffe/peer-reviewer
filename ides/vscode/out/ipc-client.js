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
exports.IpcClient = void 0;
const net = __importStar(require("net"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function resolveIpcPath() {
    if (process.platform === "win32") {
        return `\\\\.\\pipe\\review-notes-${os.userInfo().username}`;
    }
    return path.join(os.homedir(), ".review-notes", "service.sock");
}
function readToken() {
    const tokenPath = path.join(os.homedir(), ".review-notes", "session.token");
    try {
        return fs.readFileSync(tokenPath, "utf-8").trim();
    }
    catch {
        return "";
    }
}
class IpcClient {
    constructor() {
        this.ipcPath = resolveIpcPath();
        this.token = readToken();
    }
    refreshToken() {
        this.token = readToken();
    }
    async request(method, urlPath, body) {
        return new Promise((resolve, reject) => {
            const socket = net.createConnection(this.ipcPath, () => {
                const bodyStr = body !== undefined ? JSON.stringify(body) : "";
                const lines = [
                    `${method} ${urlPath} HTTP/1.1`,
                    `Host: localhost`,
                    `x-review-notes-token: ${this.token}`,
                    `Content-Type: application/json`,
                    `Content-Length: ${Buffer.byteLength(bodyStr)}`,
                    `Connection: close`,
                    ``,
                    bodyStr,
                ];
                socket.write(lines.join("\r\n"));
            });
            let data = "";
            socket.on("data", (chunk) => {
                data += chunk.toString();
            });
            socket.on("end", () => {
                const headerEnd = data.indexOf("\r\n\r\n");
                if (headerEnd === -1) {
                    reject(new Error("Invalid HTTP response from service"));
                    return;
                }
                const headerSection = data.slice(0, headerEnd);
                const responseBody = data.slice(headerEnd + 4);
                const statusLine = headerSection.split("\r\n")[0];
                const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);
                const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
                const headers = {};
                const headerLines = headerSection.split("\r\n").slice(1);
                for (const line of headerLines) {
                    const colonIdx = line.indexOf(":");
                    if (colonIdx > 0) {
                        headers[line.slice(0, colonIdx).toLowerCase().trim()] = line.slice(colonIdx + 1).trim();
                    }
                }
                // Handle chunked transfer encoding
                let finalBody = responseBody;
                if (headers["transfer-encoding"]?.includes("chunked")) {
                    finalBody = decodeChunked(responseBody);
                }
                resolve({ statusCode, headers, body: finalBody });
            });
            socket.on("error", (err) => {
                reject(err);
            });
            socket.setTimeout(120000, () => {
                socket.destroy();
                reject(new Error("IPC request timed out"));
            });
        });
    }
    async registerRepo(repoPath) {
        const resp = await this.request("POST", "/repos", { path: repoPath });
        if (resp.statusCode !== 200) {
            throw new Error(`registerRepo failed (${resp.statusCode}): ${resp.body}`);
        }
        return JSON.parse(resp.body);
    }
    async getAllFindings(repoRoot) {
        const resp = await this.request("GET", `/findings?repo=${encodeURIComponent(repoRoot)}`);
        if (resp.statusCode !== 200) {
            throw new Error(`getAllFindings failed (${resp.statusCode}): ${resp.body}`);
        }
        return JSON.parse(resp.body);
    }
    async analyzeChanges(repoRoot) {
        const resp = await this.request("POST", `/analyze?repo=${encodeURIComponent(repoRoot)}`, { scope: "changes" });
        if (resp.statusCode !== 200) {
            throw new Error(`analyzeChanges failed (${resp.statusCode}): ${resp.body}`);
        }
    }
    async analyzeProject(repoRoot) {
        const resp = await this.request("POST", `/analyze?repo=${encodeURIComponent(repoRoot)}`, { scope: "project" });
        if (resp.statusCode !== 200) {
            throw new Error(`analyzeProject failed (${resp.statusCode}): ${resp.body}`);
        }
    }
    async getAnalysisProgress(repoRoot) {
        const resp = await this.request("GET", `/analyze/progress?repo=${encodeURIComponent(repoRoot)}`);
        if (resp.statusCode !== 200) {
            throw new Error(`getAnalysisProgress failed (${resp.statusCode}): ${resp.body}`);
        }
        return JSON.parse(resp.body);
    }
    async cancelAnalysis(repoRoot) {
        const resp = await this.request("POST", `/analyze/cancel?repo=${encodeURIComponent(repoRoot)}`);
        if (resp.statusCode !== 200 && resp.statusCode !== 204) {
            throw new Error(`cancelAnalysis failed (${resp.statusCode}): ${resp.body}`);
        }
    }
    async getConfig() {
        const resp = await this.request("GET", "/config");
        if (resp.statusCode !== 200) {
            throw new Error(`getConfig failed (${resp.statusCode}): ${resp.body}`);
        }
        return JSON.parse(resp.body);
    }
    async updateConfig(config) {
        const resp = await this.request("PUT", "/config", config);
        if (resp.statusCode !== 200 && resp.statusCode !== 204) {
            throw new Error(`updateConfig failed (${resp.statusCode}): ${resp.body}`);
        }
    }
    async testProvider(config) {
        const resp = await this.request("POST", "/providers/test", config);
        if (resp.statusCode === 200) {
            return JSON.parse(resp.body);
        }
        if (resp.statusCode === 502) {
            return JSON.parse(resp.body);
        }
        throw new Error(`testProvider failed (${resp.statusCode}): ${resp.body}`);
    }
    async dismissFinding(findingId) {
        const resp = await this.request("POST", `/findings/${findingId}/dismiss`);
        if (resp.statusCode !== 200 && resp.statusCode !== 204) {
            throw new Error(`dismissFinding failed (${resp.statusCode}): ${resp.body}`);
        }
    }
}
exports.IpcClient = IpcClient;
function decodeChunked(raw) {
    let result = "";
    let pos = 0;
    while (pos < raw.length) {
        const lineEnd = raw.indexOf("\r\n", pos);
        if (lineEnd === -1)
            break;
        const sizeStr = raw.slice(pos, lineEnd).trim();
        const size = parseInt(sizeStr, 16);
        if (isNaN(size) || size === 0)
            break;
        const chunkStart = lineEnd + 2;
        result += raw.slice(chunkStart, chunkStart + size);
        pos = chunkStart + size + 2;
    }
    return result;
}
//# sourceMappingURL=ipc-client.js.map