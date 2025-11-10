# Project 03: Script Harness Integration – Technical Approach

## 1. Architecture Overview

The script harness sits alongside the existing structured tool router. Response processing scans assistant messages; if it finds `<tool-calls>` blocks, it sends them into the script pipeline, otherwise it continues down the structured path. That pipeline performs detection, parsing, orchestration, and result emission, all while sharing the same tool registry, approval system, and persistence layer as the classic route. The diagram below shows how the new components bolt on without disrupting downstream flows.

```
Assistant Response
    │
    ├─ Structured Tool Router (existing)
    │
    └─ Script Harness (new)
         ├─ Detector → Parser
         ├─ Orchestrator (QuickJS runtime)
         ├─ Worker Pool & Script Cache
         ├─ Tool Facade (whitelists, budgets, approvals)
         └─ Promise Tracker & Spawn Manager
                │
                └─ Shared Tool Registry → Tools/Approvals → Response Processing
```

Project 02 already delivered Cody’s CLI, auth/persistence, and structured router. That means we enter this project with approvals, event loop, testing harness, and documentation patterns established. Project 03 wires the prototype harness from Enhancement 02 into the main pipeline, then hardens it with CLI/REST UX, budgets, detached tasks, caching, and observability.

---

## 2. Phase 1 – Detection & Basic Execution

We begin by making Cody aware of scripts and able to run simple ones safely. The detector scans assistant messages for `<tool-calls>` blocks, records their offsets for logging, and ignores any other roles. The parser enforces baseline constraints—UTF‑8, ≤20 KB, balanced tags, no `require`/`eval`/`new Function`—and compiles the snippet via a TypeScript probe. If the script uses top-level `await`, we wrap it in an async IIFE so QuickJS can run it directly. Parsed scripts flow into a small orchestrator that spins up a fresh QuickJS context (one per execution at this stage), applies the hardening shim (freeze intrinsics, remove dangerous globals), injects a tiny `tools` proxy exposing `exec`, `readFile`, and `applyPatch`, and executes the script. Outputs are converted into `ScriptToolCallOutput` items so the rest of the response pipeline remains unchanged. The CLI displays a banner such as `▶️ Running script (hash abcd…)`, streams console.log lines with a `[script]` prefix, and prints a short summary when the script finishes.

Testing focuses on detector edge cases (nested tags, multiple blocks), parser bans, QuickJS success/failure, and CLI log output. Hardening is intentionally light here—just enough to make script execution observable and debuggable before we broaden tool access in the next phase.

---

## 3. Phase 2 – Full Tool Integration

Once scripts execute reliably, we expose the entire tool registry through a whitelist-aware facade. Tool packs (`core`, `file-ops`, `net`, `mcp`, etc.) allow us to define which sets are available; configuration lives in `scripts.yaml`, and the CLI gains `cody scripts tools` to list/enable packs. The proxy validates arguments using the same JSON schemas as structured calls, so error messages remain consistent. We enrich the CLI output with a per-script table (tool name, status, duration) and an optional verbose mode that prints JSON args/results for debugging.

Implementation hinges on reusing existing metadata: the facade pulls tool descriptions from the registry, respects pack-based whitelists, and enforces early budgets (max calls, concurrency) to prepare for approvals later. Tests ensure packs behave (enabled vs disabled), schemas fire, and CLI listing renders correctly. At the end of the phase, scripts can do everything structured calls can, albeit without detached tasks or approval pauses yet.

---

## 4. Phase 3 – Promise Lifecycle & Detached Tasks

Scripts frequently orchestrate parallel work, so we need lifecycle management. A `PromiseTracker` registers every awaited tool call, associates it with an `AbortSignal`, and cancels outstanding work when scripts finish or abort. Detached work uses `tools.spawn.<toolName>()`, returning handles with `.done`, `.cancel`, `.id`, and `.status`. Spawned tasks continue after the script returns; their results surface in later turns via conversation history. The CLI shows live counters (“3 tools completed, 1 task running”) and adds a `cody scripts tasks` command to inspect detached work.

Persistence is key: we store task metadata (id, tool, status, start time) so future scripts or structured turns can reference them. Ctrl+C or timeouts cancel active tasks unless explicitly detached. Tests cover pending cancellation, spawn lifecycle, persisted status, and the new CLI commands. This phase gives users confidence that scripts won’t leak processes or leave forgotten work in the background.

---

## 5. Phase 4 – Approval Bridge & UX Integration

Dangerous tools already require approval in the structured path; now the harness must pause as well. The tool facade routes approval-required calls through a bridge that suspends QuickJS (via Asyncify), prompts the user with script metadata (hash, snippet, allowed tools, arguments), and resumes/aborts based on the response. Denials throw `ScriptApprovalDeniedError` back into the script so authors can handle it with try/catch. Every execution logs an audit record (hash, duration, tool counts, approvals/denials) into conversation metadata for later analysis. The CLI approval UI displays richer context—script excerpt, budgets, outstanding detached tasks—and REST endpoints mirror that data for remote clients.

Testing ensures suspending/resuming works even with multiple approvals in one script, denials never execute tools, and audit records appear even on failure. After this phase, script approvals feel identical to structured approvals, just with better context.

---

## 6. Phase 5 – Performance & Security Hardening

The final phase makes the harness production-ready. A worker pool maintains warm QuickJS contexts (size = `min(2, cpuCount)`), and script + compilation caches keyed by script hash reduce startup cost. A resource monitor enforces limits (size, call count, concurrency, runtime, memory); exceeding any limit throws a structured error linking to the docs. Security fuzzing ensures banned tokens stay blocked, prototype pollution is impossible, console logs are rate-limited, and runaway loops hit the timeout. Observability hooks emit metrics for scripts run, pool utilization, cache hit rate, and error types.

Benchmarks confirm warm execution overhead <20 ms and per-worker memory <16 MB. Cache invalidation ensures changed scripts recompile. Tests cover pool behavior, cache hits/misses, limit enforcement, security scenarios, and metrics emission. With this phase complete, the harness can handle production workloads without surprises.

---

## 7. Phase Seeding

Each phase directory contains `source/design.md`, `source/test-conditions.md`, `source/manual-test-script.md`, and `source/checklist.md` extracted from the sections above, plus `decisions.md` for coders to update. Prompts are assembled via `scripts/assemble-prompt.js`, mirroring the workflow from Project 02 so agents start each phase with the same level of guidance.
