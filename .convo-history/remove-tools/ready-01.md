[Segment 01–02] Phase 1 complete → Rich vs Codex review → Phase 2 scoped

- Phase 1 done (protocol types). One TS error pre-existed (cache); lint not in scope.
- Comparative review (Rich port vs Codex) drove concrete process upgrades:
  - Root-level logs at repo root: `PORT_LOG_MASTER.md`, `PORT_LOG_PHASE1.md`, `KNOWN_BUGS.md`.
  - Shorter kickoff prompts; explicit dev standards (npm, strict TS, no any, prettier, tests).
  - Keep Codex strengths: detailed checklists, decisions doc, explicit progress tracking.
- Changes implemented and committed:
  - Added master/phase logs, bug tracker, dev standards; Phase 2 docs scaffolded (README, CHECKLIST, STATUS, DECISIONS, QUICK_START).
  - Visual indicators in Phase 1 STATUS; all linked for stateless sessions.

- Subagent dependency audit flagged Phase 2 scope issues (core/config imported across phases):
  - Blockers: client (P4), auth (P5), other provider info; line-count underestimates were large.
  - Decision: reduce Phase 2 to 4 independent modules now:
    1) core/config  2) core/config-loader  3) core/message-history  4) core/rollout
  - Remove codex/codex-conversation/conversation-manager from Phase 2; revisit later.

- Time estimates removed by request; operate with real-time logs only. Guidance tightened:
  - Read/import checks first; keep multi-file Rust modules as single TS files, split >1000 LOC.
  - Async testing pattern is native in Vitest—no blocker; add an example to dev standards.

- TOML dependency choice: moved from @iarna/toml (stale) → smol-toml (active, zero deps).
  - Rationale: mature, tiny, no deps, matches TOML 1.0; porting a parser yields little value.
  - Strategy: use smol-toml now; later you can fork/own if desired.

- Phase 2 kickoff prompt produced (and committed) for repeatable, stateless sessions:
  - Read the master logs first; TDD workflow; strict standards; session end checklist.
  - Start order: config → config-loader → message-history → rollout.

- Alignment check (tone/process):
  - Remove durations; dates are fine. Keep prompts consistent across phases—every kickoff must
    repeat the core workflow because web sessions are stateless (no memory across runs).

- Outcome after these turns:
  - Plan clarity: Phase 2 narrowed to independent modules; logs/workflow entrenched.
  - Dependencies acknowledged; future phases will absorb the coupled modules.
  - Tooling clarity: select pragmatic deps (smol-toml) to keep momentum.

- Open items captured for follow‑up in later phases:
  - Verify no hidden cross‑phase imports per module at start of each session.
  - Keep Phase prompts at the same detail level; avoid assuming prior agent memory.
  - Maintain MASTER/STATUS/CHECKLIST updates at end of every session.

- Decisions captured explicitly:
  - Phase 2 scope is minimal and executable; defer coupled modules rather than stub heavy systems.
  - Use smol-toml; do not port TOML now; revisit only if zero-deps policy becomes a requirement.
  - Prompts must embed the full workflow every session (stateless agents) and link logs.
  - Enforce session hygiene: read → act → update STATUS/CHECKLIST/MASTER → commit/push.

- Risks + mitigations noted:
  - Hidden imports discovered late → run a pre-flight grep/import check at session start.
  - Over-verbosity in prompts → keep concise headers, link to standards; avoid duplicating docs.
  - Tooling drift → lock npm + prettier + eslint rules in dev standards.
  - Estimate bias → remove estimates; track actuals in STATUS as evidence.

- Phase 2 module intents (sketch):
  - config: types + validation; surface minimal provider/interfaces to avoid cross-phase pulls.
  - config-loader: TOML -> config with sane defaults; leverage smol-toml; unit tests on edge cases.
  - message-history: JSONL persistence with append/read/list/archival; deterministic paths.
  - rollout: orchestrate per-run conversation logs; retention and lookup helpers.

- Subagent review alignment:
  - Agree: scope reduction; large line-count reality; avoid stubs that undermine tests.
  - Partially agree: async pattern is non-issue; just document an example.
  - Disagree: overall grade was pessimistic; plan is viable with scope fix.

