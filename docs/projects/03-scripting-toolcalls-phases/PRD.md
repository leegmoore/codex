# Project 03: Script Harness Integration

**Project:** Script-Based Tool Calling & Harness Hardening  
**Status:** Planning  
**Start Date:** TBD  
**Dependencies:** Project 02 complete (CLI/provider/auth/persistence), QuickJS runtime vendored, tool registry schemas finalized

---

## 1. Overview

Project 02 gave Cody a reliable CLI, library surface, and structured tool router. Project 03 finishes the job we started with the script-harness prototype: it wires that QuickJS sandbox into the main response pipeline, brings the CLI/REST experiences up to the same standard as structured calls, and hardens the runtime with approvals, budgets, caching, and observability. Scripts remain TypeScript snippets enclosed in `<tool-calls>...</tool-calls>`, but now they become a supported feature with documentation and regression coverage.

Structured calls force the model to take one action per turn. It has to emit JSON, wait for the tool to finish, then decide what to do next. That is brittle when workflows require conditionals, loops, parallelism, or data reshaping. The script harness collapses those multi-turn sequences into a single turn, keeps the original user prompt near the top of context, and unlocks cheaper models (Gemini 2.5, DeepSeek) that are great at code but weak at JSON schemas. Humans also gain deterministic automations—they can write a script once, review it, and keep reusing it. This project turns that flexibility into something production teams can trust.

**Deliverables**
1. End-to-end script harness (detector, parser, orchestrator, worker pool, tool facade, approval bridge, result emission) merged into Cody.
2. CLI and REST API updates that surface script execution (banners, log streaming, approval metadata, audit logging) alongside structured calls.
3. Documentation set (`docs/script-harness.md`, additions to library + REST specs) describing how to author scripts, which tools are available, and what limits apply.
4. Benchmark + validation report demonstrating better completion rates on representative coding workflows.

---

## 2. Success Criteria

### Functional capabilities
1. **Script execution:** Assistant responses containing `<tool-calls>` execute in QuickJS, stream stdout/stderr to users, and emit `FunctionCallOutput` items back into the conversation loop.
2. **Tool coverage:** Every Cody tool (exec, file ops, applyPatch, search, MCP) is accessible through the script facade with the same approval policies and argument validation as structured calls.
3. **Promise lifecycle:** Scripts may orchestrate up to 32 tool calls (4 concurrent), spawn detached tasks via `tools.spawn.*`, and have pending work cancelled when turns end or users abort.
4. **Approval bridge:** Dangerous tools pause scripts, show script metadata (hash, allowed tools, arguments) in the CLI/REST UI, resume on approval, and throw typed errors on denial.
5. **Performance & safety:** Worker pool + script/compilation caching keep warm execution overhead under 20 ms, limit scripts to 20 KB / 5 s / 16 MB per worker, and terminate over-limit scripts with clear errors.
6. **Observability:** CLI/REST emit execution audits—script hash, tool counts, duration, stack traces trimmed to user code—and metrics (pool utilization, cache hit rate).

### Quality gates
1. `npx tsc --noEmit && npm run lint && npm test` clean (0 errors, 0 skipped tests).
2. ≥40 mocked-service tests covering detection, parsing, approvals, promise tracking, detached tasks, and resource limits.
3. Security tests (Playwright or Node) simulating eval/require/prototype pollution/runaway loops prove sandbox isolation.
4. Performance benchmarks showing pooled worker turnaround, cache hit rate, and timeout enforcement.
5. Documentation snippets verified via `npm run docs:test` so published examples compile/run.

### Deliverable summary
- Harness implementation merged.
- CLI + REST UX for script execution delivered.
- Documentation + benchmark report published.
- Migration note for agents explaining when to use scripts vs structured calls.

---

## 3. Scope

**In scope** – Script detection/parsing, QuickJS worker pool, script + compilation caching, promise tracker, `tools.spawn`, approval bridge, CLI/REST UX, observability hooks, benchmark harness, and documentation.

**Out of scope** – GUI script editor, hosted script library, automatic conversion of legacy prompts, model-specific prompt tuning (handled separately).

---

## 4. Dependencies & Prerequisites
- Project 02 finished (Cody CLI, provider/auth/persistence stable, structured router in place).
- QuickJS WASM bundle vendored and loadable inside worker threads.
- Tool registry schemas defined for every tool (Phase 4 from Project 02).
- Approval + CLI plumbing from Project 02 Phase 2.
- Benchmark scenarios selected (tool-heavy coding workflows and regression suites).

---

## 5. Quality Standards
- Follow `docs/core/dev-standards.md` (strict TypeScript, ESLint clean, readable errors, decisions documented).
- Follow `docs/core/contract-testing-tdd-philosophy.md` (contract-first tests, mock external boundaries, deterministic CI scripts).
- Security checklist (sandbox hardening, resource caps) completed before release.

---

## 6. Technical Constraints
- QuickJS sandbox only (no Node VM / isolated-vm).
- Scripts limited to 20 KB, 32 tool calls, 4 concurrent calls, 5 s runtime by default.
- CLI remains text-based (with optional JSON output) and REST streaming responses follow same schema.
- Tool registry stays the single source—no script-only tool implementations.
- Scripts cannot access network except via approved tools.

---

## 7. Phases Overview

| Phase | Focus | Highlights |
|-------|-------|------------|
| 1 | Detection & Basic Execution | Detector, parser, single QuickJS worker, three core tools, CLI script banner |
| 2 | Full Tool Integration | Tool facade, tool packs, schema validation, richer CLI output |
| 3 | Promise Lifecycle | Promise tracker, `tools.spawn`, cancellation + orphan cleanup |
| 4 | Approval & UX | Approval bridge, pause/resume, CLI approval metadata, audit logging |
| 5 | Performance & Security | Worker pool, script/compilation caching, resource limits, security/benchmark suite |

Optional Phase 3.5 (Gemini validation) stays parked until Gemini 3.0 is publicly available.
