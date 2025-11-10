# Codex CLI TypeScript Port

This project is a TypeScript port of the Codex CLI harness. It mirrors the Rust implementation's agent loop, OpenAI Responses API client, and built-in tool set (`list_dir`, `read_file`, `grep_files`, `shell`, `apply_patch`) so the CLI experience stays consistent across languages.

## Overview

- Fastify server (`src/server.ts`) exposes the REST + SSE endpoints used by the CLI and web dashboard.
- Agent layer (`src/agent`) persists sessions, builds prompts, streams Responses API output, and invokes tools.
- Tool registry (`src/tools`) provides filesystem-friendly helpers that the model can call during a run.
- Minimal web UI (`web/`) lets you inspect sessions, stream model output, and fire manual turns.
- Bun-powered test suite (`bun test`) covers agent logic, tool behavior, and the HTTP surface.

## Prerequisites

- Bun 1.1+ (used for dependency management and the test runner)
- Node.js 18+ runtime (Fastify targets the Node APIs that Bun proxies to when running `bun run`)
- An OpenAI ChatGPT account token stored in `~/.codex/auth.json` (same format the Rust harness expects)

```json
{
  "tokens": {
    "access_token": "<chatgpt_access_token>",
    "account_id": "<optional_chatgpt_account_id>"
  }
}
```

## Setup

```bash
# install dependencies via Bun (reads package.json)
bun install

# optional: verify everything passes before running
bun test
```

## Running the server

```bash
# start the Fastify server under Bun with log redirection
npm run server:start

# view the local UI
open http://127.0.0.1:4010/
```

- `npm run server:status` checks the PID and exit code.
- `npm run server:logs[:follow]` tails `logs/server.{out,err}.log`.
- `npm run server:stop` and `npm run server:restart` manage the background process.

> **Note:** `src/server.ts` purposely exits if you launch it directly because `npm run server:start` sets `CODEX_SERVER_SCRIPT=1` and wires logs + PID management.

## Data locations

- Session artifacts and history live in `.codex/` (or `CODEX_PORT_DATA_DIR`, if set).
- History events append to `.codex/history.jsonl` to match the CLI behavior.
- Static logs go to `logs/server.out.log` and `logs/server.err.log`.

Old data can be removed safely while the server is stopped. The session loader ignores malformed JSON files.

## Architecture tour

| Directory | Purpose |
| --- | --- |
| `src/agent/` | Session persistence (`session.ts`), prompt construction, and turn streaming/retries. |
| `src/client/` | Responses API client and auth loader, including ChatGPT endpoint quirks. |
| `src/tools/` | `grep_files`, `read_file`, `list_dir`, `shell`, and `apply_patch` implementations + registry. |
| `src/prompts/` | Instruction templates and cached prompts used when constructing requests. |
| `src/server.ts` | Fastify app with REST endpoints, SSE streaming, static asset serving, and tool proxying. |
| `web/` | Plain JS/HTML/CSS front-end that exercises the same APIs exposed to the CLI. |
| `tests/` | Bun tests covering agent logic, tools, server routes, and streaming behavior. |
| `scripts/` | Process supervisor scripts (`server-start`, `server-stop`, etc.) invoked by package.json. |
| `docs/` | Supplemental documentation (ex: `openai-responses-api.md` reference snapshot). |

### Request flow

1. Web UI or CLI creates a session via `POST /api/sessions` (Fastify stores metadata in `.codex/sessions`).
2. User submits a turn (`POST /api/turns`), server opens an SSE stream, and `runTurnStream` drives the loop.
3. `ResponsesClient` translates prompts to the ChatGPT `/responses` API, tracks usage, and normalizes tool calls.
4. Tools execute inside the Node process (filesystem, shell, apply_patch) and feed results back to the model.
5. Session items persist to disk and history entries append to `history.jsonl` for UI summaries.

## Environment variables

- `CODEX_SERVER_SCRIPT=1` – required by `src/server.ts` guard; set automatically by `server-start.sh`.
- `HOST` / `PORT` – override defaults (`127.0.0.1:4010`) when launching the server script.
- `CODEX_PORT_DATA_DIR` – change where sessions/history are stored.
- `CODEX_MODEL` – override the default `gpt-5-codex` model name in prompt construction.
- `CODEX_DEBUG_HTTP=1` – enable noisy logging of Responses payloads.

## Development

- `bun test` – run the full Bun test suite (agent, tools, server).
- `bun test --watch` – re-run tests on file changes.
- Static assets are plain ES modules; no bundler step is required.
- When adding new tools, wire them up in `src/tools/registry.ts` and update prompt schemas in `src/agent/prompt.ts`.
- Keep documentation in sync with the Rust harness; this port aims to behave identically, so regressions should have parallel fixes/tests.

## Troubleshooting

- Missing auth token: ensure `~/.codex/auth.json` exists, otherwise `ResponsesClient` will throw `No authentication found`.
- SSE stream stalls: check `logs/server.err.log` for tool failures or ChatGPT API errors.
- Apply patch failures: the tool returns structured `{ success: false, error }` payloads surfaced in the UI and CLI.
- Stale sessions: delete `.codex/sessions/*.json` while the server is stopped; new sessions can then be created cleanly.

## Additional resources

- `docs/openai-responses-api.md` – reference copy of the Responses API documentation used during development.
- Rust harness (upstream) – use as a behavior baseline when verifying interoperability.