- Evidence of execution (committed artifacts):
  - Logs and standards added at repo root; Phase 2 scaffolded with TDD-first prompts.
  - Commit references captured; workspace prepared for stateless web-agent flows.

- What success looks like at end of Phase 2:
  - All 4 modules green with tests; strict TS; master/status/checklist updated.
  - No cross-phase imports; any provider coupling is hidden behind interfaces/TODOs.
  - Kickoff prompt reproducibly starts new sessions without confusion.

- Concrete references (for stateless agents):
  - Logs: codex-ts/PORT_LOG_MASTER.md, codex-ts/PORT_LOG_PHASE1.md, codex-ts/KNOWN_BUGS.md, codex-ts/DEV_STANDARDS.md
  - Phase 2 docs: PORT-PHASES/phase-2/{README.md,CHECKLIST.md,STATUS.md,DECISIONS.md,QUICK_START_PHASE2.txt}
  - Commit refs: a0e7fa5f (root logs/bugs/dev standards); a869a17f (reduced scope); ab6efa50 (smol-toml)

- Kickoff steps (condensed, repeat every session):
  1) Read MASTER/PHASE logs → understand status
  2) Read phase README/STATUS/CHECKLIST
  3) Port tests first for current module, then implement
  4) Run tests until green; strict TS; format
  5) Update CHECKLIST/STATUS/MASTER; commit + push

- Phase 2 start order and guards:
  - Order: config → config-loader → message-history → rollout
  - Guardrails: no cross-phase imports; if needed, local minimal types with TODO to replace

- TOML choice notes:
  - Use smol-toml (active, 0 deps). Keep a future option to fork/own. Do not block Phase 2.

- Subagent review takeaways (kept verbatim for traceability):
  - Critical dependency issues: correct; scope reduced
  - Line-count underestimates: correct; planning adjusted
  - Async pattern concern: not a blocker; document example only

- What to record at end of each session (exact fields):
  - Modules touched; tests added/ported; remaining blockers; next-step pointer; commit hash

- Success criteria (explicit):
  - 4 modules implemented with tests; no Phase 3/4/5 imports; prompts reproducible; logs current
[Segment 03–04] Dependencies clarified; Phase 3 done; prompts standardized; TUI context

- Dependency analysis docs (DEPENDENCY_*.md) mapped cross-phase imports; initial idea to add a Phase 0/DI was rejected. Decision: keep Phase 2 narrowed; handle deps pragmatically (local minimal types/TODOs) and port what’s independent now.
- Clarified options for core/config import issues: DI interfaces, temporary type-only stubs, or port dependent modules when actually required; avoid over-engineering until a blocker is real.
- Phase 2 agent report: finished all 4 modules with 87 tests by simplifying types locally and avoiding unported deps; merged to main.

- Phase 3 prepared and then completed (7 modules, 163 tests). Phase 4 prepped. Ensured each phase kickoff includes the full read→act→update→commit workflow because web sessions are stateless.
- Prompt consistency fixed: Phase 4 prompt beefed up to match Phase 2 detail level (workflow, standards, end checklist). All phases scaffolded; committed.

- CLI vs TUI landscape: CLI is thin; TUI (ratatui) is the primary interactive experience in Rust; for TS, likely defer a rich TUI or use ink/blessed; long-term porting ratatui-TS plus Rich-TS is a separate initiative.

- Dependency handling playbook (for core/config and similar):
  - Start with real imports; if missing, prefer local minimal type definitions (no logic), marked TODO with the real module path; avoid fake behaviors.
  - If multiple missing deps cascade, pause and port the smallest required provider/type first.
  - Do not introduce DI unless a real blocker appears repeatedly; keep code simple.

- Phase 3 summary (execution/tools):
  - Standalone modules: apply-patch, file-search, execpolicy; Integration modules: sandboxing, exec, core/exec, core/tools.
  - Tests emphasize streaming, tool routing, and sandbox behavior.

- Phase prompts standardization (why it matters):
  - Each web session is stateless; kickoff must always restate: where to read, the TDD loop, standards, end-of-session checklist, and commit flow.
  - Lean prompts are fine if they still link the full workflow; don’t rely on memory.

- TUI implications for TS port:
  - CLI remains thin; rich interactive UX is a future track (ink/blessed or a ratatui-TS effort). Keep out of critical path for core library phases.

