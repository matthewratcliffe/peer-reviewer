# Review Notes for Rider

AI-powered local code review that analyses your changes using a configurable LLM provider and surfaces findings directly in JetBrains Rider (and other IntelliJ-based IDEs). All analysis runs on your machine — no code leaves your environment.

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
| llama.cpp | Build from [github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) | Run the server, point the plugin at the URL |

CLI providers (Claude, Codex, Kiro, OpenCode) must be authenticated before use — run them once manually to complete any login flow.

## Installation

Install from the JetBrains Marketplace (Settings → Plugins → Marketplace → search "Review Notes"), or download the `.zip` from the GitHub Releases page and install via:

Settings → Plugins → gear icon → Install Plugin from Disk → select the `.zip`

## Configuration

Open **Settings → Tools → Review Notes**. Available options:

| Setting | Description |
|---------|-------------|
| Active Provider | Which LLM to use: Claude, Codex, llama.cpp, OpenCode, or Kiro |
| Provider command/URL | Path to the CLI binary or llama.cpp server URL |
| Provider arguments | CLI arguments (space-separated) |
| System Prompt Mode | `default`, `append`, or `replace` |
| System Prompt Text | Custom prompt text (for append/replace mode) |
| Auto-Analyse Trigger | `disabled`, `on-save`, or `periodically` |
| Auto-Analyse Interval | Minutes between periodic scans |
| Max Files Per Run | Cap files per analysis run (0 = unlimited) |
| Debug Logging | Enable verbose logging |

Click **Test Connection** in the settings page to verify the active provider works.

## Usage

1. Open a project in Rider.
2. The **Review Notes** tool window appears (usually docked at the bottom).
3. Click **Re-analyse Changes** to scan modified/staged/untracked files, or **Re-analyse Project** to scan all files.
4. Findings appear in the table. Click a row to see the full explanation; double-click to navigate to the file and line.
5. Use the **Stop** button to cancel a running analysis.
6. Filter by severity or issue type, and group by severity, file, or category.
7. Add team notes to any finding — they persist in `.peer-review/notes/` in your repo for the whole team.

## How it works

The plugin bundles a background service binary that communicates over a local IPC channel (named pipe on Windows, unix socket on macOS/Linux). No network port is opened. The service handles git diffing, LLM communication, and findings storage. The plugin spawns and connects to it automatically when a project is opened.
