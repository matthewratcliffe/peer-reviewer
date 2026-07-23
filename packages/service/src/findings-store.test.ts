import { describe, it, expect, beforeEach } from "vitest";
import { FindingsStore } from "./findings-store";
import type { Finding } from "./api-types";

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

describe("FindingsStore", () => {
  let store: FindingsStore;

  beforeEach(() => {
    store = new FindingsStore();
  });

  it("stores and retrieves findings by file", () => {
    const finding = makeFinding();
    store.replaceForFile("src/index.ts", [finding]);
    expect(store.forFile("src/index.ts")).toEqual([finding]);
  });

  it("returns empty array for unknown file", () => {
    expect(store.forFile("unknown.ts")).toEqual([]);
  });

  it("replaces findings for a file", () => {
    const f1 = makeFinding({ id: "f1", title: "First" });
    const f2 = makeFinding({ id: "f2", title: "Second" });
    store.replaceForFile("src/index.ts", [f1]);
    store.replaceForFile("src/index.ts", [f2]);
    expect(store.forFile("src/index.ts")).toEqual([f2]);
  });

  it("returns all findings across files", () => {
    const f1 = makeFinding({ id: "f1", file: "a.ts" });
    const f2 = makeFinding({ id: "f2", file: "b.ts" });
    store.replaceForFile("a.ts", [f1]);
    store.replaceForFile("b.ts", [f2]);
    expect(store.all()).toHaveLength(2);
  });

  it("dismisses a finding by id", () => {
    const finding = makeFinding({ id: "f1" });
    store.replaceForFile("src/index.ts", [finding]);
    const result = store.dismiss("f1");
    expect(result).toBe(true);
    expect(store.forFile("src/index.ts")[0].dismissed).toBe(true);
  });

  it("returns false when dismissing unknown id", () => {
    expect(store.dismiss("nonexistent")).toBe(false);
  });

  it("preserves dismissed state on replaceForFile", () => {
    const finding = makeFinding({ id: "f1" });
    store.replaceForFile("src/index.ts", [finding]);
    store.dismiss("f1");
    store.replaceForFile("src/index.ts", [makeFinding({ id: "f1", title: "Updated" })]);
    expect(store.forFile("src/index.ts")[0].dismissed).toBe(true);
  });

  it("openBlockingFindings returns only undismissed medium/high", () => {
    store.replaceForFile("a.ts", [
      makeFinding({ id: "1", severity: "high", dismissed: false }),
      makeFinding({ id: "2", severity: "medium", dismissed: false }),
      makeFinding({ id: "3", severity: "low", dismissed: false }),
      makeFinding({ id: "4", severity: "info", dismissed: false }),
      makeFinding({ id: "5", severity: "high", dismissed: true }),
    ]);
    const blocking = store.openBlockingFindings();
    expect(blocking).toHaveLength(2);
    expect(blocking.map((f) => f.id).sort()).toEqual(["1", "2"]);
  });
});