- Docs and paths (for traceability):
  - Dependency docs: codex-ts/DEPENDENCY_ANALYSIS.md, DEPENDENCY_FINDINGS.md, DEPENDENCY_GRAPH.txt, DEPENDENCY_INDEX.md
  - Phase 3 kickoff: PORT-PHASES/phase-3/QUICK_START_PHASE3.txt (commit 22dbf1f8)
  - Phase 4 kickoff: PORT-PHASES/phase-4/QUICK_START_PHASE4.txt

- Option A/B/C for Phase-2 imports (kept for future reference):
  - A DI refactor: add interfaces, inject later (cleaner, more work now)
  - B Type-only stubs: minimal types to satisfy compiler; no fake logic
  - C Just port as-needed: pull deps only when a real blocker manifests (chosen default)

- Phase 2 completion (external agent) specifics retained:
  - config: introduced local enums/interfaces for missing types; kept TODOs
  - config-loader: TOML merge with smol-toml; paths resolved; defaults tested
  - message-history: JSONL append/list/archival
  - rollout: directory structure under ~/.codex/sessions/YYYY/MM/DD; helpers for archive/delete
  - 87/87 tests green across modules

- Phase 3 content (high-level scope recap):
  - apply-patch: tree-sitter diff application; chunk/hunk handling
  - file-search: project search with filters
  - execpolicy/sandboxing/exec: policy checks + process spawn + streaming
  - tools: tool router/proxy wiring into core

- Prompt standardization (what to include every time):
  - Links to MASTER/PHASE logs; read-before-do
  - TDD cycle instructions (port tests → implement → re-run)
  - Strict TS rules + formatting
  - End-of-session updates (CHECKLIST, STATUS, MASTER) + commit/push
  - Next-step pointer for the following session

- Rationale against shrinking prompts in later phases:
  - Sessions have no memory; omitting the workflow creates drift and chaos
  - Consistent scaffolding reduces handholding and re-prompting

- CLI/TUI elaboration for planning:
  - CLI (Node wrapper) remains a thin launcher; main Rust logic lived in codex-rs/cli
  - TUI (codex-rs/tui, ratatui-based) is the rich UI; 18k LOC—future track, not on critical path
  - TS equivalents later: ink/blessed or a dedicated ratatui-TS effort; combine with Rich-TS for formatting

- What to check next session (guardrails):
  - Verify Phase 3 prompt still contains full workflow; ensure Phase 4 prompt matches style.
  - Confirm links/paths resolve (QUICK_START files exist and are current).
  - Validate test categories for Phase 3 (streaming/tool routing) are represented.
  - Keep a short “Next steps” at the end of STATUS.md for continuity.

[Segment 05–06] TUI strategy, provider expansion (Messages), and auth modes plan

- TUI vs Rich:
  - Ratatui (Rust) powers Codex’s interactive terminal UI; Rich (Python) is formatting-only.
  - TS path: pair Rich-TS (formatting) with a TUI framework (ink/blessed) or port ratatui to TS later; near-term keep CLI thin and defer rich TUI.
  - Long-term vision: Rich-TS + Ratatui-TS + xterm.js for web; LLM‑optimized docs, MCP education server, prompt packs—position as AI‑native terminal UI stack.

- Phase 4 scope alignment:
  - Phase 4.1: port existing OpenAI client (Responses + Chat) with provider pattern (`WireApi`), chat aggregation adapter → common `ResponseStream`.
  - Phase 4.2: add Anthropic Messages: extend `WireApi::Messages`, adapter maps SSE events → `ResponseEvent`, tool spec converter to Anthropic format, simple API‑key auth.
  - Tool harness: execution is shared; adapters translate provider‑specific tool specs to internal tool calls.

- Auth modes (separate phase):
  - Current: ApiKey, ChatGPT OAuth. Target 4 modes: OpenAI API key, Anthropic API key (x-api-key), ChatGPT OAuth, Claude OAuth (PKCE).
  - Decision: keep client work in Phase 4 with stub/dummy tokens; implement full auth flows in Phase 5. Messages work proceeds without blocking on OAuth.

- Consultant prompts and scaffolding produced:
  - gpt-5-pro-api-consult.md (+ Codex‑High variant) with background, code refs, deliverables; Phase 4.1/4.2 directories created and linked.

