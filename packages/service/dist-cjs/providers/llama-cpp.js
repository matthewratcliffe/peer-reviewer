"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLlamaCppProvider = createLlamaCppProvider;
const prompt_js_1 = require("./prompt.js");
function createLlamaCppProvider(config) {
    return {
        id: "llama-cpp",
        async analyze(change) {
            const url = `${config.baseUrl}/v1/chat/completions`;
            const requestBody = JSON.stringify({
                messages: [
                    { role: "system", content: config.systemPrompt },
                    { role: "user", content: (0, prompt_js_1.buildReviewPrompt)(change.file, change.diff, change.fullContent) },
                ],
                temperature: 0.1,
            });
            if (config.debug) {
                console.log(`[DEBUG] llama-cpp POST ${url}`);
                console.log(`[DEBUG] llama-cpp request body (${requestBody.length} chars): ${requestBody.substring(0, 500)}${requestBody.length > 500 ? "..." : ""}`);
            }
            const response = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: requestBody,
            });
            const responseText = await response.text();
            if (config.debug) {
                console.log(`[DEBUG] llama-cpp HTTP ${response.status} ${response.statusText}`);
                console.log(`[DEBUG] llama-cpp response (${responseText.length} chars): ${responseText.substring(0, 1000)}${responseText.length > 1000 ? "..." : ""}`);
            }
            if (!response.ok) {
                throw new Error(`llama.cpp server responded ${response.status}: ${responseText}`);
            }
            const body = JSON.parse(responseText);
            const text = body.choices[0]?.message.content ?? "";
            return (0, prompt_js_1.parseFindingsJson)(text).map((f) => ({ ...f, file: change.file }));
        },
    };
}
