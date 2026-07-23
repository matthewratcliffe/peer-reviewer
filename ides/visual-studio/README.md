# Review Notes for Visual Studio

AI-powered local code review that analyses your changes using a configurable LLM provider and surfaces findings directly in Visual Studio 2022. All analysis runs on your machine — no code leaves your environment.

## What it does

When you trigger a scan or enable auto-analysis, Review Notes sends your diffs to a local LLM and returns categorised findings: correctness issues, security vulnerabilities, performance problems, resource leaks, and more. Findings appear in the Review Notes tool window with severity counts, filtering, grouping, and a detail panel.

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

## Supported Visual Studio versions

- Visual Studio 2022 Community, Professional, or Enterprise (version 17.0+)
- 64-bit (amd64) only

## Installation

Install from the Visual Studio Marketplace (Extensions → Manage Extensions → search "Review Notes"), or download the `.vsix` from the GitHub Releases page and double-click to install.

## Configuration

Open **Tools → Options → ReviewNotes → General**. Available options:

| Setting | Description |
|---------|-------------|
| Active Provider | Which LLM to use: `claude`, `codex`, `llama-cpp`, `opencode`, or `kiro` |
| Command | Path to the CLI binary for CLI-based providers |
| Arguments | CLI arguments (comma-separated) |
| Base URL | llama.cpp server URL (for the llama-cpp provider) |
| System Prompt Mode | `default`, `append`, or `replace` |
| Custom Text | System prompt text (for append/replace mode) |
| Auto-Analyse Trigger | `disabled`, `on-save`, or `periodically` |
| Auto-Analyse Interval | Minutes between periodic scans |
| Max Files Per Run | Cap files per analysis run (0 = unlimited) |
| Block Pre-Commit on Findings | Whether the git pre-commit hook blocks on unresolved findings |
| Debug Logging | Enable verbose logging |

Settings are synced to the background service when you click Apply or OK.

## Usage

1. Open a solution in Visual Studio.
2. The **Review Notes** tool window opens automatically (View → Review Notes if it doesn't appear).
3. Click **Re-analyse Changes** to scan modified/staged/untracked files, or **Re-analyse Project** to scan all files.
4. Findings appear in the table. Click a row to see the full explanation; double-click to navigate to the file and line.
5. Use the **Stop** button to cancel a running analysis.
6. Filter by severity or issue type, and group by severity, file, or category.
7. Add team notes to any finding — they persist in `.peer-review/notes/` in your repo for the whole team.

## How it works

The extension bundles the background service binary (`review-notes-service.exe`) which communicates over a Windows named pipe (`\\.\pipe\review-notes-<username>`). No network port is opened. The service handles git diffing, LLM communication, and findings storage. The extension spawns and connects to it automatically when a solution is loaded.