- Guidance for provider expansion implementation:
  - Keep `ResponseStream` as the normalized surface; implement a Messages SSE adapter mirroring the Chat aggregation pattern.
  - Tool conversion: internal ToolSpec → provider schema; keep one internal schema and per‑provider renderers.
  - Tests: add end‑to‑end fixtures that assert equivalence across Responses/Chat/Messages streams.

- Auth scope detail (Phase 5):
  - ChatGPT OAuth: PKCE, refresh, keyring storage; device-code flow for CLI; token caching.
  - Claude OAuth: parallel design to ChatGPT; different endpoints/client IDs; same PKCE pattern.
  - API key handling: provider‑specific headers; config surface clarifies `authorization` vs `x-api-key`.
  - Injection point: `ModelClient` accepts `AuthManager`; Phase 4 uses dummy tokens; Phase 5 swaps real manager.

- Messages adapter specifics to mirror Chat aggregation:
  - Map Anthropic SSE events → `ResponseEvent`: text_delta, reasoning_delta, tool_use, tool_result, error, done.
  - Maintain per‑tool_use buffers with IDs; emit final tool calls/results coherently; handle parallel tool_use by sequencing outputs deterministically.
  - System prompt mapping: base_instructions → Messages `system` blocks; stop sequences pass‑through.
  - Token usage normalization: include reasoning/cache tokens; align across providers.

- Test plan snippets (Phase 4.2):
  - Request formatting (RF‑01..): thinking config, stop sequences, tool schemas per provider.
  - Response parsing (RP‑01..): SSE fixtures across all content blocks.
  - Streaming adapter (SE‑01..): delta accumulation, cancellation via AbortSignal.
  - Tool calling (TC‑01..): round‑trip tool_use → tool_result matching.
  - Error handling (EH‑01..): anthropic‑ratelimit headers, retryable vs fatal.
  - Integration (IT‑01..): provider parity → equivalent `ResponseStream`.

- Phase boundaries recap:
  - 4.1 ports OpenAI client; 4.2 adds Messages; 5 adds auth modes; TUI remains future track.

- Concrete file/section anchors for future agents:
  - Provider pattern: codex-rs/core/src/model_provider_info.rs (WireApi, ModelProviderInfo)
  - Chat aggregation reference: chat_completions.rs (delta → aggregated message)
  - Messages module (TS target): codex-ts/src/core/client/messages/{types.ts,adapter.ts,sse-parser.ts,request-builder.ts,transport.ts,retry.ts,tool-bridge.ts,index.ts}
  - Auth modules (Phase 5 target): login/, keyring-store/, core/auth/; config surface under codex-ts/src/config.ts

- Execution harness invariants to maintain across providers:
  - Unified `ResponseEvent` envelope & `ResponseStream` semantics; no provider leaks to callers.
  - Tool registry usage consistent; adapters only transform spec/IO, not execution.
  - Abort/cancel semantics honored end‑to‑end; timers/signals cleaned up in tests.

- Risks & mitigations snapshot:
  - Parallel tool_use: serialize emissions deterministically (index/order) and assert in tests.
  - OAuth complexity: isolate to Phase 5; avoid leaking into 4.2 transport tests.
  - Drift in prompts/logs: add “Before ending session” checklist to all quickstarts.

[Segment 07–09] Messages design reviews → merged blueprint; 4.1 validated; 4.3 planned; script-harness consult queued

- Design reviews:
  - GPT‑5‑Pro v1 (A‑): strong architecture/event mapping/types/tests; gaps: parallel tools, thinking config, system prompt, error/token mapping, cancellation, retry/backoff, auth injection, versioning.
  - Codex‑High (A+, 95/100): complete file structure (messages/ subdir), test matrix tables, error handling, rate‑limit headers, backpressure; addressed most gaps; two clarifications added (thinking config source; parallel tools sequential note).
  - GPT‑5‑Pro v2 (90/100): fully specifies parallel tools (code), thinking config modes + precedence, system prompt conversion, token normalization, cancellation with AbortSignal, retry params, full auth; overall best for code examples/explicitness.
  - Decision: merge Codex‑High structure/tests with GPT‑5‑Pro v2’s explicit implementations (parallel tools, tokens, cancellation, system prompt, retry). Merged doc produced; Phase 4.2 workplan updated to 167 tests.

