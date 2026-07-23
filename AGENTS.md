# AGENTS.md

Guidance for anyone (human or agent) working across this repo. Read this before
touching the API contract between the service and any IDE client.

## Layout

- `packages/service` — the ONLY place with real logic: git diffing, LLM provider
  adapters, findings storage/state, HTTP + WebSocket API. This is the source of
  truth. If you're fixing a bug in analysis behavior, it goes here, not in an
  IDE client.
- `packages/cli` — thin wrapper around the service's HTTP API, used by the git
  pre-commit hook. No analysis logic lives here.
- `ides/rider`, `ides/vscode`, `ides/visual-studio` — thin clients. Each renders
  the "Review Notes" tab, subscribes to findings over WebSocket, and handles
  click-to-navigate. They must NOT implement their own diffing, provider calls,
  or finding logic — if you find yourself doing that, it belongs in the service.

## Transport

The service does NOT listen on a TCP port. It listens on a local IPC channel
only the current OS user can reach:
- Windows: named pipe `\\.\pipe\review-notes-<user>`
- macOS/Linux: unix domain socket at `~/.review-notes/service.sock` (mode 0600)

This keeps it inaccessible to other processes/users/network on the machine —
no port to scan or hit from a browser. HTTP and WebSocket both work fine over
these transports (Node's `http`/`ws` servers accept a socket path in place of a
port). Every client also sends a per-session auth token (written to
`~/.review-notes/session.token`, mode 0600, regenerated per service start) as
defense in depth in case the IPC boundary is ever misconfigured.

Clients must resolve the socket path themselves (same logic, not a shared
runtime dependency, since each client is a different language) — see
`packages/service/src/ipc-path.ts` for the canonical resolution logic to port.

## The contract (keep the three clients in sync)

Every request (HTTP and the WS upgrade) must include header
`x-review-notes-token: <token>` read from `~/.review-notes/session.token`.

The service is a single shared daemon per machine, watching multiple repos at
once (one open IDE window per project, but one service process). A client
must register its repo before querying it:
- `POST /repos {path}` — resolves `path` to its git root, starts watching it
  if not already watched, returns `{ repoRoot }`. Idempotent — call this once
  per IDE window/session before anything else.
- `GET  /findings?repo=<repoRoot>&file=<path>` — findings for one file
- `GET  /findings?repo=<repoRoot>` — all current findings for that repo
- `POST /findings/:id/dismiss` — mark a finding resolved/dismissed (ids are
  globally unique UUIDs, no repo param needed)
- `POST /analyze?repo=<repoRoot> {scope}` — kick off an out-of-band re-scan;
  `scope: "changes"` re-analyzes every modified/staged/untracked file,
  `scope: "project"` reviews every non-ignored file in the repo from scratch
  (no diff needed — the whole file is treated as newly added). This request
  blocks until the scan completes (deliberately — it's how IDE clients drive a
  "still running" indicator on their re-analyse buttons), so callers should
  invoke it off their UI thread. `/findings` reflects results once it resolves.
- `GET  /analyze/progress?repo=<repoRoot>` — poll this from a second
  connection while a `/analyze` call is in flight to drive a live "X of Y
  files analysed" / ETA indicator: `{ total, completed, startedAt }` (epoch
  ms), or `{ total: 0, completed: 0, startedAt: 0 }` when no scan is running
  for that repo. ETA is the caller's job: `(now - startedAt) / completed *
  (total - completed)`.
- `WS   /events` — pushes events tagged with `repo`, e.g. `findings-updated`
  with the changed file path, scoped to that repo
- `GET  /config` — current config (`ReviewNotesConfig` in `api-types.ts`):
  active provider (exactly one of codex/llama-cpp/claude), that provider's
  settings, system prompt override mode/text, and `preCommit.blockOnFindings`
- `PUT  /config` — replace the whole config (full object, validated against
  `ConfigSchema` in `packages/service/src/config.ts`); persisted to
  `~/.review-notes/config.json` and applied live (in-flight repo sessions get
  the new provider/prompt on their next analysis, no restart needed)
- `POST /providers/test {<same shape as PUT /config>}` — connectivity check for
  whichever provider is `activeProvider` in the posted config (does NOT persist
  it — lets a settings UI test unsaved edits before saving). Codex and Claude:
  spawns `command --version`. llama.cpp: `GET <baseUrl>/v1/models`. `{ ok: true }`
  on success, 502 `{ error }` on failure (see `providers/test-connection.ts`).

Every IDE client implements the same three behaviors against this contract:
1. Render a "Review Notes" list/tab, grouped by file.
2. On finding click: open the file at the finding's line range, show a
   description box (title, severity, provider, message).
3. On `findings-updated` event: refresh the list for that file without a full
   reload.

**When you change the API contract (new field, new endpoint, changed payload
shape), update all three clients in the same change**, or explicitly note in
the PR/commit which clients still need the update. Do not let one client's
model of the contract drift silently out of date — the type definitions in
`packages/service/src/api-types.ts` are the canonical shape; each client should
mirror them (TS clients can import directly; Kotlin/C# clients should keep a
hand-written equivalent and note the source file in a comment).

## Review scope

Findings carry a `category` (see `packages/service/src/providers/prompt.ts` for
the authoritative list and prompt: correctness, security, naming,
best-practice, unintended-consequence, error-handling, performance,
concurrency, resource-leak, test-coverage, api-contract, maintainability).
When adjusting what the reviewer looks for, edit `REVIEW_SYSTEM_PROMPT` and
`REVIEW_CATEGORIES` there — every provider adapter shares the same prompt, so
the change applies to Codex/llama.cpp/Claude uniformly. All three IDE clients
render `severity` and `category` together; keep them in sync if you rename or
add a category.

`REVIEW_SYSTEM_PROMPT` is the default; `resolveSystemPrompt()` in the same
file layers a user override from config (`systemPrompt.mode`: `default`,
`append`, or `replace`, plus `systemPrompt.text`) on top of it. Every provider
adapter takes the resolved prompt as a `systemPrompt` field in its config
rather than importing `REVIEW_SYSTEM_PROMPT` directly — keep new adapters
consistent with that.

## Providers

Adding a 4th LLM backend means adding one adapter under
`packages/service/src/providers/`, implementing the shared `Provider`
interface, and adding it as a case in `buildProviderRegistry`
(`providers/registry.ts`) plus a new `activeProvider` enum value and
`providers.<name>` block in `config.ts`. Exactly one provider is active at a
time (`config.activeProvider`) — the others' settings stay in config so
switching back doesn't lose them. This should never require touching IDE
client code beyond the settings-page provider list.

Codex and Claude are both local CLIs, spawned via the shared
`runCliCommand()` helper in `providers/cli-runner.ts` (config shape:
`{ command, args }` — the prompt goes over stdin, stdout is parsed for
findings JSON). llama.cpp is the only HTTP-based provider (`{ baseUrl }`,
OpenAI-compatible `/v1/chat/completions`). Neither CLI provider needs an API
key from the user; they defer entirely to whatever auth the CLI itself
already has configured.

## Conventions

- No comments explaining what code does — name things clearly instead.
- Don't add abstractions or config options beyond what's asked for.
- Prefer editing existing files over creating new ones.
