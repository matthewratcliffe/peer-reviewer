"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FG_GRAY = exports.FG_WHITE = exports.FG_MAGENTA = exports.FG_CYAN = exports.FG_GREEN = exports.FG_YELLOW = exports.FG_RED = exports.INVERSE = exports.RESET = exports.DIM = exports.BOLD = exports.SHOW_CURSOR = exports.HIDE_CURSOR = exports.CLEAR_SCREEN = exports.CSI = void 0;
exports.moveTo = moveTo;
exports.clearLine = clearLine;
exports.write = write;
exports.getTerminalSize = getTerminalSize;
exports.startKeypress = startKeypress;
exports.stopKeypress = stopKeypress;
exports.severityColor = severityColor;
exports.severityIcon = severityIcon;
exports.truncate = truncate;
exports.CSI = "\x1b[";
exports.CLEAR_SCREEN = `${exports.CSI}2J${exports.CSI}H`;
exports.HIDE_CURSOR = `${exports.CSI}?25l`;
exports.SHOW_CURSOR = `${exports.CSI}?25h`;
exports.BOLD = `${exports.CSI}1m`;
exports.DIM = `${exports.CSI}2m`;
exports.RESET = `${exports.CSI}0m`;
exports.INVERSE = `${exports.CSI}7m`;
exports.FG_RED = `${exports.CSI}31m`;
exports.FG_YELLOW = `${exports.CSI}33m`;
exports.FG_GREEN = `${exports.CSI}32m`;
exports.FG_CYAN = `${exports.CSI}36m`;
exports.FG_MAGENTA = `${exports.CSI}35m`;
exports.FG_WHITE = `${exports.CSI}37m`;
exports.FG_GRAY = `${exports.CSI}90m`;
function moveTo(row, col) {
    return `${exports.CSI}${row};${col}H`;
}
function clearLine() {
    return `${exports.CSI}2K`;
}
function write(text) {
    process.stdout.write(text);
}
function getTerminalSize() {
    return {
        rows: process.stdout.rows || 24,
        cols: process.stdout.columns || 80,
    };
}
let rl = null;
function startKeypress(handler) {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (data) => {
        const buf = Buffer.from(data, "utf8");
        handler(data, buf);
    });
}
function stopKeypress() {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }
    process.stdin.pause();
}
function severityColor(severity) {
    switch (severity) {
        case "high": return exports.FG_RED;
        case "medium": return exports.FG_YELLOW;
        case "low": return exports.FG_CYAN;
        default: return exports.FG_GRAY;
    }
}
function severityIcon(severity) {
    switch (severity) {
        case "high": return "●";
        case "medium": return "▲";
        case "low": return "○";
        default: return "·";
    }
}
function truncate(text, maxLen) {
    if (text.length <= maxLen)
        return text;
    return text.slice(0, maxLen - 1) + "…";
}