- Phase 4 scaffolding:
  - 4.1: port existing client (client‑common, model‑provider‑info, stub‑auth, chat_completions, client, tool‑converters) with 150+ tests.
  - 4.2: add Messages adapter (extend WireApi, SSE adapter, tool spec converter, auth header); normalized to `ResponseStream` parity with Responses/Chat.
  - 4.3: backend services & MCP (backend‑client, chatgpt, rmcp‑client, mcp‑server, core/mcp) planned; OpenAI‑specific, unrelated to Anthropic Messages.

- Status updates:
  - 4.1 validated post‑merge: 6/6 modules, 114 tests passing; background test zombies killed.
  - 4.2 green‑lit with merged design/workplan.
  - Workspace cleaned: older prompts/designs archived to `.archive/` to avoid agent confusion.

- Script‑based tool harness (future 4.4):
  - Proposal: detect `<tool-calls>…</tool-calls>`, execute TypeScript in QuickJS with whitelisted tools; provider‑agnostic; returns custom_tool_call_output.
  - Risks: security, approvals mid‑script, lack of streaming; plan: expert consult prompt `script-harness-consult.md` (security, hardening, tests) prepared.

- Constraints from Anthropic Messages:
  - When thinking is enabled, final assistant message must start with a thinking block before tool_use blocks—flagged for Phase 4.2 adapter/tests.

- Next actions captured:
  - Use merged Messages design as Phase 4.2 blueprint; keep test IDs and quotas.
  - Keep 4.3 strictly OpenAI backend/ChatGPT features; Anthropic auth lands in Phase 5.
  - Queue 4.4 consult for script harness security/approvals and QuickJS hardening.

- Merged Messages design anchors (paths/sections) for traceability:
  - Design: /MESSAGES_API_INTEGRATION_DESIGN_CODEX.md (merged; sections 2.7–2.13 cover parallel tools, system prompt, token mapping, errors, auth, cancellation, stop sequences)
  - Phase 4.2 workplan: PORT-PHASES/phase-4.2/{README.md,WORKPLAN.md,CHECKLIST.md,STATUS.md,QUICK_START.txt} (target 167 tests)
  - Test IDs retained: RF‑, RP‑, SE‑, TC‑, EH‑, IT‑ series.

- Parallel tool_use handling (final approach):
  - Track multiple tool_use IDs concurrently; deterministic emission order; single assistant turn may contain multiple tool_result blocks.
  - Adapter maintains per‑tool buffer/state; results routed back by tool_use_id; provider quirks normalized.

- Thinking/system/token normalization:
  - Thinking: provider‑level + per‑turn override; modes: none/readable/raw; precedence documented.
  - System prompt: base_instructions → provider system field (string/blocks); cross‑API mapping table maintained.
  - Token usage: unify reasoning and cache tokens; produce consistent TokenUsage across providers.

- Error/retry/cancellation policies:
  - Error table maps provider types → internal errors; parse rate‑limit headers (anthropic‑ratelimit‑*).
  - Retry/backoff defaults (e.g., 250ms, factor 2x, max 4s, 6 attempts) with fatal vs retryable classification.
  - Cancellation via AbortSignal; cleanup timers/streams reliably.

- 4.3 scope clarity:
  - OpenAI Codex backend client + ChatGPT web helpers + MCP modules; no Anthropic backend; Messages is API‑side only.

- Script harness consult (4.4): quick pointers
  - Feature flag (disabled/dry‑run/enabled), QuickJS runtime, approvals via suspend/resume, security hardening checklist, 60‑test suite split.

- Execution checklist for 4.2 agent (from merged design):
  1) Wire `WireApi::Messages`; add provider config surface (auth.api_key, anthropicVersion, thinking modes).
  2) Implement request builder (system mapping, stop sequences, tools serialization).
  3) Implement transport with auth header + retry/backoff; support AbortSignal cancellation.
  4) Parse SSE events → adapter state machine (text/reasoning deltas, tool_use/result, errors, done).
  5) Tool bridge: internal ToolSpec → Anthropic tool schema; round‑trip tool_use → tool_result mapping by ID.
  6) Normalize token usage (reasoning/cache tokens).
  7) Tests: RF/RP/SE/TC/EH/IT series; fixtures for each provider; assert ResponseStream parity.
  8) Docs: update README/WORKPLAN/CHECKLIST with test counts and edge cases.

