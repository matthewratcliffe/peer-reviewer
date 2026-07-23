"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSessionToken = generateSessionToken;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const ipc_path_js_1 = require("./ipc-path.js");
function generateSessionToken() {
    const token = (0, node_crypto_1.randomBytes)(32).toString("hex");
    const path = (0, ipc_path_js_1.tokenFilePath)();
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    (0, node_fs_1.writeFileSync)(path, token, { mode: 0o600 });
    return token;
}
