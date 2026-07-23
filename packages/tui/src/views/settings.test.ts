import { describe, it, expect } from "vitest";
import { applySettingEdit, getSettingRows } from "./settings";
import type { PeerReviewerConfig } from "../client";

function makeConfig(): PeerReviewerConfig {
  return {
    activeProvider: "claude",
    providers: {
      codex: { command: "codex", args: ["exec", "--json"] },
      llamaCpp: { baseUrl: "http://127.0.0.1:8080" },
      claude: { command: "claude", args: ["--print"] },
      opencode: { command: "opencode", args: ["--print"] },
      kiro: { command: "kiro", args: ["--print"] },
    },
    systemPrompt: { mode: "default", text: "" },
    preCommit: { blockOnFindings: true },
    autoAnalyse: { trigger: "disabled", intervalMinutes: 5 },
    codingStandardsFolder: null,
    maxFilesPerRun: null,
    debugLogging: false,
  };
}

describe("getSettingRows", () => {
  it("returns all setting rows", () => {
    const rows = getSettingRows(makeConfig());
    expect(rows.length).toBeGreaterThan(10);
    expect(rows[0].label).toBe("Active Provider");
    expect(rows[0].value).toBe("claude");
  });

  it("shows coding standards folder as (none) when null", () => {
    const rows = getSettingRows(makeConfig());
    const csRow = rows.find((r) => r.key === "codingStandardsFolder");
    expect(csRow?.value).toBe("(none)");
  });

  it("shows maxFilesPerRun as unlimited when null", () => {
    const rows = getSettingRows(makeConfig());
    const mfRow = rows.find((r) => r.key === "maxFilesPerRun");
    expect(mfRow?.value).toBe("unlimited");
  });
});

describe("applySettingEdit", () => {
  it("changes activeProvider", () => {
    const result = applySettingEdit(makeConfig(), "activeProvider", "codex");
    expect(result.activeProvider).toBe("codex");
  });

  it("ignores invalid provider", () => {
    const result = applySettingEdit(makeConfig(), "activeProvider", "invalid");
    expect(result.activeProvider).toBe("claude");
  });

  it("changes claude command", () => {
    const result = applySettingEdit(makeConfig(), "claude.command", "/usr/bin/claude");
    expect(result.providers.claude.command).toBe("/usr/bin/claude");
  });

  it("changes claude args from space-separated string", () => {
    const result = applySettingEdit(makeConfig(), "claude.args", "--print --model opus");
    expect(result.providers.claude.args).toEqual(["--print", "--model", "opus"]);
  });

  it("changes systemPrompt mode", () => {
    const result = applySettingEdit(makeConfig(), "systemPrompt.mode", "append");
    expect(result.systemPrompt.mode).toBe("append");
  });

  it("changes codingStandardsFolder", () => {
    const result = applySettingEdit(makeConfig(), "codingStandardsFolder", "/path/to/standards");
    expect(result.codingStandardsFolder).toBe("/path/to/standards");
  });

  it("sets codingStandardsFolder to null on empty string", () => {
    const config = makeConfig();
    config.codingStandardsFolder = "/some/path";
    const result = applySettingEdit(config, "codingStandardsFolder", "");
    expect(result.codingStandardsFolder).toBeNull();
  });

  it("changes maxFilesPerRun", () => {
    const result = applySettingEdit(makeConfig(), "maxFilesPerRun", "10");
    expect(result.maxFilesPerRun).toBe(10);
  });

  it("sets maxFilesPerRun to null on 0 or invalid", () => {
    const result = applySettingEdit(makeConfig(), "maxFilesPerRun", "0");
    expect(result.maxFilesPerRun).toBeNull();
  });

  it("changes debugLogging", () => {
    const result = applySettingEdit(makeConfig(), "debugLogging", "on");
    expect(result.debugLogging).toBe(true);
  });

  it("changes preCommit.blockOnFindings", () => {
    const result = applySettingEdit(makeConfig(), "preCommit.blockOnFindings", "no");
    expect(result.preCommit.blockOnFindings).toBe(false);
  });
});