- Guardrails to verify on PR:
  - All tests green (target ≥167); no lint violations; docs link to merged design; `.archive/` contains superseded prompts/designs; quickstarts reference current targets.

[Segment 10–12] Script‑harness prompt corrections → design comparisons → final merged design; phases 4.4/4.5 setup

- Prompt discipline corrected:
  - After mis-synced edits (parallel writes without re-read), slowed down and re‑applied your requirements precisely: add Phase 4.0 context, remove “limitations”, state QuickJS preference (but invite alternatives), enable/disable execution mode, detail async edge cases (partial completion), define runtime context assumptions, and preserve thinking + script + text in history. Result: `script-harness-consult.md` finalized (~740+ lines).

- Design comparisons for script harness:
  - Codex vs Codex‑CLI:
    - Codex (A+, 97/100): more complete security enforcement, file structure (7 modules), error taxonomy, model‑output integration, stronger implementation plan.
    - CLI (A, 93/100): cleaner resource limits table; otherwise a subset.
  - GPT‑5‑Pro (A, 94/100): strongest pseudocode and hardening (freeze intrinsics), tools.spawn pattern, but recommends isolated‑vm primary; counters our QuickJS preference.
  - Decision: hybrid—keep Codex structure and specifics; adopt GPT‑5‑Pro’s hardened prelude, tools.spawn API, and orchestrator pseudocode; QuickJS remains primary runtime for our goals.

- Final merged spec produced: `SCRIPT_HARNESS_DESIGN_FINAL.md` (~1,415 lines)
  - Contents: 7‑module architecture, QuickJS primary, hardened prelude, approval suspend/resume, PromiseTracker, comprehensive errors, spawn pattern, 60‑test suite with IDs, 8‑week plan.
  - Rationale: secure, implementable, provider‑agnostic; aligned with QuickJS‑first decision.

- Phase 4.4 vs 4.5 split:
  - 4.4 Core (QuickJS only): detection/parsing, tool facade (applyPatch, exec, fileSearch), promise lifecycle, approvals, baseline errors, security checks; initial 40 tests.
  - 4.5 Hardening (QuickJS focus): expand tests to 60, performance/telemetry, security review, documentation polish. Drop “isolated‑vm option” per our QuickJS‑only decision.

- XML‑only execution format:
  - Remove fenced block support; standardize on `<tool-calls>…</tool-calls>` to cut parser complexity and test matrix—validated by prior experience in `team-bruce` where dual formats caused churn.

- Integration into phases and docs:
  - Phase 4.4/4.5 READMEs/QUICK_START/CHECKLIST link `SCRIPT_HARNESS_DESIGN_FINAL.md`; main navigation updated; `.archive/` holds superseded prompts/designs.

- Actionable guardrails for 4.4 PRs:
  - Tests: 40→60 as hardening proceeds; enforce feature modes (disabled/dry‑run/enabled); deterministic ordering of parallel tool calls; clean timer/signal teardown.
  - Security: memory/time limits enforced; no Node APIs in sandbox; progress throttling; payload caps; banned-token scan; per‑tool whitelist.
  - Docs: quickstarts include the end‑of‑session checklist; link back to merged design and test IDs.

- Concrete anchors (files/sections):
  - Final spec: /SCRIPT_HARNESS_DESIGN_FINAL.md → Sections: Security (1.x), Architecture (2.x), Promise lifecycle (3.x), Approval (4.x), Errors (5.x), Context (2.4), Feature flags (9), Tests (10), Plan (11)
  - Phase 4.4 docs: PORT-PHASES/phase-4.4/{README.md,QUICK_START.txt,CHECKLIST.md,STATUS.md}
  - Phase 4.5 docs: PORT-PHASES/phase-4.5/{README.md,QUICK_START.txt,CHECKLIST.md,STATUS.md}
  - `.archive/` holds superseded prompts/designs to avoid agent drift

