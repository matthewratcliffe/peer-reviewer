#!/usr/bin/env node
import { dismissFinding, getAllFindings, getConfig, registerRepo } from "./client.js";
import { installHook } from "./install-hook.js";

const [, , command, ...args] = process.argv;

async function check(): Promise<void> {
  const repoRoot = await registerRepo(process.cwd());
  const { findings } = await getAllFindings(repoRoot);
  const blocking = findings.filter((f) => !f.dismissed && (f.severity === "high" || f.severity === "medium"));

  if (blocking.length === 0) {
    console.log("review-notes: no unresolved medium/high findings.");
    return;
  }

  const config = await getConfig();
  const willBlock = config.preCommit.blockOnFindings;

  console.error(`review-notes: ${blocking.length} unresolved finding(s)${willBlock ? " block this commit" : " (warning only)"}:\n`);
  for (const finding of blocking) {
    console.error(`  [${finding.severity.toUpperCase()}/${finding.category}] ${finding.file}:${finding.startLine} — ${finding.title}`);
    console.error(`      ${finding.message}`);
    console.error(`      dismiss: review-notes dismiss ${finding.id}\n`);
  }

  if (!willBlock) {
    console.error("Blocking is disabled (review-notes preCommit.blockOnFindings=false) — commit will proceed.");
    return;
  }

  console.error("Resolve the code or dismiss each finding above, then retry the commit.");
  process.exitCode = 1;
}

async function dismiss(id: string | undefined): Promise<void> {
  if (!id) {
    console.error("usage: review-notes dismiss <finding-id>");
    process.exitCode = 1;
    return;
  }
  await dismissFinding(id);
  console.log(`review-notes: dismissed ${id}`);
}

async function main() {
  switch (command) {
    case "check":
      await check();
      return;
    case "dismiss":
      await dismiss(args[0]);
      return;
    case "install-hook":
      installHook();
      return;
    default:
      console.error("usage: review-notes <check|dismiss|install-hook>");
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`review-notes: ${error.message}`);
  if (command === "check") {
    console.error("Is review-notes-service running? If not, the commit is allowed through unchecked.");
  } else {
    process.exitCode = 1;
  }
});
