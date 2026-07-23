import type { Finding } from "../api-types.js";
import { buildReviewPrompt, parseFindingsJson } from "./prompt.js";
import type { FileChange, Provider } from "./types.js";

export interface LlamaCppConfig {
  baseUrl: string;
  systemPrompt: string;
  debug: boolean;
}

export function createLlamaCppProvider(config: LlamaCppConfig): Provider {
  return {
    id: "llama-cpp",
    async analyze(change: FileChange) {
      const url = `${config.baseUrl}/v1/chat/completions`;
      const requestBody = JSON.stringify({
        messages: [
          { role: "system", content: config.systemPrompt },
          { role: "user", content: buildReviewPrompt(change.file, change.diff, change.fullContent) },
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

      const body = JSON.parse(responseText) as {
        choices: Array<{ message: { content: string } }>;
      };
      const text = body.choices[0]?.message.content ?? "";
      return parseFindingsJson(text).map((f) => ({ ...f, file: change.file })) satisfies Array<
        Omit<Finding, "id" | "dismissed" | "createdAt" | "provider">
      >;
    },
  };
}
