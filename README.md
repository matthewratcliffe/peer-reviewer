# Review Notes

Review Notes is an AI-powered local code review service that analyses your code changes using configurable LLM providers and surfaces actionable findings directly in your IDE. It runs entirely on your machine — no code leaves your environment — and supports Rider, VS Code, and Visual Studio through dedicated plugins that share a single background service.

## What it does

When you save a file, commit changes, or trigger a manual scan, Review Notes sends your diffs to a local LLM (Claude, Codex, llama.cpp, OpenCode, or Kiro) and returns concrete, categorised findings: correctness issues, security vulnerabilities, penetration-testing concerns, performance problems, resource leaks, and more. Findings appear in a familiar errors/warnings-style table with columns for severity, issue title, description, file, and line number.

Each finding includes a detailed three-part explanation: what the issue is, why it matters, and how it could be exploited or lead to failure in practice. Team members can annotate findings with shared notes that persist in the repository under `.peer-review/notes/`, making it easy to discuss and track review feedback across the team without leaving the IDE.

## Key features

- Local-only analysis — your code never leaves your machine
- Five LLM providers: Claude, Codex, llama.cpp, OpenCode, Kiro
- Findings grouped by severity, file, or issue type with expand/collapse
- Detail panel with full explanation and shared team notes
- Auto-analyse on save or on a configurable periodic timer
- Max files per run setting to control LLM costs
- Penetration testing category identifying exploitable code paths
- Stop analysis mid-run
- Debug logging of all LLM requests/responses
- Pre-commit hook that blocks commits with unresolved medium/high findings

## Architecture

```
packages/service    — Node.js daemon: git diffing, LLM adapters, findings store, HTTP + WebSocket API
packages/cli        — Thin CLI wrapper for the pre-commit hook
ides/rider          — JetBrains Rider/IntelliJ plugin (Kotlin)
ides/vscode         — VS Code extension (TypeScript)
ides/visual-studio  — Visual Studio 2022 extension (C#/WPF)
```

The service communicates over a local IPC channel (Windows named pipe or Unix domain socket) — no network port is opened. Each IDE plugin connects to the same shared service, registers its project, and receives findings via polling or WebSocket events.

## Getting started

1. Install the plugin for your IDE from the respective marketplace
2. The plugin automatically launches the background service on first use
3. Open Settings/Preferences and configure your LLM provider (command path or endpoint URL)
4. Click "Re-analyse project" or enable auto-analyse on save

## Configuration

All settings are stored in `~/.review-notes/config.json` and can be edited through the IDE settings page or by calling `PUT /config` on the service. Key options:

- **Provider**: which LLM to use (claude, codex, llama-cpp, opencode, kiro)
- **System prompt**: default, append, or replace the built-in review prompt
- **Auto analyse**: off, on save, or periodically (with configurable interval)
- **Max files per run**: cap how many files are analysed in a single pass
- **Debug logging**: log all LLM requests and responses to the service log

## Contributing

Contributions are welcome. Whether it is a bug fix, a new LLM provider adapter, an improvement to the review prompt, or a feature for one of the IDE plugins — open an issue or submit a pull request.

Before contributing:

- Read `AGENTS.md` for guidance on the project layout, conventions, and API contract
- The service at `packages/service` is the single source of truth for all analysis logic — IDE plugins are thin clients
- When changing the API contract, update all three IDE clients in the same change
- Run `npm run build` in `packages/service` and verify the relevant IDE plugin compiles before submitting

We appreciate contributions of all sizes, from typo fixes to new features.

## Code signing

Free code signing for this project is provided by the [SignPath Foundation](https://signpath.io), supporting open-source software integrity.

## License

See [LICENSE](LICENSE) for details.
