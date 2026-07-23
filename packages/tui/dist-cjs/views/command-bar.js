"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchingCommands = getMatchingCommands;
exports.renderCommandBar = renderCommandBar;
const terminal_js_1 = require("../terminal.js");
const COMMANDS = [
    { name: "/analyse", description: "Re-analyse current changeset" },
    { name: "/analyse-all", description: "Re-analyse entire project" },
    { name: "/settings", description: "Open settings" },
    { name: "/quit", description: "Exit peer-reviewer" },
];
function getMatchingCommands(input) {
    if (!input.startsWith("/"))
        return [];
    return COMMANDS.filter((cmd) => cmd.name.startsWith(input));
}
function renderCommandBar(state) {
    const { rows: termRows, cols } = (0, terminal_js_1.getTerminalSize)();
    const matches = getMatchingCommands(state.buffer);
    // Render suggestions above the command bar
    const suggestionsStart = termRows - 1 - matches.length;
    for (let i = 0; i < matches.length; i++) {
        const row = suggestionsStart + i;
        if (row < 1)
            continue;
        (0, terminal_js_1.write)((0, terminal_js_1.moveTo)(row, 1) + (0, terminal_js_1.clearLine)());
        (0, terminal_js_1.write)(`  ${terminal_js_1.FG_CYAN}${matches[i].name}${terminal_js_1.RESET} ${terminal_js_1.DIM}${matches[i].description}${terminal_js_1.RESET}`);
    }
    // Command input line
    (0, terminal_js_1.write)((0, terminal_js_1.moveTo)(termRows, 1) + (0, terminal_js_1.clearLine)());
    (0, terminal_js_1.write)(` ${terminal_js_1.FG_WHITE}${state.buffer}█${terminal_js_1.RESET}`);
}
