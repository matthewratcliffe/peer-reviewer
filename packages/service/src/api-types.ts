import type { ReviewCategory } from "./providers/prompt.js";

export type Severity = "info" | "low" | "medium" | "high";

export type ProviderId = "codex" | "llama-cpp" | "claude" | "opencode" | "kiro";

export interface Finding {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  category: ReviewCategory;
  title: string;
  message: string;
  provider: ProviderId;
  dismissed: boolean;
  createdAt: string;
}

export interface FindingsUpdatedEvent {
  type: "findings-updated";
  repo: string;
  file: string;
}

export interface AnalysisStartedEvent {
  type: "analysis-started";
  repo: string;
  file: string;
}

export interface AnalysisFailedEvent {
  type: "analysis-failed";
  repo: string;
  file: string;
  provider: ProviderId;
  error: string;
}

export type ServiceEvent =
  | FindingsUpdatedEvent
  | AnalysisStartedEvent
  | AnalysisFailedEvent;

export interface ReviewNotesConfig {
  activeProvider: ProviderId;
  providers: {
    codex: { command: string; args: string[] };
    llamaCpp: { baseUrl: string };
    claude: { command: string; args: string[] };
    opencode: { command: string; args: string[] };
    kiro: { command: string; args: string[] };
  };
  systemPrompt: { mode: "default" | "append" | "replace"; text: string };
  preCommit: { blockOnFindings: boolean };
  autoAnalyse: { trigger: "disabled" | "on-save" | "periodically"; intervalMinutes: number };
  maxFilesPerRun: number | null;
  debugLogging: boolean;
}
