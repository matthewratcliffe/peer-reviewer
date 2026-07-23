import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

export const ConfigSchema = z.object({
  activeProvider: z.enum(["codex", "llama-cpp", "claude", "opencode", "kiro"]).default("claude"),
  providers: z.object({
    codex: z
      .object({
        command: z.string().default("codex"),
        args: z.array(z.string()).default(["exec", "--json"]),
      })
      .default({}),
    llamaCpp: z
      .object({
        baseUrl: z.string().default("http://127.0.0.1:8080"),
      })
      .default({}),
    claude: z
      .object({
        command: z.string().default("claude"),
        args: z.array(z.string()).default(["--print"]),
      })
      .default({}),
    opencode: z
      .object({
        command: z.string().default("opencode"),
        args: z.array(z.string()).default(["--print"]),
      })
      .default({}),
    kiro: z
      .object({
        command: z.string().default("kiro"),
        args: z.array(z.string()).default(["--print"]),
      })
      .default({}),
  }),
  systemPrompt: z
    .object({
      mode: z.enum(["default", "append", "replace"]).default("default"),
      text: z.string().default(""),
    })
    .default({}),
  preCommit: z
    .object({
      blockOnFindings: z.boolean().default(true),
    })
    .default({}),
  autoAnalyse: z
    .object({
      trigger: z.enum(["disabled", "on-save", "periodically"]).default("disabled"),
      intervalMinutes: z.number().min(1).default(5),
    })
    .default({}),
  codingStandardsFolder: z.string().nullable().default(null),
  maxFilesPerRun: z.number().int().min(1).nullable().default(null),
  debugLogging: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_PATH = join(homedir(), ".peer-reviewer", "config.json");

export function loadConfig(): Config {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return ConfigSchema.parse(JSON.parse(raw));
  } catch {
    return ConfigSchema.parse({ providers: {} });
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
