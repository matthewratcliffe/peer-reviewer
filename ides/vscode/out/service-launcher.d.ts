import * as vscode from "vscode";
import { IpcClient } from "./ipc-client";
export declare function ensureRunningAndRegister(client: IpcClient, repoPath: string, extensionPath: string, output: vscode.OutputChannel): Promise<string>;
