import * as vscode from "vscode";
import type { Finding } from "./ipc-client";
export declare class PeerReviewerWebviewProvider implements vscode.WebviewViewProvider {
    private readonly extensionUri;
    static readonly viewType = "peerReviewer.panel";
    private view?;
    private repoRoot;
    private findings;
    constructor(extensionUri: vscode.Uri);
    setRepoRoot(repoRoot: string): void;
    updateFindings(findings: Finding[]): void;
    showProcessing(text: string): void;
    hideProcessing(): void;
    showError(message: string): void;
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    private sendFindingsToWebview;
    private postMessage;
    private handleMessage;
    private getHtml;
}
