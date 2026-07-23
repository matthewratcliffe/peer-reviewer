"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderFindingDetail = renderFindingDetail;
const terminal_js_1 = require("../terminal.js");
function renderFindingDetail(state) {
    const { rows: termRows, cols } = (0, terminal_js_1.getTerminalSize)();
    const { finding } = state;
    const headerHeight = 5;
    const footerHeight = 2;
    const contentHeight = termRows - headerHeight - footerHeight;
    const color = (0, terminal_js_1.severityColor)(finding.severity);
    const icon = (0, terminal_js_1.severityIcon)(finding.severity);
    let output = "";
    // Header
    output += (0, terminal_js_1.moveTo)(1, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.BOLD}${terminal_js_1.FG_WHITE} Finding Detail${terminal_js_1.RESET}`;
    output += (0, terminal_js_1.moveTo)(2, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.DIM}${"─".repeat(cols)}${terminal_js_1.RESET}`;
    output += (0, terminal_js_1.moveTo)(3, 1) + (0, terminal_js_1.clearLine)();
    output += ` ${color}${icon} ${terminal_js_1.BOLD}${finding.title}${terminal_js_1.RESET}`;
    output += (0, terminal_js_1.moveTo)(4, 1) + (0, terminal_js_1.clearLine)();
    output += ` ${terminal_js_1.DIM}${finding.file}:${finding.startLine}-${finding.endLine}${terminal_js_1.RESET}  ${color}${finding.severity.toUpperCase()}${terminal_js_1.RESET}  ${terminal_js_1.DIM}${finding.category}${terminal_js_1.RESET}  ${terminal_js_1.DIM}provider: ${finding.provider}${terminal_js_1.RESET}`;
    output += (0, terminal_js_1.moveTo)(5, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.DIM}${"─".repeat(cols)}${terminal_js_1.RESET}`;
    // Message body - wrap lines
    const messageLines = wrapText(finding.message, cols - 2);
    const totalLines = messageLines.length;
    // Adjust scroll
    if (state.scrollOffset > Math.max(0, totalLines - contentHeight)) {
        state.scrollOffset = Math.max(0, totalLines - contentHeight);
    }
    if (state.scrollOffset < 0)
        state.scrollOffset = 0;
    for (let i = 0; i < contentHeight; i++) {
        const lineIdx = i + state.scrollOffset;
        const row = headerHeight + i + 1;
        output += (0, terminal_js_1.moveTo)(row, 1) + (0, terminal_js_1.clearLine)();
        if (lineIdx < messageLines.length) {
            output += ` ${messageLines[lineIdx]}`;
        }
    }
    // Footer
    output += (0, terminal_js_1.moveTo)(termRows - 1, 1) + (0, terminal_js_1.clearLine)();
    if (totalLines > contentHeight) {
        const pct = Math.round(((state.scrollOffset + contentHeight) / totalLines) * 100);
        output += `${terminal_js_1.DIM} ${pct}% (${totalLines} lines)${terminal_js_1.RESET}`;
    }
    output += (0, terminal_js_1.moveTo)(termRows, 1) + (0, terminal_js_1.clearLine)();
    output += `${terminal_js_1.DIM} esc/backspace back  ↑/↓ scroll  d dismiss  q quit${terminal_js_1.RESET}`;
    (0, terminal_js_1.write)(output);
}
function wrapText(text, maxWidth) {
    const lines = [];
    const paragraphs = text.split("\n");
    for (const para of paragraphs) {
        if (para.length === 0) {
            lines.push("");
            continue;
        }
        let remaining = para;
        while (remaining.length > maxWidth) {
            let breakAt = remaining.lastIndexOf(" ", maxWidth);
            if (breakAt <= 0)
                breakAt = maxWidth;
            lines.push(remaining.slice(0, breakAt));
            remaining = remaining.slice(breakAt + 1);
        }
        if (remaining.length > 0)
            lines.push(remaining);
    }
    return lines;
}
