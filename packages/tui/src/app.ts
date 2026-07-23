import {
  type Finding,
  type PeerReviewerConfig,
  getAllFindings,
  dismissFinding,
  analyzeChanges,
  analyzeProject,
  getAnalysisProgress,
  getConfig,
  updateConfig,
  ensureRunningAndRegister,
} from "./client.js";
import {
  CLEAR_SCREEN, HIDE_CURSOR, SHOW_CURSOR,
  write, startKeypress, stopKeypress,
} from "./terminal.js";
import {
  type FindingsListState,
  buildRows,
  renderFindingsList,
  type ListRow,
} from "./views/findings-list.js";
import { type DetailState, renderFindingDetail } from "./views/finding-detail.js";
import {
  type SettingsState,
  getSettingRows,
  applySettingEdit,
  renderSettings,
} from "./views/settings.js";
import { type CommandBarState, getMatchingCommands, renderCommandBar } from "./views/command-bar.js";

type View = "list" | "detail" | "settings" | "command";

interface AppState {
  view: View;
  repoRoot: string;
  findings: Finding[];
  listState: FindingsListState;
  listRows: ListRow[];
  detailState: DetailState | null;
  settingsState: SettingsState | null;
  commandState: CommandBarState;
  statusLine: string;
  analysisRunning: boolean;
}

let state: AppState;

