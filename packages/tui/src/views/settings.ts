import type { PeerReviewerConfig, ProviderId } from "../client.js";
import {
  BOLD, RESET, DIM, INVERSE, FG_WHITE, FG_CYAN, FG_GRAY, FG_GREEN, FG_YELLOW,
  moveTo, clearLine, write, getTerminalSize,
} from "../terminal.js";

export interface SettingsState {
  config: PeerReviewerConfig;
  selectedIndex: number;
  editing: boolean;
  editBuffer: string;
}

interface SettingRow {
  label: string;
  value: string;
  key: string;
  editable: boolean;
}

const PROVIDERS: ProviderId[] = ["claude", "codex", "llama-cpp", "opencode", "kiro"];
const PROMPT_MODES = ["default", "append", "replace"];
const AUTO_ANALYSE_TRIGGERS = ["disabled", "on-save", "periodically"];

export function getSettingRows(config: PeerReviewerConfig): SettingRow[] {
  return [
    { label: "Active Provider", value: config.activeProvider, key: "activeProvider", editable: true },
    { label: "Codex Command", value: config.providers.codex.command, key: "codex.command", editable: true },
    { label: "Codex Args", value: config.providers.codex.args.join(" "), key: "codex.args", editable: true },
    { label: "llama.cpp Base URL", value: config.providers.llamaCpp.baseUrl, key: "llamaCpp.baseUrl", editable: true },
    { label: "Claude Command", value: config.providers.claude.command, key: "claude.command", editable: true },
    { label: "Claude Args", value: config.providers.claude.args.join(" "), key: "claude.args", editable: true },
    { label: "OpenCode Command", value: config.providers.opencode.command, key: "opencode.command", editable: true },
    { label: "OpenCode Args", value: config.providers.opencode.args.join(" "), key: "opencode.args", editable: true },
    { label: "Kiro Command", value: config.providers.kiro.command, key: "kiro.command", editable: true },
    { label: "Kiro Args", value: config.providers.kiro.args.join(" "), key: "kiro.args", editable: true },
    { label: "System Prompt Mode", value: config.systemPrompt.mode, key: "systemPrompt.mode", editable: true },
    { label: "System Prompt Text", value: config.systemPrompt.text || "(empty)", key: "systemPrompt.text", editable: true },
    { label: "Auto Analyse", value: config.autoAnalyse.trigger, key: "autoAnalyse.trigger", editable: true },
    { label: "Auto Analyse Interval", value: `${config.autoAnalyse.intervalMinutes} min`, key: "autoAnalyse.intervalMinutes", editable: true },
    { label: "Coding Standards Folder", value: config.codingStandardsFolder || "(none)", key: "codingStandardsFolder", editable: true },
    { label: "Max Files Per Run", value: config.maxFilesPerRun?.toString() || "unlimited", key: "maxFilesPerRun", editable: true },
    { label: "Block Commit on Findings", value: config.preCommit.blockOnFindings ? "yes" : "no", key: "preCommit.blockOnFindings", editable: true },
    { label: "Debug Logging", value: config.debugLogging ? "on" : "off", key: "debugLogging", editable: true },
  ];
}

export function applySettingEdit(config: PeerReviewerConfig, key: string, value: string): PeerReviewerConfig {
  const c = structuredClone(config);
  switch (key) {
    case "activeProvider":
      if (PROVIDERS.includes(value as ProviderId)) c.activeProvider = value as ProviderId;
      break;
    case "codex.command": c.providers.codex.command = value; break;
    case "codex.args": c.providers.codex.args = value.split(/\s+/).filter(Boolean); break;
    case "llamaCpp.baseUrl": c.providers.llamaCpp.baseUrl = value; break;
    case "claude.command": c.providers.claude.command = value; break;
    case "claude.args": c.providers.claude.args = value.split(/\s+/).filter(Boolean); break;
    case "opencode.command": c.providers.opencode.command = value; break;
    case "opencode.args": c.providers.opencode.args = value.split(/\s+/).filter(Boolean); break;
    case "kiro.command": c.providers.kiro.command = value; break;
    case "kiro.args": c.providers.kiro.args = value.split(/\s+/).filter(Boolean); break;
    case "systemPrompt.mode":
      if (PROMPT_MODES.includes(value)) c.systemPrompt.mode = value as "default" | "append" | "replace";
      break;
    case "systemPrompt.text": c.systemPrompt.text = value; break;
    case "autoAnalyse.trigger":
      if (AUTO_ANALYSE_TRIGGERS.includes(value)) c.autoAnalyse.trigger = value as "disabled" | "on-save" | "periodically";
      break;
    case "autoAnalyse.intervalMinutes": {
      const n = parseInt(value, 10);
      if (n > 0) c.autoAnalyse.intervalMinutes = n;
      break;
    }
    case "codingStandardsFolder": c.codingStandardsFolder = value.trim() || null; break;
    case "maxFilesPerRun": {
      const n = parseInt(value, 10);
      c.maxFilesPerRun = n > 0 ? n : null;
      break;
    }
    case "preCommit.blockOnFindings": c.preCommit.blockOnFindings = value === "yes" || value === "true"; break;
    case "debugLogging": c.debugLogging = value === "on" || value === "true"; break;
  }
  return c;
}

export function renderSettings(state: SettingsState): void {
  const { rows: termRows, cols } = getTerminalSize();
  const rows = getSettingRows(state.config);

  const headerHeight = 3;
  const footerHeight = 2;
  const listHeight = termRows - headerHeight - footerHeight;

  let output = "";

  // Header
  output += moveTo(1, 1) + clearLine();
  output += `${BOLD}${FG_WHITE} Settings${RESET}`;
  output += moveTo(2, 1) + clearLine();
  output += `${DIM}${"─".repeat(cols)}${RESET}`;
  output += moveTo(3, 1) + clearLine();

  // Settings list
  const scrollOffset = Math.max(0, state.selectedIndex - listHeight + 3);
  for (let i = 0; i < listHeight; i++) {
    const idx = i + scrollOffset;
    const row = rows[idx];
    const line = headerHeight + i + 1;
    output += moveTo(line, 1) + clearLine();

    if (!row) continue;

    const isSelected = idx === state.selectedIndex;
    const labelWidth = 24;
    const label = row.label.padEnd(labelWidth);

    if (isSelected && state.editing) {
      output += ` ${FG_CYAN}${label}${RESET} ${FG_GREEN}${state.editBuffer}█${RESET}`;
    } else if (isSelected) {
      output += `${INVERSE} ${label} ${row.value}${" ".repeat(Math.max(0, cols - labelWidth - row.value.length - 3))}${RESET}`;
    } else {
      output += ` ${DIM}${label}${RESET} ${row.value}`;
    }
  }

  // Footer
  output += moveTo(termRows - 1, 1) + clearLine();
  if (state.editing) {
    output += `${DIM} type value, enter to confirm, esc to cancel${RESET}`;
  } else {
    output += `${DIM} ↑/↓ navigate  enter edit  tab cycle (provider/mode)  esc back  q quit${RESET}`;
  }
  output += moveTo(termRows, 1) + clearLine();
  output += `${DIM} Changes are saved immediately to the service${RESET}`;

  write(output);
}
