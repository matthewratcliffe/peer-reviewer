import * as vscode from "vscode";
import { IpcClient } from "./ipc-client";
import { ReviewNotesWebviewProvider } from "./webview-provider";
import { ensureRunningAndRegister } from "./service-launcher";

let pollInterval: ReturnType<typeof setInterval> | undefined;
let autoAnalyseInterval: ReturnType<typeof setInterval> | undefined;
let saveWatcher: vscode.Disposable | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Review Notes");
  context.subscriptions.push(output);

  const client = new IpcClient();
  const provider = new ReviewNotesWebviewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ReviewNotesWebviewProvider.viewType, provider)
  );

  // Determine repo path from workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    output.appendLine("No workspace folder open, Review Notes inactive.");
    return;
  }

  const repoPath = workspaceFolders[0].uri.fsPath;
  let repoRoot: string;

  try {
    repoRoot = await ensureRunningAndRegister(client, repoPath, context.extensionPath, output);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    output.appendLine(`Failed to connect to service: ${msg}`);
    vscode.window.showErrorMessage(`Review Notes: ${msg}`);
    return;
  }

  provider.setRepoRoot(repoRoot);
  output.appendLine(`Review Notes active for repo: ${repoRoot}`);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("reviewNotes.reanalyseChanges", async () => {
      await runAnalysis(client, repoRoot, "changes", provider, output);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("reviewNotes.reanalyseProject", async () => {
      await runAnalysis(client, repoRoot, "project", provider, output);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("reviewNotes.stopAnalysis", async () => {
      try {
        await client.cancelAnalysis(repoRoot);
        provider.hideProcessing();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`Stop analysis error: ${msg}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("reviewNotes.dismiss", async (findingId: string) => {
      try {
        await client.dismissFinding(findingId);
        await refreshFindings(client, repoRoot, provider, output);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`Dismiss error: ${msg}`);
      }
    })
  );

  // Poll findings every 2 seconds
  pollInterval = setInterval(async () => {
    await refreshFindings(client, repoRoot, provider, output);
  }, 2000);

  context.subscriptions.push({ dispose: () => { if (pollInterval) clearInterval(pollInterval); } });

  // Set up auto-analyse
  setupAutoAnalyse(context, client, repoRoot, provider, output);

  // Re-setup auto-analyse when config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("reviewNotes.autoAnalyse")) {
        setupAutoAnalyse(context, client, repoRoot, provider, output);
      }
    })
  );

  // Initial findings load
  await refreshFindings(client, repoRoot, provider, output);
}

export function deactivate(): void {
  if (pollInterval) clearInterval(pollInterval);
  if (autoAnalyseInterval) clearInterval(autoAnalyseInterval);
  if (saveWatcher) saveWatcher.dispose();
}

async function runAnalysis(
  client: IpcClient,
  repoRoot: string,
  scope: "changes" | "project",
  provider: ReviewNotesWebviewProvider,
  output: vscode.OutputChannel
): Promise<void> {
  provider.showProcessing(`Analysing ${scope}...`);

  // Poll progress in background
  const progressPoll = setInterval(async () => {
    try {
      const progress = await client.getAnalysisProgress(repoRoot);
      if (progress.total > 0) {
        provider.showProcessing(`Analysing: ${progress.completed} / ${progress.total} files`);
      }
    } catch {
      // ignore progress poll errors
    }
  }, 1000);

  try {
    if (scope === "changes") {
      await client.analyzeChanges(repoRoot);
    } else {
      await client.analyzeProject(repoRoot);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    output.appendLine(`Analysis error: ${msg}`);
    vscode.window.showWarningMessage(`Review Notes analysis failed: ${msg}`);
  } finally {
    clearInterval(progressPoll);
    provider.hideProcessing();
    await refreshFindings(client, repoRoot, provider, output);
  }
}

async function refreshFindings(
  client: IpcClient,
  repoRoot: string,
  provider: ReviewNotesWebviewProvider,
  output: vscode.OutputChannel
): Promise<void> {
  try {
    const findings = await client.getAllFindings(repoRoot);
    provider.updateFindings(findings);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (vscode.workspace.getConfiguration("reviewNotes").get("debugLogging")) {
      output.appendLine(`Findings poll error: ${msg}`);
    }
  }
}

function setupAutoAnalyse(
  context: vscode.ExtensionContext,
  client: IpcClient,
  repoRoot: string,
  provider: ReviewNotesWebviewProvider,
  output: vscode.OutputChannel
): void {
  // Clean up existing watchers
  if (autoAnalyseInterval) {
    clearInterval(autoAnalyseInterval);
    autoAnalyseInterval = undefined;
  }
  if (saveWatcher) {
    saveWatcher.dispose();
    saveWatcher = undefined;
  }

  const config = vscode.workspace.getConfiguration("reviewNotes");
  const trigger = config.get<string>("autoAnalyse.trigger", "disabled");
  const intervalMinutes = config.get<number>("autoAnalyse.intervalMinutes", 5);

  if (trigger === "on-save") {
    saveWatcher = vscode.workspace.onDidSaveTextDocument(async () => {
      output.appendLine("Auto-analyse triggered by file save");
      await runAnalysis(client, repoRoot, "changes", provider, output);
    });
    context.subscriptions.push(saveWatcher);
  } else if (trigger === "periodically") {
    autoAnalyseInterval = setInterval(async () => {
      output.appendLine("Auto-analyse triggered by timer");
      await runAnalysis(client, repoRoot, "changes", provider, output);
    }, intervalMinutes * 60 * 1000);
  }
}
