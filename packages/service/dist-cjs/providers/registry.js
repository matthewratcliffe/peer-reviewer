"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProviderRegistry = buildProviderRegistry;
const prompt_js_1 = require("./prompt.js");
const claude_js_1 = require("./claude.js");
const codex_js_1 = require("./codex.js");
const llama_cpp_js_1 = require("./llama-cpp.js");
// Exactly one provider is active at a time (config.activeProvider); the others' settings
// are still persisted in config.providers so switching back doesn't lose them.
function buildProviderRegistry(config) {
    const systemPrompt = (0, prompt_js_1.resolveSystemPrompt)(config.systemPrompt);
    const debug = config.debugLogging;
    switch (config.activeProvider) {
        case "codex":
            return [
                (0, codex_js_1.createCodexProvider)({
                    command: config.providers.codex.command,
                    args: config.providers.codex.args,
                    systemPrompt,
                    debug,
                }),
            ];
        case "llama-cpp":
            return [(0, llama_cpp_js_1.createLlamaCppProvider)({ baseUrl: config.providers.llamaCpp.baseUrl, systemPrompt, debug })];
        case "claude":
            return [
                (0, claude_js_1.createClaudeProvider)({
                    command: config.providers.claude.command,
                    args: config.providers.claude.args,
                    systemPrompt,
                    debug,
                }),
            ];
    }
}
