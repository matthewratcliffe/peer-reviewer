import type { Config } from "../config.js";
import { resolveSystemPrompt } from "./prompt.js";
import { createClaudeProvider } from "./claude.js";
import { createCodexProvider } from "./codex.js";
import { createLlamaCppProvider } from "./llama-cpp.js";
import { createOpenCodeProvider } from "./opencode.js";
import { createKiroProvider } from "./kiro.js";
import type { Provider } from "./types.js";

// Exactly one provider is active at a time (config.activeProvider); the others' settings
// are still persisted in config.providers so switching back doesn't lose them.
export function buildProviderRegistry(config: Config): Provider[] {
  const systemPrompt = resolveSystemPrompt(config.systemPrompt, config.codingStandardsFolder);
  const debug = config.debugLogging;

  switch (config.activeProvider) {
    case "codex":
      return [
        createCodexProvider({
          command: config.providers.codex.command,
          args: config.providers.codex.args,
          systemPrompt,
          debug,
        }),
      ];
    case "llama-cpp":
      return [createLlamaCppProvider({ baseUrl: config.providers.llamaCpp.baseUrl, systemPrompt, debug })];
    case "claude":
      return [
        createClaudeProvider({
          command: config.providers.claude.command,
          args: config.providers.claude.args,
          systemPrompt,
          debug,
        }),
      ];
    case "opencode":
      return [
        createOpenCodeProvider({
          command: config.providers.opencode.command,
          args: config.providers.opencode.args,
          systemPrompt,
          debug,
        }),
      ];
    case "kiro":
      return [
        createKiroProvider({
          command: config.providers.kiro.command,
          args: config.providers.kiro.args,
          systemPrompt,
          debug,
        }),
      ];
  }
}