export async function startApp(): Promise<void> {
  const repoPath = process.cwd();

  write(CLEAR_SCREEN + HIDE_CURSOR);
  write(" Connecting to peer-reviewer-service...");

  let repoRoot: string;
  try {
    repoRoot = await ensureRunningAndRegister(repoPath);
  } catch (err) {
    write(SHOW_CURSOR);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nFailed to connect: ${msg}`);
    process.exit(1);
  }

  state = {
    view: "list",
    repoRoot,
    findings: [],
    listState: { findings: [], selectedIndex: 0, scrollOffset: 0 },
    listRows: [],
    detailState: null,
    settingsState: null,
    commandState: { active: false, buffer: "", suggestions: [] },
    statusLine: " Analysing changes...",
    analysisRunning: false,
  };

  startKeypress(handleKey);
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  // Run initial analysis on changeset
  await runAnalysis("changes");

  // Initial load of findings
  await refreshFindings();
  render();
}

function cleanup(): void {
  write(SHOW_CURSOR + CLEAR_SCREEN);
  stopKeypress();
}

async function refreshFindings(): Promise<void> {
  try {
    state.findings = await getAllFindings(state.repoRoot);
    state.listState.findings = state.findings;
    state.listRows = buildRows(state.findings);
    if (state.listState.selectedIndex >= state.listRows.length) {
      state.listState.selectedIndex = Math.max(0, state.listRows.length - 1);
    }
    state.statusLine = ` ${state.findings.length} finding(s) — ${state.findings.filter((f) => !f.dismissed).length} active`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.statusLine = ` Error: ${msg}`;
  }
}

async function runAnalysis(scope: "changes" | "project"): Promise<void> {
  state.analysisRunning = true;
  state.statusLine = ` Analysing ${scope === "project" ? "all files" : "changes"}...`;
  render();

  // Poll progress in background
  const progressInterval = setInterval(async () => {
    try {
      const progress = await getAnalysisProgress(state.repoRoot);
      if (progress.total > 0) {
        state.statusLine = ` Analysing: ${progress.completed}/${progress.total} files`;
        render();
      }
    } catch {
      // ignore
    }
  }, 1000);

  try {
    if (scope === "changes") {
      await analyzeChanges(state.repoRoot);
    } else {
      await analyzeProject(state.repoRoot);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.statusLine = ` Analysis failed: ${msg}`;
  } finally {
    clearInterval(progressInterval);
    state.analysisRunning = false;
    await refreshFindings();
    render();
  }
}

function render(): void {
  write(CLEAR_SCREEN + HIDE_CURSOR);
  switch (state.view) {
    case "list":
      renderFindingsList(state.listState, state.listRows, state.statusLine);
      break;
    case "detail":
      if (state.detailState) renderFindingDetail(state.detailState);
      break;
    case "settings":
      if (state.settingsState) renderSettings(state.settingsState);
      break;
    case "command":
      renderFindingsList(state.listState, state.listRows, state.statusLine);
      renderCommandBar(state.commandState);
      break;
  }
}

function handleKey(key: string, raw: Buffer): void {
  // Ctrl+C always quits
  if (key === "\x03") {
    cleanup();
    process.exit(0);
  }

  switch (state.view) {
    case "list": handleListKey(key); break;
    case "detail": handleDetailKey(key); break;
    case "settings": handleSettingsKey(key); break;
    case "command": handleCommandKey(key); break;
  }
}

function handleListKey(key: string): void {
  const rows = state.listRows;

  switch (key) {
    case "\x1b[A": // Up
    case "k":
      if (state.listState.selectedIndex > 0) state.listState.selectedIndex--;
      render();
      break;
    case "\x1b[B": // Down
    case "j":
      if (state.listState.selectedIndex < rows.length - 1) state.listState.selectedIndex++;
      render();
      break;
    case "\r": // Enter - open detail
    case "\n": {
      const row = rows[state.listState.selectedIndex];
      if (row?.type === "finding" && row.finding) {
        state.detailState = { finding: row.finding, scrollOffset: 0 };
        state.view = "detail";
        render();
      }
      break;
    }
    case "d": { // Dismiss
      const row = rows[state.listState.selectedIndex];
      if (row?.type === "finding" && row.finding) {
        dismissFinding(row.finding.id).then(() => refreshFindings()).then(() => render());
      }
      break;
    }
    case "/": // Command mode
      state.commandState = { active: true, buffer: "/", suggestions: [] };
      state.view = "command";
      render();
      break;
    case "s": // Settings
      openSettings();
      break;
    case "q":
      cleanup();
      process.exit(0);
      break;
    default:
      break;
  }
}

function handleDetailKey(key: string): void {
  if (!state.detailState) return;

  switch (key) {
    case "\x1b[A": // Up
    case "k":
      if (state.detailState.scrollOffset > 0) state.detailState.scrollOffset--;
      render();
      break;
    case "\x1b[B": // Down
    case "j":
      state.detailState.scrollOffset++;
      render();
      break;
    case "\x1b": // Esc
    case "\x7f": // Backspace
      state.view = "list";
      render();
      break;
    case "d": // Dismiss
      dismissFinding(state.detailState.finding.id)
        .then(() => refreshFindings())
        .then(() => { state.view = "list"; render(); });
      break;
    case "q":
      cleanup();
      process.exit(0);
      break;
    default:
      break;
  }
}

function handleSettingsKey(key: string): void {
  if (!state.settingsState) return;
  const s = state.settingsState;
  const rows = getSettingRows(s.config);

  if (s.editing) {
    if (key === "\x1b") { // Esc - cancel edit
      s.editing = false;
      render();
    } else if (key === "\r" || key === "\n") { // Enter - confirm
      const row = rows[s.selectedIndex];
      if (row) {
        s.config = applySettingEdit(s.config, row.key, s.editBuffer);
        updateConfig(s.config).catch(() => {});
      }
      s.editing = false;
      render();
    } else if (key === "\x7f" || key === "\b") { // Backspace
      s.editBuffer = s.editBuffer.slice(0, -1);
      render();
    } else if (key.length === 1 && key.charCodeAt(0) >= 32) {
      s.editBuffer += key;
      render();
    }
    return;
  }

  switch (key) {
    case "\x1b[A": // Up
    case "k":
      if (s.selectedIndex > 0) s.selectedIndex--;
      render();
      break;
    case "\x1b[B": // Down
    case "j":
      if (s.selectedIndex < rows.length - 1) s.selectedIndex++;
      render();
      break;
    case "\r": // Enter - edit
    case "\n": {
      const row = rows[s.selectedIndex];
      if (row?.editable) {
        s.editing = true;
        s.editBuffer = row.value === "(empty)" || row.value === "(none)" || row.value === "unlimited" ? "" : row.value;
        render();
      }
      break;
    }
    case "\x1b": // Esc - back
      state.view = "list";
      render();
      break;
    case "q":
      cleanup();
      process.exit(0);
      break;
    default:
      break;
  }
}

function handleCommandKey(key: string): void {
  const cmd = state.commandState;

  if (key === "\x1b") { // Esc
    state.view = "list";
    render();
    return;
  }

  if (key === "\r" || key === "\n") { // Enter - execute
    executeCommand(cmd.buffer);
    state.view = "list";
    render();
    return;
  }

  if (key === "\x7f" || key === "\b") { // Backspace
    cmd.buffer = cmd.buffer.slice(0, -1);
    if (cmd.buffer.length === 0) {
      state.view = "list";
    }
    render();
    return;
  }

  if (key === "\t") { // Tab - autocomplete
    const matches = getMatchingCommands(cmd.buffer);
    if (matches.length === 1) {
      cmd.buffer = matches[0].name;
    }
    render();
    return;
  }

  if (key.length === 1 && key.charCodeAt(0) >= 32) {
    cmd.buffer += key;
    render();
  }
}

function executeCommand(input: string): void {
  const trimmed = input.trim();
  switch (trimmed) {
    case "/analyse":
      runAnalysis("changes");
      break;
    case "/analyse-all":
      runAnalysis("project");
      break;
    case "/settings":
      openSettings();
      break;
    case "/quit":
      cleanup();
      process.exit(0);
      break;
    default:
      state.statusLine = ` Unknown command: ${trimmed}`;
      break;
  }
}

async function openSettings(): Promise<void> {
  try {
    const config = await getConfig();
    state.settingsState = { config, selectedIndex: 0, editing: false, editBuffer: "" };
    state.view = "settings";
    render();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.statusLine = ` Failed to load settings: ${msg}`;
    render();
  }
}
