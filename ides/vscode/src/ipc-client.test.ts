import { describe, it, expect } from "vitest";
import type { PeerReviewerConfig, Finding, ProviderId } from "./ipc-client";

describe("PeerReviewerConfig type", () => {
  it("accepts a valid config object", () => {
    const config: PeerReviewerConfig = {
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
      maxFilesPerRun: null,
      codingStandardsFolder: null,
      debugLogging: false,
    };
    expect(config.activeProvider).toBe("claude");
    expect(config.codingStandardsFolder).toBeNull();
  });

  it("supports all provider ids", () => {
    const providers: ProviderId[] = ["codex", "llama-cpp", "claude", "opencode", "kiro"];
    expect(providers).toHaveLength(5);
  });
});

describe("Finding type", () => {
  it("accepts a valid finding object", () => {
    const finding: Finding = {
      id: "abc-123",
      file: "src/main.ts",
      startLine: 10,
      endLine: 15,
      severity: "high",
      category: "security",
      title: "SQL injection",
      message: "User input is not sanitized",
      provider: "claude",
      dismissed: false,
      createdAt: "2025-01-01T00:00:00Z",
    };
    expect(finding.severity).toBe("high");
    expect(finding.dismissed).toBe(false);
  });
});
