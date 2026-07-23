import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const REVIEW_CATEGORIES = [
  "correctness",
  "security",
  "penetration-testing",
  "naming",
  "best-practice",
  "unintended-consequence",
  "error-handling",
  "performance",
  "concurrency",
  "resource-leak",
  "test-coverage",
  "api-contract",
  "maintainability",
] as const;

export const REVIEW_SYSTEM_PROMPT = `You are a first-pass code reviewer running before a human review. \
Given a unified diff, find concrete, worth-a-human's-time issues across these categories:
- correctness: logic errors, off-by-one, wrong conditionals, incorrect assumptions
- security: injection, auth/authz gaps, unsafe deserialization, secrets in code, unvalidated input at trust boundaries
- penetration-testing: areas a bad actor could exploit to manipulate functionality — privilege escalation paths, parameter tampering, business logic abuse, race conditions exploitable for unauthorized access, missing rate limits on sensitive operations, insecure direct object references, and any input that reaches a dangerous sink without adequate validation
- naming: names that mislead, misdescribe behavior, or violate the file/module's existing conventions (only flag if it will cause confusion or misuse, not pure taste)
- best-practice: idioms and patterns established elsewhere in this codebase/language being violated without reason
- unintended-consequence: a change that looks correct locally but breaks, bypasses, or contradicts behavior elsewhere (a caller, an invariant, a related code path visible in the diff context)
- error-handling: swallowed exceptions, missing checks at failure points, error paths that leave state inconsistent
- performance: obviously wasteful patterns introduced by this change (N+1 calls, unnecessary copies/allocations in hot paths, quadratic where linear is easy)
- concurrency: race conditions, missing synchronization, unsafe shared mutable state introduced by this change
- resource-leak: unclosed handles/connections/listeners, missing cleanup on error paths
- test-coverage: new branches/edge cases in this diff with no corresponding test change nearby
- api-contract: breaking a public function/API signature or behavior in a way callers won't expect
- maintainability: only flag if the change meaningfully increases future risk (e.g. duplicated logic that will drift, magic values with no explanation)

Do not comment on pure style/formatting preferences that have no functional or maintenance consequence. \
Only report things a competent human reviewer would actually flag — skip anything speculative or low-confidence. \
Do not include positive feedback, compliments, or commentary on things done well — only return actionable issues that need to be changed. \
Respond with strict JSON: an array of objects with fields \
startLine, endLine (1-indexed line numbers matching the numbered file content provided — use EXACTLY the line numbers shown in the "Full file with line numbers" section), severity ("info"|"low"|"medium"|"high"), category (one of: ${REVIEW_CATEGORIES.join(", ")}), title (short), message (a detailed explanation of approximately 3 paragraphs: first paragraph explains WHAT the issue is and where it occurs; second paragraph explains WHY it matters — the real-world consequence, risk, or cost if left unaddressed; third paragraph explains HOW it could be misused or exploited, or how it could lead to failure in practice, with a concrete scenario). \
If there are no issues, respond with an empty array.`;

export interface SystemPromptConfig {
  mode: "default" | "append" | "replace";
  text: string;
}

export function loadCodingStandards(folder: string | null): string {
  if (!folder) return "";
  try {
    const files = readdirSync(folder)
      .filter((f) => f.toLowerCase().endsWith(".md"))
      .sort();
    if (files.length === 0) return "";
    return files
      .map((f) => readFileSync(join(folder, f), "utf-8"))
      .join("\n\n");
  } catch {
    return "";
  }
}

export function resolveSystemPrompt(config: SystemPromptConfig, codingStandardsFolder?: string | null): string {
  let prompt: string;
  switch (config.mode) {
    case "replace":
      prompt = config.text;
      break;
    case "append":
      prompt = `${REVIEW_SYSTEM_PROMPT}\n\n${config.text}`;
      break;
    default:
      prompt = REVIEW_SYSTEM_PROMPT;
  }
  const standards = loadCodingStandards(codingStandardsFolder ?? null);
  if (standards) {
    prompt += `\n\n--- Organisation Coding Standards ---\nThe following coding standards MUST also be evaluated. Flag violations as category "best-practice" unless a more specific category applies.\n\n${standards}`;
  }
  return prompt;
}

export function buildReviewPrompt(file: string, diff: string, fullContent: string): string {
  if (fullContent) {
    const numbered = fullContent
      .split("\n")
      .map((line, i) => `${i + 1}: ${line}`)
      .join("\n");
    return `File: ${file}\n\nFull file with line numbers:\n${numbered}\n\nDiff (for context on what changed):\n${diff}`;
  }
  return `File: ${file}\n\nDiff:\n${diff}`;
}

export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export function parseFindingsJson(text: string): Array<{
  startLine: number;
  endLine: number;
  severity: "info" | "low" | "medium" | "high";
  category: ReviewCategory;
  title: string;
  message: string;
}> {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          typeof item.startLine === "number" &&
          typeof item.endLine === "number" &&
          typeof item.title === "string" &&
          typeof item.message === "string"
      )
      .map((item) => ({
        ...item,
        category: REVIEW_CATEGORIES.includes(item.category) ? item.category : "correctness",
      }));
  } catch {
    return [];
  }
}


export const COMMIT_MESSAGE_PROMPT = `You are a commit message writer. Given the unified diff of all staged/modified changes, write a concise, informative conventional commit message. Use the format:

<type>(<optional scope>): <short summary>

<optional body with more detail>

Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build.
Keep the summary line under 72 characters. The body should explain what changed and why, not how.
Respond with ONLY the commit message text, no JSON, no markdown fences.`;

export function buildCommitMessagePrompt(diff: string): string {
  return `${COMMIT_MESSAGE_PROMPT}\n\nDiff:\n${diff}`;
}
