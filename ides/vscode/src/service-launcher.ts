import * as path from "path";
import * as child_process from "child_process";
import * as vscode from "vscode";
import { IpcClient } from "./ipc-client";

function getServiceBinaryPath(extensionPath: string): string {
  const binName = process.platform === "win32" ? "review-notes-service.exe" : "review-notes-service";
  return path.join(extensionPath, "bin", binName);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureRunningAndRegister(
  client: IpcClient,
  repoPath: string,
  extensionPath: string,
  output: vscode.OutputChannel
): Promise<string> {
  // Try registering directly first — service may already be running
  try {
    const result = await client.registerRepo(repoPath);
    return result.repoRoot;
  } catch {
    output.appendLine("Service not reachable, attempting to start...");
  }

  // Spawn the service binary
  const binaryPath = getServiceBinaryPath(extensionPath);
  output.appendLine(`Starting service: ${binaryPath}`);

  const proc = child_process.spawn(binaryPath, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  proc.unref();

  // Wait up to 15s for the service to become reachable
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await sleep(500);
    client.refreshToken();
    try {
      const result = await client.registerRepo(repoPath);
      output.appendLine("Service started and repo registered.");
      return result.repoRoot;
    } catch {
      // not ready yet
    }
  }

  throw new Error("Failed to start review-notes service within 15 seconds");
}
