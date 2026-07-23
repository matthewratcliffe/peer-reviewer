"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startApp = startApp;
const client_js_1 = require("./client.js");
const terminal_js_1 = require("./terminal.js");
const findings_list_js_1 = require("./views/findings-list.js");
const finding_detail_js_1 = require("./views/finding-detail.js");
const settings_js_1 = require("./views/settings.js");
const command_bar_js_1 = require("./views/command-bar.js");
let state;
async function startApp() {
    const repoPath = process.cwd();
    (0, terminal_js_1.write)(terminal_js_1.CLEAR_SCREEN + terminal_js_1.HIDE_CURSOR);
    (0, terminal_js_1.write)(" Connecting to peer-reviewer-service...");
    let repoRoot;
    try {
        repoRoot = await (0, client_js_1.ensureRunningAndRegister)(repoPath);
    }
    catch (err) {
        (0, terminal_js_1.write)(terminal_js_1.SHOW_CURSOR);
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
    (0, terminal_js_1.startKeypress)(handleKey);
    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(0); });
    process.on("SIGTERM", () => { cleanup(); process.exit(0); });
    // Run initial analysis on changeset
    await runAnalysis("changes");
    // Initial load of findings
    await refreshFindings();
    render();
}
function cleanup() {
    (0, terminal_js_1.write)(terminal_js_1.SHOW_CURSOR + terminal_js_1.CLEAR_SCREEN);
    (0, terminal_js_1.stopKeypress)();
}
async function refreshFindings() {
    try {
        state.findings = await (0, client_js_1.getAllFindings)(state.repoRoot);
        state.listState.findings = state.findings;
        state.listRows = (0, findings_list_js_1.buildRows)(state.findings);
        if (state.listState.selectedIndex >= state.listRows.length) {
            state.listState.selectedIndex = Math.max(0, state.listRows.length - 1);
        }
        state.statusLine = ` ${state.findings.length} finding(s) — ${state.findings.filter((f) => !f.dismissed).length} active`;
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state.statusLine = ` Error: ${msg}`;
    }
}
async function runAnalysis(scope) {
    state.analysisRunning = true;
    state.statusLine = ` Analysing ${scope === "project" ? "all files" : "changes"}...`;
    render();
    // Poll progress in background
    const progressInterval = setInterval(async () => {
        try {
            const progress = await (0, client_js_1.getAnalysisProgress)(state.repoRoot);
            if (progress.total > 0) {
                state.statusLine = ` Analysing: ${progress.completed}/${progress.total} files`;
                render();
            }
        }
        catch {
            // ignore
        }
    }, 1000);
    try {
        if (scope === "changes") {
            await (0, client_js_1.analyzeChanges)(state.repoRoot);
        }
        else {
            await (0, client_js_1.analyzeProject)(state.repoRoot);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state.statusLine = ` Analysis failed: ${msg}`;
    }
    finally {
        clearInterval(progressInterval);
        state.analysisRunning = false;
        await refreshFindings();
        render();
    }
}
function render() {
    (0, terminal_js_1.write)(terminal_js_1.CLEAR_SCREEN + terminal_js_1.HIDE_CURSOR);
    switch (state.view) {
        case "list":
            (0, findings_list_js_1.renderFindingsList)(state.listState, state.listRows, state.statusLine);
            break;
        case "detail":
            if (state.detailState)
                (0, finding_detail_js_1.renderFindingDetail)(state.detailState);
            break;
        case "settings":
            if (state.settingsState)
                (0, settings_js_1.renderSettings)(state.settingsState);
            break;
        case "command":
            (0, findings_list_js_1.renderFindingsList)(state.listState, state.listRows, state.statusLine);
            (0, command_bar_js_1.renderCommandBar)(state.commandState);
            break;
    }
}
function handleKey(key, raw) {
    // Ctrl+C always quits
    if (key === "\x03") {
        cleanup();
        process.exit(0);
    }
    switch (state.view) {
        case "list":
            handleListKey(key);
            break;
        case "detail":
            handleDetailKey(key);
            break;
        case "settings":
            handleSettingsKey(key);
            break;
        case "command":
            handleCommandKey(key);
            break;
    }
}
function handleListKey(key) {
    const rows = state.listRows;
    switch (key) {
        case "\x1b[A": // Up
        case "k":
            if (state.listState.selectedIndex > 0)
                state.listState.selectedIndex--;
            render();
            break;
        case "\x1b[B": // Down
        case "j":
            if (state.listState.selectedIndex < rows.length - 1)
                state.listState.selectedIndex++;
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
                (0, client_js_1.dismissFinding)(row.finding.id).then(() => refreshFindings()).then(() => render());
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
function handleDetailKey(key) {
    if (!state.detailState)
        return;
    switch (key) {
        case "\x1b[A": // Up
        case "k":
            if (state.detailState.scrollOffset > 0)
                state.detailState.scrollOffset--;
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
            (0, client_js_1.dismissFinding)(state.detailState.finding.id)
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
function handleSettingsKey(key) {
    if (!state.settingsState)
        return;
    const s = state.settingsState;
    const rows = (0, settings_js_1.getSettingRows)(s.config);
    if (s.editing) {
        if (key === "\x1b") { // Esc - cancel edit
            s.editing = false;
            render();
        }
        else if (key === "\r" || key === "\n") { // Enter - confirm
            const row = rows[s.selectedIndex];
            if (row) {
                s.config = (0, settings_js_1.applySettingEdit)(s.config, row.key, s.editBuffer);
                (0, client_js_1.updateConfig)(s.config).catch(() => { });
            }
            s.editing = false;
            render();
        }
        else if (key === "\x7f" || key === "\b") { // Backspace
            s.editBuffer = s.editBuffer.slice(0, -1);
            render();
        }
        else if (key.length === 1 && key.charCodeAt(0) >= 32) {
            s.editBuffer += key;
            render();
        }
        return;
    }
    switch (key) {
        case "\x1b[A": // Up
        case "k":
            if (s.selectedIndex > 0)
                s.selectedIndex--;
            render();
            break;
        case "\x1b[B": // Down
        case "j":
            if (s.selectedIndex < rows.length - 1)
                s.selectedIndex++;
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
function handleCommandKey(key) {
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
        const matches = (0, command_bar_js_1.getMatchingCommands)(cmd.buffer);
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
function executeCommand(input) {
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
async function openSettings() {
    try {
        const config = await (0, client_js_1.getConfig)();
        state.settingsState = { config, selectedIndex: 0, editing: false, editBuffer: "" };
        state.view = "settings";
        render();
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        state.statusLine = ` Failed to load settings: ${msg}`;
        render();
    }
}
