"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCodexProvider = createCodexProvider;
const cli_runner_js_1 = require("./cli-runner.js");
const prompt_js_1 = require("./prompt.js");
function createCodexProvider(config) {
    return {
        id: "codex",
        async analyze(change) {
            const prompt = `${config.systemPrompt}\n\n${(0, prompt_js_1.buildReviewPrompt)(change.file, change.diff, change.fullContent)}`;
            const stdout = await (0, cli_runner_js_1.runCliCommand)(config.command, config.args, prompt, config.debug);
            return (0, prompt_js_1.parseFindingsJson)(stdout).map((f) => ({ ...f, file: change.file }));
        },
    };
}
