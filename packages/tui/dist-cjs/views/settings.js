"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettingRows = getSettingRows;
exports.applySettingEdit = applySettingEdit;
exports.renderSettings = renderSettings;
const terminal_js_1 = require("../terminal.js");
const PROVIDERS = ["claude", "codex", "llama-cpp", "opencode", "kiro"];
const PROMPT_MODES = ["default", "append", "replace"];
const AUTO_ANALYSE_TRIGGERS = ["disabled", "on-save", "periodically"];
function getSettingRows(config) {
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
function applySettingEdit(config, key, value) {
    const c = structuredClone(config);
    switch (key) {
        case "activeProvider":
            if (PROVIDERS.includes(value))
                c.activeProvider = value;
            break;
        case "codex.command":
            c.providers.codex.command = value;
            break;
        case "codex.args":
            c.providers.codex.args = value.split(/\s+/).filter(Boolean);
            break;
        case "llamaCpp.baseUrl":
            c.providers.llamaCpp.baseUrl = value;
            break;
        case "claude.command":
            c.providers.claude.command = value;
            break;
        case "claude.args":
            c.providers.claude.args = value.split(/\s+/).filter(Boolean);
            break;
        case "opencode.command":
            c.providers.opencode.command = value;
            break;
        case "opencode.args":
            c.providers.opencode.args = value.split(/\s+/).filter(Boolean);
            break;
        case "kiro.command":
            c.providers.kiro.command = value;
            break;
        case "kiro.args":
            c.providers.kiro.args = value.split(/\s+/).filter(Boolean);
            break;
        case "systemPrompt.mode":
            if (PROMPT_MODES.includes(value))
                c.systemPrompt.mode = value;
            break;
        case "systemPrompt.text":
            c.systemPrompt.text = value;
            break;
        case "autoAnalyse.trigger":
            if (AUTO_ANALYSE_TRIGGERS.includes(value))
                c.autoAnalyse.trigger = value;
            break;
        case "autoAnalyse.intervalMinutes": {
            const n = parseInt(value, 10);
            if (n > 0)
                c.autoAnalyse.intervalMinutes = n;
            break;
        }
        case "codingStandardsFolder":
            c.codingStandardsFolder = value.trim() || null;
            break;
        case "maxFilesPerRun": {
            const n = parseInt(value, 10);
            c.maxFilesPerRun = n > 0 ? n : null;
            break;
        }
        case "preCommit.blockOnFindings":
            c.preCommit.blockOnFindings = value === "yes" || value === "true";
            break;
        case "debugLogging":
            c.debugLogging = value === "on" || value === "true";
            break;
    }
    return c;
}
function renderSettings(state) {
    const { rows: termRows, cols } = (0, terminal_js_1.getTerminalSize)();
    const rows = getSettingRows(state.config);
    const headerHeight = 3;
    const footerHeight = 2;
    const listHeight = termRows - headerHeight - footerHeight;
    let output = "";
    // Header
    output += (0, terminal_js_1.moveTo)(1, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.BOLD}${terminal_js_1.FG_WHITE} Settings${terminal_js_1.RESET}`;
    output += (0, terminal_js_1.moveTo)(2, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.DIM}${"─".repeat(cols)}${terminal_js_1.RESET}`;
    output += (0, terminal_js_1.moveTo)(3, 1) + (0, terminal_js_1.clearLine)();
    // Settings list
    const scrollOffset = Math.max(0, state.selectedIndex - listHeight + 3);
    for (let i = 0; i < listHeight; i++) {
        const idx = i + scrollOffset;
        const row = rows[idx];
        const line = headerHeight + i + 1;
        output += (0, terminal_js_1.moveTo)(line, 1) + (0, terminal_js_1.clearLine)();
        if (!row)
            continue;
        const isSelected = idx === state.selectedIndex;
        const labelWidth = 24;
        const label = row.label.padEnd(labelWidth);
        if (isSelected && state.editing) {
            output += ` ${terminal_js_1.FG_CYAN}${label}${terminal_js_1.RESET} ${terminal_js_1.FG_GREEN}${state.editBuffer}█${terminal_js_1.RESET}`;
        }
        else if (isSelected) {
            output += `${terminal_js_1.INVERSE} ${label} ${row.value}${" ".repeat(Math.max(0, cols - labelWidth - row.value.length - 3))}${terminal_js_1.RESET}`;
        }
        else {
            output += ` ${terminal_js_1.DIM}${label}${terminal_js_1.RESET} ${row.value}`;
        }
    }
    // Footer
    output += (0, terminal_js_1.moveTo)(termRows - 1, 1) + (0, terminal_js_1.clearLine)();
    if (state.editing) {
        output += `${terminal_js_1.DIM} type value, enter to confirm, esc to cancel${terminal_js_1.RESET}`;
    }
    else {
        output += `${terminal_js_1.DIM} ↑/↓ navigate  enter edit  tab cycle (provider/mode)  esc back  q quit${terminal_js_1.RESET}`;
    }
    output += (0, terminal_js_1.moveTo)(termRows, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.DIM} Changes are saved immediately to the service${terminal_js_1.RESET}`;
    (0, terminal_js_1.write)(output);
}
