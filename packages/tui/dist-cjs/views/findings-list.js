"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRows = buildRows;
exports.renderFindingsList = renderFindingsList;
const terminal_js_1 = require("../terminal.js");
function groupByFile(findings) {
    const map = new Map();
    for (const f of findings) {
        const list = map.get(f.file) ?? [];
        list.push(f);
        map.set(f.file, list);
    }
    return Array.from(map.entries()).map(([file, items]) => ({ file, items }));
}
function buildRows(findings) {
    const groups = groupByFile(findings);
    const rows = [];
    for (const group of groups) {
        rows.push({ type: "header", text: group.file, file: group.file });
        for (const f of group.items) {
            const icon = (0, terminal_js_1.severityIcon)(f.severity);
            const text = `  ${icon} ${f.title}`;
            rows.push({ type: "finding", text, finding: f });
        }
    }
    return rows;
}
function renderFindingsList(state, rows, statusLine) {
    const { rows: termRows, cols } = (0, terminal_js_1.getTerminalSize)();
    const headerHeight = 3;
    const footerHeight = 2;
    const listHeight = termRows - headerHeight - footerHeight;
    // Adjust scroll
    if (state.selectedIndex < state.scrollOffset) {
        state.scrollOffset = state.selectedIndex;
    }
    if (state.selectedIndex >= state.scrollOffset + listHeight) {
        state.scrollOffset = state.selectedIndex - listHeight + 1;
    }
    let output = "";
    // Header
    output += (0, terminal_js_1.moveTo)(1, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.BOLD}${terminal_js_1.FG_WHITE} Virtual Peer Review ${terminal_js_1.RESET}${terminal_js_1.DIM} — ${state.findings.length} finding(s)${terminal_js_1.RESET}`;
    output += (0, terminal_js_1.moveTo)(2, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.DIM}${" ".repeat(cols)}${terminal_js_1.RESET}`;
    output += (0, terminal_js_1.moveTo)(3, 1) + (0, terminal_js_1.clearLine)();
    // List
    for (let i = 0; i < listHeight; i++) {
        const rowIdx = i + state.scrollOffset;
        const row = rows[rowIdx];
        const line = headerHeight + i + 1;
        output += (0, terminal_js_1.moveTo)(line, 1) + (0, terminal_js_1.clearLine)();
        if (!row)
            continue;
        const isSelected = rowIdx === state.selectedIndex;
        if (row.type === "header") {
            const fileText = (0, terminal_js_1.truncate)(row.text, cols - 2);
            if (isSelected) {
                output += `${terminal_js_1.INVERSE}${terminal_js_1.BOLD} ${fileText}${" ".repeat(Math.max(0, cols - fileText.length - 1))}${terminal_js_1.RESET}`;
            }
            else {
                output += `${terminal_js_1.BOLD}${terminal_js_1.FG_WHITE} ${fileText}${terminal_js_1.RESET}`;
            }
        }
        else if (row.type === "finding" && row.finding) {
            const f = row.finding;
            const color = (0, terminal_js_1.severityColor)(f.severity);
            const icon = (0, terminal_js_1.severityIcon)(f.severity);
            const prefix = `  ${icon} `;
            const lineInfo = `${terminal_js_1.DIM}:${f.startLine}${terminal_js_1.RESET} `;
            const title = (0, terminal_js_1.truncate)(f.title, cols - 12);
            const dismissed = f.dismissed ? `${terminal_js_1.DIM} [dismissed]${terminal_js_1.RESET}` : "";
            if (isSelected) {
                output += `${terminal_js_1.INVERSE}${color}${prefix}${terminal_js_1.RESET}${terminal_js_1.INVERSE}${title}${lineInfo}${dismissed}${" ".repeat(Math.max(0, cols - prefix.length - title.length - String(f.startLine).length - 2 - (f.dismissed ? 12 : 0)))}${terminal_js_1.RESET}`;
            }
            else {
                output += `${color}${prefix}${terminal_js_1.RESET}${title} ${lineInfo}${dismissed}`;
            }
        }
    }
    // Footer
    const footerRow = termRows - 1;
    output += (0, terminal_js_1.moveTo)(footerRow, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.DIM}${statusLine}${terminal_js_1.RESET}`;
    output += (0, terminal_js_1.moveTo)(termRows, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.DIM} ↑/↓ navigate  enter detail  d dismiss  /command  s settings  q quit${terminal_js_1.RESET}`;
    (0, terminal_js_1.write)(output);
}
