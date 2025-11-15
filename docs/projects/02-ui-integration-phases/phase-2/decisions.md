# Phase 2 – Tool Integration Decisions

## Approval callback wiring

- Added an explicit `approvalCallback` option that flows from `ConversationManager` → `Codex.spawn` → `Session`. The CLI runtime now passes the interactive `promptApproval` helper so tool approval prompts originate from one place. This keeps the core orchestration portable (tests can provide mocks) while letting other embeddings opt out by omitting the callback.

## Session tool execution strategy

- `Session.processUserTurn` now runs a loop that alternates between model calls and tool execution. We cap the loop at six iterations to prevent runaway tool chains, and we emit `raw_response_item` events for every tool call/output to keep the CLI informed.
- Tool execution is delegated to a dedicated `ToolRouter`, matching the Rust structure. The router centralizes approval gating, metadata lookups, and error shaping so Session just hands off `function_call` items and records the resulting outputs.

## CLI event handling and display

- Instead of rewriting `chat.ts`, we kept the existing `renderConversationUntilComplete` loop and taught it about `raw_response_item` events. This keeps REPL/chat code unchanged while still supporting multi-event streams.
- Introduced `renderToolCall`/`renderToolResult` helpers (exported via `toolRenderers`) so tests can spy on them and we have a single formatting surface. Tool arguments/results are formatted as prettified JSON, and failures use the `✗` prefix to distinguish them from successes.

## Tool advertisement and approval safety

- Prompts now include the full set of registered tools (via `toolRegistry.getToolSpecs()`), so providers can actually request tool calls instead of working blind.
- Tools that require approval (including `applyPatch`) always invoke the callback; if an embedding forgets to supply one, the router declines execution with an explicit error instead of silently running dangerous commands.

## Bug Fixes - Tool Integration

**Date:** November 13, 2025

**Issue:** Tool calls failed silently due to incomplete response mapping and empty tool schemas, which prevented the CLI from showing reasoning blocks or surfacing tool requests/results.

**Changes made:**

1. **Response Mapping:** `mapOutputToResponseItems()` now converts reasoning, function_call, and function_call_output entries (including tool output payload serialization) so tool requests and results flow through the CLI like regular messages.
2. **System Prompt:** Updated default instructions to describe when and how to invoke core tools (readFile, exec, applyPatch, etc.), nudging the model to prefer real tool usage over guesses.
3. **Tool Schemas:** Every registered tool now advertises a complete JSON schema (cmd/cwd/env for exec, filePath/mode for readFile, etc.), and integration tests guard against regressions.
4. **Testing:** Added HTTP-level adapter tests for the Responses client plus schema validation tests to ensure we exercise the real mapping layer instead of mocked ResponseItems.

**Verification:** Automated unit/integration suites, targeted CLI chats (readFile, exec, multi-step read/write, reasoning prompt, weather follow-up), and manual inspection of `/tmp` artifacts confirmed tool calls propagate end to end with no empty responses.

**Root cause:** Earlier tests mocked the model client at the wrong boundary and never exercised the JSON → ResponseItem mapping layer, so anything that wasn’t a plain assistant message (reasoning/tool calls) was dropped before reaching the UI.

## Phase 2.2 – Approval & Perplexity fixes

- **Config loading:** `model_reasoning_summary` now accepts boolean flags (`true` → concise summaries, `false` → disabled), keeping parity with the CLI docs without breaking the existing enum-based values.
- **Tool routing:** `ToolRouter.executeFunctionCalls()` gained a `skipApproval` mode so Sessions can auto-run trusted commands while still using the shared router for metadata/error shaping.
- **Approval policy enforcement:** `Session.executeFunctionCalls()` now respects `approvalPolicy`:
  - `never`: skip prompts entirely.
  - `on-failure`: auto-approve until a tool returns `success === false`, then escalate to `on-request` for the remainder of the turn (reset on the next user message).
  - Other modes keep the existing interactive flow.
- **Iteration safety:** Increased `MAX_TOOL_ITERATIONS` from 6 → 100 so complex plans (read/grep/exec/applyPatch loops) no longer abort mid-task.
- **Perplexity integration:** The reasoning-oriented helper is now registered as `perplexitySearch` and uses the supported `sonar-reasoning-pro` model. A new `webSearch` tool hits the Perplexity Search API and returns structured URL/title/snippet tuples so agents can cite live web results separately from long-form reasoning.
