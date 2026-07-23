"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigSchema = void 0;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const zod_1 = require("zod");
exports.ConfigSchema = zod_1.z.object({
    activeProvider: zod_1.z.enum(["codex", "llama-cpp", "claude"]).default("claude"),
    providers: zod_1.z.object({
        codex: zod_1.z
            .object({
            command: zod_1.z.string().default("codex"),
            args: zod_1.z.array(zod_1.z.string()).default(["exec", "--json"]),
        })
            .default({}),
        llamaCpp: zod_1.z
            .object({
            baseUrl: zod_1.z.string().default("http://127.0.0.1:8080"),
        })
            .default({}),
        claude: zod_1.z
            .object({
            command: zod_1.z.string().default("claude"),
            args: zod_1.z.array(zod_1.z.string()).default(["--print"]),
        })
            .default({}),
    }),
    systemPrompt: zod_1.z
        .object({
        mode: zod_1.z.enum(["default", "append", "replace"]).default("default"),
        text: zod_1.z.string().default(""),
    })
        .default({}),
    preCommit: zod_1.z
        .object({
        blockOnFindings: zod_1.z.boolean().default(true),
    })
        .default({}),
    autoAnalyse: zod_1.z
        .object({
        trigger: zod_1.z.enum(["disabled", "on-save", "periodically"]).default("disabled"),
        intervalMinutes: zod_1.z.number().min(1).default(5),
    })
        .default({}),
    maxFilesPerRun: zod_1.z.number().int().min(1).nullable().default(null),
    debugLogging: zod_1.z.boolean().default(false),
});
const CONFIG_PATH = (0, node_path_1.join)((0, node_os_1.homedir)(), ".review-notes", "config.json");
function loadConfig() {
    try {
        const raw = (0, node_fs_1.readFileSync)(CONFIG_PATH, "utf-8");
        return exports.ConfigSchema.parse(JSON.parse(raw));
    }
    catch {
        return exports.ConfigSchema.parse({ providers: {} });
    }
}
function saveConfig(config) {
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(CONFIG_PATH), { recursive: true });
    (0, node_fs_1.writeFileSync)(CONFIG_PATH, JSON.stringify(config, null, 2));
}
