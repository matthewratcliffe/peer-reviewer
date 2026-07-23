import type { Finding } from "../client.js";
import {
  BOLD, RESET, DIM, INVERSE, FG_GRAY, FG_WHITE,
  moveTo, clearLine, write, getTerminalSize, truncate,
  severityColor, severityIcon,
} from "../terminal.js";

export interface FindingsListState {
  findings: Finding[];
  selectedIndex: number;
  scrollOffset: number;
}

interface GroupedFindings {
  file: string;
  items: Finding[];
}

function groupByFile(findings: Finding[]): GroupedFindings[] {
  const map = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = map.get(f.file) ?? [];
    list.push(f);
    map.set(f.file, list);
  }
  return Array.from(map.entries()).map(([file, items]) => ({ file, items }));
}

export interface ListRow {
  type: "header" | "finding";
  text: string;
  finding?: Finding;
  file?: string;
}

export function buildRows(findings: Finding[]): ListRow[] {
  const groups = groupByFile(findings);
  const rows: ListRow[] = [];
  for (const group of groups) {
    rows.push({ type: "header", text: group.file, file: group.file });
    for (const f of group.items) {
      const icon = severityIcon(f.severity);
      const text = `  ${icon} ${f.title}`;
      rows.push({ type: "finding", text, finding: f });
    }
  }
  return rows;
}

export function renderFindingsList(
  state: FindingsListState,
  rows: ListRow[],
  statusLine: string
): void {
  const { rows: termRows, cols } = getTerminalSize();
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
  output += moveTo(1, 1) + clearLine();
  output += `${BOLD}${FG_WHITE} Virtual Peer Review ${RESET}${DIM} — ${state.findings.length} finding(s)${RESET}`;
  output += moveTo(2, 1) + clearLine();
  output += `${DIM}${" ".repeat(cols)}${RESET}`;
  output += moveTo(3, 1) + clearLine();

  // List
  for (let i = 0; i < listHeight; i++) {
    const rowIdx = i + state.scrollOffset;
    const row = rows[rowIdx];
    const line = headerHeight + i + 1;
    output += moveTo(line, 1) + clearLine();

    if (!row) continue;

    const isSelected = rowIdx === state.selectedIndex;

    if (row.type === "header") {
      const fileText = truncate(row.text, cols - 2);
      if (isSelected) {
        output += `${INVERSE}${BOLD} ${fileText}${" ".repeat(Math.max(0, cols - fileText.length - 1))}${RESET}`;
      } else {
        output += `${BOLD}${FG_WHITE} ${fileText}${RESET}`;
      }
    } else if (row.type === "finding" && row.finding) {
      const f = row.finding;
      const color = severityColor(f.severity);
      const icon = severityIcon(f.severity);
      const prefix = `  ${icon} `;
      const lineInfo = `${DIM}:${f.startLine}${RESET} `;
      const title = truncate(f.title, cols - 12);
      const dismissed = f.dismissed ? `${DIM} [dismissed]${RESET}` : "";

      if (isSelected) {
        output += `${INVERSE}${color}${prefix}${RESET}${INVERSE}${title}${lineInfo}${dismissed}${" ".repeat(Math.max(0, cols - prefix.length - title.length - String(f.startLine).length - 2 - (f.dismissed ? 12 : 0)))}${RESET}`;
      } else {
        output += `${color}${prefix}${RESET}${title} ${lineInfo}${dismissed}`;
      }
    }
  }

  // Footer
  const footerRow = termRows - 1;
  output += moveTo(footerRow, 1) + clearLine();
  output += `${DIM}${statusLine}${RESET}`;
  output += moveTo(termRows, 1) + clearLine();
  output += `${DIM} ↑/↓ navigate  enter detail  d dismiss  /command  s settings  q quit${RESET}`;

  write(output);
}
