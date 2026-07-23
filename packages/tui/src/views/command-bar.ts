import {
  BOLD, RESET, DIM, FG_WHITE, FG_CYAN, FG_GRAY,
  moveTo, clearLine, write, getTerminalSize,
} from "../terminal.js";

export interface CommandBarState {
  active: boolean;
  buffer: string;
  suggestions: string[];
}

const COMMANDS = [
  { name: "/analyse", description: "Re-analyse current changeset" },
  { name: "/analyse-all", description: "Re-analyse entire project" },
  { name: "/settings", description: "Open settings" },
  { name: "/quit", description: "Exit peer-reviewer" },
];

export function getMatchingCommands(input: string): typeof COMMANDS {
  if (!input.startsWith("/")) return [];
  return COMMANDS.filter((cmd) => cmd.name.startsWith(input));
}

export function renderCommandBar(state: CommandBarState): void {
  const { rows: termRows, cols } = getTerminalSize();
  const matches = getMatchingCommands(state.buffer);

  // Render suggestions above the command bar
  const suggestionsStart = termRows - 1 - matches.length;
  for (let i = 0; i < matches.length; i++) {
    const row = suggestionsStart + i;
    if (row < 1) continue;
    write(moveTo(row, 1) + clearLine());
    write(`  ${FG_CYAN}${matches[i].name}${RESET} ${DIM}${matches[i].description}${RESET}`);
  }

  // Command input line
  write(moveTo(termRows, 1) + clearLine());
  write(` ${FG_WHITE}${state.buffer}█${RESET}`);
}
