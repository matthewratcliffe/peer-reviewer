import { describe, it, expect } from "vitest";
import { ConfigSchema } from "./config";

describe("ConfigSchema", () => {
  it("parses minimal config with defaults", () => {
    const result = ConfigSchema.parse({ providers: {} });
    expect(result.activeProvider).toBe("claude");
    expect(result.providers.claude.command).toBe("claude");
    expect(result.providers.claude.args).toEqual(["--print"]);
    expect(result.providers.codex.command).toBe("codex");
    expect(result.providers.llamaCpp.baseUrl).toBe("http://127.0.0.1:8080");
    expect(result.systemPrompt.mode).toBe("default");
    expect(result.systemPrompt.text).toBe("");
    expect(result.preCommit.blockOnFindings).toBe(true);
    expect(result.autoAnalyse.trigger).toBe("disabled");
    expect(result.autoAnalyse.intervalMinutes).toBe(5);
    expect(result.codingStandardsFolder).toBeNull();
    expect(result.maxFilesPerRun).toBeNull();
    expect(result.debugLogging).toBe(false);
  });

  it("parses full config", () => {
    const input = {
      activeProvider: "codex",
      providers: {
        codex: { command: "/usr/bin/codex", args: ["--json"] },
        llamaCpp: { baseUrl: "http://localhost:9090" },
        claude: { command: "claude-3", args: ["--print", "--model", "opus"] },
        opencode: { command: "oc", args: ["run"] },
        kiro: { command: "kiro-cli", args: ["--print"] },
      },
      systemPrompt: { mode: "replace", text: "Custom prompt" },
      preCommit: { blockOnFindings: false },
      autoAnalyse: { trigger: "on-save", intervalMinutes: 10 },
      codingStandardsFolder: "/path/to/standards",
      maxFilesPerRun: 20,
      debugLogging: true,
    };
    const result = ConfigSchema.parse(input);
    expect(result.activeProvider).toBe("codex");
    expect(result.providers.codex.command).toBe("/usr/bin/codex");
    expect(result.providers.llamaCpp.baseUrl).toBe("http://localhost:9090");
    expect(result.systemPrompt.mode).toBe("replace");
    expect(result.systemPrompt.text).toBe("Custom prompt");
    expect(result.preCommit.blockOnFindings).toBe(false);
    expect(result.autoAnalyse.trigger).toBe("on-save");
    expect(result.autoAnalyse.intervalMinutes).toBe(10);
    expect(result.codingStandardsFolder).toBe("/path/to/standards");
    expect(result.maxFilesPerRun).toBe(20);
    expect(result.debugLogging).toBe(true);
  });

  it("rejects invalid activeProvider", () => {
    expect(() => ConfigSchema.parse({ activeProvider: "gpt-4", providers: {} })).toThrow();
  });

  it("rejects intervalMinutes less than 1", () => {
    expect(() =>
      ConfigSchema.parse({ providers: {}, autoAnalyse: { trigger: "periodically", intervalMinutes: 0 } })
    ).toThrow();
  });

  it("rejects maxFilesPerRun less than 1 when not null", () => {
    expect(() => ConfigSchema.parse({ providers: {}, maxFilesPerRun: 0 })).toThrow();
  });
});
