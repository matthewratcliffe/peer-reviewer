"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const ipc_client_1 = require("./ipc-client");
const webview_provider_1 = require("./webview-provider");
const service_launcher_1 = require("./service-launcher");
let pollInterval;
let autoAnalyseInterval;
let saveWatcher;
async function activate(context) {
    const output = vscode.window.createOutputChannel("Review Notes");
    context.subscriptions.push(output);
    const client = new ipc_client_1.IpcClient();
    const provider = new webview_provider_1.ReviewNotesWebviewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(webview_provider_1.ReviewNotesWebviewProvider.viewType, provider));
    // Determine repo path from workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        output.appendLine("No workspace folder open, Review Notes inactive.");
        return;
    }
    const repoPath = workspaceFolders[0].uri.fsPath;
    let repoRoot;
    try {
        repoRoot = await (0, service_launcher_1.ensureRunningAndRegister)(client, repoPath, context.extensionPath, output);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`Failed to connect to service: ${msg}`);
        vscode.window.showErrorMessage(`Review Notes: ${msg}`);
        return;
    }
    provider.setRepoRoot(repoRoot);
    output.appendLine(`Review Notes active for repo: ${repoRoot}`);
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand("reviewNotes.reanalyseChanges", async () => {
        await runAnalysis(client, repoRoot, "changes", provider, output);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("reviewNotes.reanalyseProject", async () => {
        await runAnalysis(client, repoRoot, "project", provider, output);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("reviewNotes.stopAnalysis", async () => {
        try {
            await client.cancelAnalysis(repoRoot);
            provider.hideProcessing();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            output.appendLine(`Stop analysis error: ${msg}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("reviewNotes.dismiss", async (findingId) => {
        try {
            await client.dismissFinding(findingId);
            await refreshFindings(client, repoRoot, provider, output);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            output.appendLine(`Dismiss error: ${msg}`);
        }
    }));
    // Poll findings every 2 seconds
    pollInterval = setInterval(async () => {
        await refreshFindings(client, repoRoot, provider, output);
    }, 2000);
    context.subscriptions.push({ dispose: () => { if (pollInterval)
            clearInterval(pollInterval); } });
    // Set up auto-analyse
    setupAutoAnalyse(context, client, repoRoot, provider, output);
    // Re-setup auto-analyse when config changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("reviewNotes.autoAnalyse")) {
            setupAutoAnalyse(context, client, repoRoot, provider, output);
        }
    }));
    // Initial findings load
    await refreshFindings(client, repoRoot, provider, output);
}
function deactivate() {
    if (pollInterval)
        clearInterval(pollInterval);
    if (autoAnalyseInterval)
        clearInterval(autoAnalyseInterval);
    if (saveWatcher)
        saveWatcher.dispose();
}
async function runAnalysis(client, repoRoot, scope, provider, output) {
    provider.showProcessing(`Analysing ${scope}...`);
    // Poll progress in background
    const progressPoll = setInterval(async () => {
        try {
            const progress = await client.getAnalysisProgress(repoRoot);
            if (progress.total > 0) {
                provider.showProcessing(`Analysing: ${progress.completed} / ${progress.total} files`);
            }
        }
        catch {
            // ignore progress poll errors
        }
    }, 1000);
    try {
        if (scope === "changes") {
            await client.analyzeChanges(repoRoot);
        }
        else {
            await client.analyzeProject(repoRoot);
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        output.appendLine(`Analysis error: ${msg}`);
        vscode.window.showWarningMessage(`Review Notes analysis failed: ${msg}`);
    }
    finally {
        clearInterval(progressPoll);
        provider.hideProcessing();
        await refreshFindings(client, repoRoot, provider, output);
    }
}
async function refreshFindings(client, repoRoot, provider, output) {
    try {
        const findings = await client.getAllFindings(repoRoot);
        provider.updateFindings(findings);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (vscode.workspace.getConfiguration("reviewNotes").get("debugLogging")) {
            output.appendLine(`Findings poll error: ${msg}`);
        }
    }
}
function setupAutoAnalyse(context, client, repoRoot, provider, output) {
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
    const trigger = config.get("autoAnalyse.trigger", "disabled");
    const intervalMinutes = config.get("autoAnalyse.intervalMinutes", 5);
    if (trigger === "on-save") {
        saveWatcher = vscode.workspace.onDidSaveTextDocument(async () => {
            output.appendLine("Auto-analyse triggered by file save");
            await runAnalysis(client, repoRoot, "changes", provider, output);
        });
        context.subscriptions.push(saveWatcher);
    }
    else if (trigger === "periodically") {
        autoAnalyseInterval = setInterval(async () => {
            output.appendLine("Auto-analyse triggered by timer");
            await runAnalysis(client, repoRoot, "changes", provider, output);
        }, intervalMinutes * 60 * 1000);
    }
}
//# sourceMappingURL=extension.js.map