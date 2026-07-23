"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveIpcPath = resolveIpcPath;
exports.tokenFilePath = tokenFilePath;
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
function resolveIpcPath() {
    if (process.platform === "win32") {
        return `\\\\.\\pipe\\review-notes-${(0, node_os_1.userInfo)().username}`;
    }
    return (0, node_path_1.join)((0, node_os_1.homedir)(), ".review-notes", "service.sock");
}
function tokenFilePath() {
    return (0, node_path_1.join)((0, node_os_1.homedir)(), ".review-notes", "session.token");
}
