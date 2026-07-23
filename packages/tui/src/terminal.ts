import * as readline from "node:readline";

export const CSI = "\x1b[";
export const CLEAR_SCREEN = `${CSI}2J${CSI}H`;
export const HIDE_CURSOR = `${CSI}?25l`;
export const SHOW_CURSOR = `${CSI}?25h`;
export const BOLD = `${CSI}1m`;
export const DIM = `${CSI}2m`;
export const RESET = `${CSI}0m`;
export const INVERSE = `${CSI}7m`;

export const FG_RED = `${CSI}31m`;
export const FG_YELLOW = `${CSI}33m`;
export const FG_GREEN = `${CSI}32m`;
export const FG_CYAN = `${CSI}36m`;
export const FG_MAGENTA = `${CSI}35m`;
export const FG_WHITE = `${CSI}37m`;
export const FG_GRAY = `${CSI}90m`;

export function moveTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

export function clearLine(): string {
  return `${CSI}2K`;
}

export function write(text: string): void {
  process.stdout.write(text);
}

export function getTerminalSize(): { rows: number; cols: number } {
  return {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 80,
  };
}

export type KeyHandler = (key: string, raw: Buffer) => void;

let rl: readline.Interface | null = null;

export function startKeypress(handler: KeyHandler): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data: string) => {
    const buf = Buffer.from(data, "utf8");
    handler(data, buf);
  });
}

export function stopKeypress(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.pause();
}

export function severityColor(severity: string): string {
  switch (severity) {
    case "high": return FG_RED;
    case "medium": return FG_YELLOW;
    case "low": return FG_CYAN;
    default: return FG_GRAY;
  }
}

export function severityIcon(severity: string): string {
  switch (severity) {
    case "high": return "●";
    case "medium": return "▲";
    case "low": return "○";
    default: return "·";
  }
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}