- 4.4 Implementation checkpoints (PR-ready bullets):
  - Detection: XML tag scan with size caps; unit tests for mixed content (thinking/text/tool_use)
  - Sandbox: QuickJS context creation, frozen intrinsics, memory/time limits, progress throttling
  - Tools: whitelist enforcement, descriptions synced into system prompt, error mapping for missing tool
  - Lifecycle: PromiseTracker per call, abort on orphaned promises after grace, cleanup signals/timers
  - Approvals: suspend/resume via Asyncify; denial/error pathways return structured failures
  - Streaming: surface progress/log events; preserve thinking/text/script order in history

- 4.5 Hardening checklist (QuickJS only):
  - Broaden tests to 60; add red‑team suite; perf benchmarks; telemetry hooks; docs polish; security review sign‑off

- Why QuickJS primary (kept concise):
  - Portability (no native build), smaller footprint, simpler API; adequate isolation with worker + WASM; fits our single‑user library threat model

- De‑scoping decisions (to stay focused):
  - No fenced block execution; no isolated‑vm in 4.5; TUI deferred

- Final spec key excerpts (kept concise for future implementers):
  - Security defaults:
    - memoryMb: 96, stackKb: 512, timeoutMs: 30000, interruptEvery: 2ms or 1k opcodes
    - input cap: 20KB script, return cap: 128KB, progress throttle: 1/500ms (max 50)
    - banned-token scan (light tokenizer) before execution; UTF‑8 validation
  - Context interface (inject, frozen):
    interface ScriptContext {
      conversationId: string; sessionId: string; workingDirectory: string;
      sandbox: { timeoutMs: number; memoryMb: number; remainingToolBudget: number; mode: 'disabled'|'dry-run'|'enabled' };
      approvals: { required: boolean; lastRequestId?: string };
      telemetry: { emitProgress: (e: { type: string; data?: unknown }) => void };
    }
  - Feature modes:
    - disabled: detection off; any <tool-calls> ignored
    - dry‑run: parse/validate only; no tool execution; return { kind: 'dry_run', summary }
    - enabled: execute with whitelist + approvals
  - Tool whitelist:
    - config.allowedTools: string[]; ToolNotFoundError(toolName, allowed)
    - system prompt generated from allowedTools + registry descriptions
  - Approval flow:
    - suspend via Asyncify; request includes script hash, tools, budget; denial resumes with error
  - Errors taxonomy (examples):
    - ScriptParseError, SandboxTimeoutError, SandboxMemoryError, ToolNotFoundError,
      ToolExecutionError, ApprovalDeniedError, HarnessInternalError
  - Tests (IDs):
    - S1–S20 security; F1–F30 functional; I1–I10 integration; include abort/cancel + orphaned promises

- 4.4 execution plan (condensed task list):
  1. Detection + validation + size limits; unit tests for malformed/mixed content
  2. QuickJS runtime wrapper (intrinsics freeze, limits, progress channel)
  3. ToolFacade with allowedTools; map ToolRegistry → async sandbox fns; error mapping
  4. PromiseTracker (per call); abort orphaned promises with 250ms grace
  5. Approval suspend/resume; denial paths; serialize approval metadata
  6. History ordering guarantees (thinking → text → script outputs)
  7. Docs and examples; link FINAL spec sections; record test IDs achieved (target 40)

- 4.5 hardening (QuickJS‑only) acceptance:
  - Expand to 60 tests; add red‑team cases (infinite loop, deep recursion, memory pressure, prototype pollution attempts)
  - Add perf baselines (startup ms, memory MB, tool call overhead) and telemetry hooks
  - Documentation: HOWTO add tools; threat model; tuning guide; troubleshooting

- Design deltas captured from comparisons (for later audits):
  - Adopt GPT‑5‑Pro: hardened prelude, tools.spawn API (detached tasks), detailed pseudocode
  - Keep Codex: file layout, error taxonomy, explicit output integration, 8‑week plan
  - Drop: isolated‑vm (QuickJS‑first policy); fenced blocks

- PR acceptance checklist (10–12 scope):
  - [ ] FINAL spec linked in 4.4/4.5 docs; `.archive/` contains superseded files
  - [ ] 4.4: 40 tests min, all green; feature modes enforced; deterministic parallel tool ordering
  - [ ] Security defaults enforced; no Node APIs; return caps respected; progress throttled
  - [ ] 4.5: adds 20 tests; perf baselines; red‑team suite; docs finalized

