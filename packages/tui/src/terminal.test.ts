import { describe, it, expect } from "vitest";
import { truncate, severityColor, severityIcon, FG_RED, FG_YELLOW, FG_CYAN, FG_GRAY } from "./terminal";

describe("truncate", () => {
  it("returns text unchanged if within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long text with ellipsis", () => {
    expect(truncate("hello world", 6)).toBe("hello\u2026");
  });

  it("handles exact length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});

describe("severityColor", () => {
  it("returns red for high", () => {
    expect(severityColor("high")).toBe(FG_RED);
  });

  it("returns yellow for medium", () => {
    expect(severityColor("medium")).toBe(FG_YELLOW);
  });

  it("returns cyan for low", () => {
    expect(severityColor("low")).toBe(FG_CYAN);
  });

  it("returns gray for info/unknown", () => {
    expect(severityColor("info")).toBe(FG_GRAY);
    expect(severityColor("unknown")).toBe(FG_GRAY);
  });
});

describe("severityIcon", () => {
  it("returns filled circle for high", () => {
    expect(severityIcon("high")).toBe("\u25CF");
  });

  it("returns triangle for medium", () => {
    expect(severityIcon("medium")).toBe("\u25B2");
  });

  it("returns open circle for low", () => {
    expect(severityIcon("low")).toBe("\u25CB");
  });

  it("returns dot for info", () => {
    expect(severityIcon("info")).toBe("\u00B7");
  });
});
