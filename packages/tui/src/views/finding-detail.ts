import type { Finding } from "../client.js";
import {
  BOLD, RESET, DIM, FG_WHITE, FG_GRAY,
  moveTo, clearLine, write, getTerminalSize, severityColor, severityIcon,
} from "../terminal.js";

export interface DetailState {
  finding: Finding;
  scrollOffset: number;
}

export function renderFindingDetail(state: DetailState): void {
  const { rows: termRows, cols } = getTerminalSize();
  const { finding } = state;

  const headerHeight = 5;
  const footerHeight = 2;
  const contentHeight = termRows - headerHeight - footerHeight;

  const color = severityColor(finding.severity);
  const icon = severityIcon(finding.severity);

  let output = "";

  // Header
  output += moveTo(1, 1) + clearLine();
  output += `${BOLD}${FG_WHITE} Finding Detail${RESET}`;
  output += moveTo(2, 1) + clearLine();
  output += `${DIM}${"─".repeat(cols)}${RESET}`;
  output += moveTo(3, 1) + clearLine();
  output += ` ${color}${icon} ${BOLD}${finding.title}${RESET}`;
  output += moveTo(4, 1) + clearLine();
  output += ` ${DIM}${finding.file}:${finding.startLine}-${finding.endLine}${RESET}  ${color}${finding.severity.toUpperCase()}${RESET}  ${DIM}${finding.category}${RESET}  ${DIM}provider: ${finding.provider}${RESET}`;
  output += moveTo(5, 1) + clearLine();
  output += `${DIM}${"─".repeat(cols)}${RESET}`;

  // Message body - wrap lines
  const messageLines = wrapText(finding.message, cols - 2);
  const totalLines = messageLines.length;

  // Adjust scroll
  if (state.scrollOffset > Math.max(0, totalLines - contentHeight)) {
    state.scrollOffset = Math.max(0, totalLines - contentHeight);
  }
  if (state.scrollOffset < 0) state.scrollOffset = 0;

  for (let i = 0; i < contentHeight; i++) {
    const lineIdx = i + state.scrollOffset;
    const row = headerHeight + i + 1;
    output += moveTo(row, 1) + clearLine();
    if (lineIdx < messageLines.length) {
      output += ` ${messageLines[lineIdx]}`;
    }
  }

  // Footer
  output += moveTo(termRows - 1, 1) + clearLine();
  if (totalLines > contentHeight) {
    const pct = Math.round(((state.scrollOffset + contentHeight) / totalLines) * 100);
    output += `${DIM} ${pct}% (${totalLines} lines)${RESET}`;
  }
  output += moveTo(termRows, 1) + clearLine();
  output += `${DIM} esc/backspace back  ↑/↓ scroll  d dismiss  q quit${RESET}`;

  write(output);
}

function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (para.length === 0) {
      lines.push("");
      continue;
    }
    let remaining = para;
    while (remaining.length > maxWidth) {
      let breakAt = remaining.lastIndexOf(" ", maxWidth);
      if (breakAt <= 0) breakAt = maxWidth;
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt + 1);
    }
    if (remaining.length > 0) lines.push(remaining);
  }
  return lines;
}
