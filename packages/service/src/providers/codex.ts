import type { Finding } from "../api-types.js";
import { runCliCommand } from "./cli-runner.js";
import { buildReviewPrompt, parseFindingsJson } from "./prompt.js";
import type { FileChange, Provider } from "./types.js";

export interface CodexConfig {
  command: string;
  args: string[];
  systemPrompt: string;
  debug: boolean;
}

export function createCodexProvider(config: CodexConfig): Provider {
  return {
    id: "codex",
    async analyze(change: FileChange) {
      const prompt = `${config.systemPrompt}\n\n${buildReviewPrompt(change.file, change.diff, change.fullContent)}`;
      const stdout = await runCliCommand(config.command, config.args, prompt, config.debug);
      return parseFindingsJson(stdout).map((f) => ({ ...f, file: change.file })) satisfies Array<
        Omit<Finding, "id" | "dismissed" | "createdAt" | "provider">
      >;
    },
  };
}
