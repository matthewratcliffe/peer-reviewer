# Review Notes for VS Code

AI-powered local code review that analyses your changes using a configurable LLM provider and surfaces findings directly in VS Code. All analysis runs on your machine — no code leaves your environment.

## What it does

When you save a file, trigger a manual scan, or run on a timer, Review Notes sends your diffs to a local LLM and returns categorised findings: correctness issues, security vulnerabilities, performance problems, resource leaks, and more. Findings appear in the Review Notes panel in the activity bar with severity counts, filtering, grouping, and a detail view.

## Prerequisites

You need one of the following LLM providers installed and accessible from your PATH:

| Provider | Install | Notes |
|----------|---------|-------|
| Claude CLI | `npm install -g @anthropic-ai/claude-cli` | Uses `claude --print` |
| Codex CLI | `npm install -g @openai/codex` | Uses `codex exec --json` |
| Kiro CLI | Install from [kiro.dev](https://kiro.dev) | Uses `kiro --print` |
| OpenCode CLI | Install from [opencode.ai](https://opencode.ai) | Uses `opencode --print` |
| llama.cpp | Build from [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) | Run the server, point the extension at the URL |

CLI providers (Claude, Codex, Kiro, OpenCode) must be authenticated before use — run them once manually to complete any login flow.

## Installation

Install from the VS Code Marketplace, or download the `.vsix` from the GitHub Releases page and install with:

```
code --install-extension vscode_peerreviewer_v.0.0.XX.vsix
```

## Configuration

Open **Settings** (Ctrl+Comma) and search for `Review Notes`. Key settings:

| Setting | Description |
|---------|-------------|
| `reviewNotes.provider` | Active LLM provider: `claude`, `codex`, `llama-cpp`, `opencode`, or `kiro` |
| `reviewNotes.providers.claude.command` | Path to the Claude CLI (default: `claude`) |
| `reviewNotes.providers.codex.command` | Path to the Codex CLI (default: `codex`) |
| `reviewNotes.providers.llamaCpp.baseUrl` | llama.cpp server URL (default: `http://127.0.0.1:8080`) |
| `reviewNotes.systemPrompt.mode` | `default`, `append`, or `replace` |
| `reviewNotes.systemPrompt.text` | Custom prompt text (used in append/replace mode) |
| `reviewNotes.autoAnalyse.trigger` | `disabled`, `on-save`, or `periodically` |
| `reviewNotes.autoAnalyse.intervalMinutes` | Interval for periodic analysis (default: 5) |
| `reviewNotes.maxFilesPerRun` | Cap files per analysis run (null = unlimited) |
| `reviewNotes.debugLogging` | Enable verbose logging in the Output panel |

## Usage

1. Open a project in VS Code.
2. The Review Notes panel appears in the activity bar (eye icon).
3. Click **Re-analyse Changes** to scan modified/staged/untracked files, or **Re-analyse Project** to scan everything.
4. Findings appear in the table. Click a row to see details; double-click to jump to the file and line.
5. Use the **Stop** button to cancel a running analysis.
6. Filter by severity or issue type, and group by severity, file, or category.
7. Run **Review Notes: Test Provider Connection** from the command palette (Ctrl+Shift+P) to verify your provider is working.

## How it works

The extension bundles a background service binary that communicates over a local IPC channel (named pipe on Windows, unix socket on macOS/Linux). No network port is opened. The service handles git diffing, LLM communication, and findings storage. The extension connects to it automatically on activation.
