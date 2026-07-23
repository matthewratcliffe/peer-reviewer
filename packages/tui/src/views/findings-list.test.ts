import { describe, it, expect } from "vitest";
import { buildRows } from "./findings-list";
import type { Finding } from "../client";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "f1",
    file: "src/index.ts",
    startLine: 1,
    endLine: 5,
    severity: "medium",
    category: "correctness",
    title: "Test finding",
    message: "Something is wrong",
    provider: "claude",
    dismissed: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildRows", () => {
  it("returns empty array for no findings", () => {
    expect(buildRows([])).toEqual([]);
  });

  it("groups findings by file with header rows", () => {
    const findings = [
      makeFinding({ id: "1", file: "a.ts", title: "Bug A" }),
      makeFinding({ id: "2", file: "a.ts", title: "Bug B" }),
      makeFinding({ id: "3", file: "b.ts", title: "Bug C" }),
    ];
    const rows = buildRows(findings);
    expect(rows[0].type).toBe("header");
    expect(rows[0].file).toBe("a.ts");
    expect(rows[1].type).toBe("finding");
    expect(rows[1].finding?.title).toBe("Bug A");
    expect(rows[2].type).toBe("finding");
    expect(rows[2].finding?.title).toBe("Bug B");
    expect(rows[3].type).toBe("header");
    expect(rows[3].file).toBe("b.ts");
    expect(rows[4].type).toBe("finding");
    expect(rows[4].finding?.title).toBe("Bug C");
  });

  it("includes severity icon in finding text", () => {
    const findings = [makeFinding({ severity: "high", title: "Critical" })];
    const rows = buildRows(findings);
    const findingRow = rows.find((r) => r.type === "finding");
    expect(findingRow?.text).toContain("\u25CF");
    expect(findingRow?.text).toContain("Critical");
  });
});
