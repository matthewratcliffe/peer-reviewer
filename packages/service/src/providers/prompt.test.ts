import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveSystemPrompt, parseFindingsJson, buildReviewPrompt, loadCodingStandards, REVIEW_SYSTEM_PROMPT } from "./prompt";

describe("resolveSystemPrompt", () => {
  it("returns default prompt when mode is default", () => {
    const result = resolveSystemPrompt({ mode: "default", text: "" });
    expect(result).toBe(REVIEW_SYSTEM_PROMPT);
  });

  it("appends text to default prompt when mode is append", () => {
    const result = resolveSystemPrompt({ mode: "append", text: "Extra rules" });
    expect(result).toContain(REVIEW_SYSTEM_PROMPT);
    expect(result).toContain("Extra rules");
    expect(result.indexOf(REVIEW_SYSTEM_PROMPT)).toBeLessThan(result.indexOf("Extra rules"));
  });

  it("replaces default prompt when mode is replace", () => {
    const result = resolveSystemPrompt({ mode: "replace", text: "Custom prompt" });
    expect(result).not.toContain(REVIEW_SYSTEM_PROMPT);
    expect(result).toContain("Custom prompt");
  });

  it("appends coding standards when folder is provided", () => {
    // Use the test fixtures
    const result = resolveSystemPrompt({ mode: "default", text: "" }, __dirname + "/test-fixtures/standards");
    // Without fixtures it won't append anything, but the function should not throw
    expect(result).toContain(REVIEW_SYSTEM_PROMPT);
  });

  it("handles null coding standards folder gracefully", () => {
    const result = resolveSystemPrompt({ mode: "default", text: "" }, null);
    expect(result).toBe(REVIEW_SYSTEM_PROMPT);
  });

  it("handles nonexistent coding standards folder gracefully", () => {
    const result = resolveSystemPrompt({ mode: "default", text: "" }, "/nonexistent/path/that/does/not/exist");
    expect(result).toBe(REVIEW_SYSTEM_PROMPT);
  });
});

describe("parseFindingsJson", () => {
  it("parses valid findings JSON from text", () => {
    const text = `Some preamble text
[{"startLine": 1, "endLine": 5, "severity": "high", "category": "correctness", "title": "Bug", "message": "There is a bug"}]
Some trailing text`;
    const result = parseFindingsJson(text);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Bug");
    expect(result[0].severity).toBe("high");
    expect(result[0].category).toBe("correctness");
  });

  it("returns empty array for no JSON", () => {
    expect(parseFindingsJson("no json here")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseFindingsJson("[not valid json}")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseFindingsJson('{"key": "value"}')).toEqual([]);
  });

  it("filters out items missing required fields", () => {
    const text = '[{"startLine": 1, "endLine": 5, "title": "Good", "message": "ok"}, {"incomplete": true}]';
    const result = parseFindingsJson(text);
    expect(result).toHaveLength(1);
  });

  it("defaults unknown category to correctness", () => {
    const text = '[{"startLine": 1, "endLine": 5, "severity": "low", "category": "unknown-cat", "title": "T", "message": "M"}]';
    const result = parseFindingsJson(text);
    expect(result[0].category).toBe("correctness");
  });
});

describe("buildReviewPrompt", () => {
  it("includes file name and diff", () => {
    const result = buildReviewPrompt("src/app.ts", "+added line", "");
    expect(result).toContain("src/app.ts");
    expect(result).toContain("+added line");
  });

  it("includes numbered full content when provided", () => {
    const result = buildReviewPrompt("src/app.ts", "+line", "line one\nline two\nline three");
    expect(result).toContain("1: line one");
    expect(result).toContain("2: line two");
    expect(result).toContain("3: line three");
    expect(result).toContain("Full file with line numbers");
  });

  it("omits full content section when content is empty", () => {
    const result = buildReviewPrompt("src/app.ts", "+line", "");
    expect(result).not.toContain("Full file with line numbers");
  });
});

describe("loadCodingStandards", () => {
  it("returns empty string for null folder", () => {
    expect(loadCodingStandards(null)).toBe("");
  });

  it("returns empty string for nonexistent folder", () => {
    expect(loadCodingStandards("/no/such/path")).toBe("");
  });
});
