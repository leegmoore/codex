### Conversation Narrative Summary (V2) – planner-02


[Segment 02‑A Narrative]
Context: Tool fidelity and execution model decisions; streaming vs batch; QuickJS sandbox boundary; script‑harness advantages; planning 4.5/4.6 scope.

Sequence (turn‑by‑turn)
- User: “Which tools are closer to Rust? Which implementations are most faithful?”
- Assistant: Compares applyPatch and exec:
  - applyPatch: Rust (tree‑sitter) > codex‑port (web‑tree‑sitter) > codex‑port‑02 (regex + TODOs). Recommendation: adopt codex‑port’s tree‑sitter version.
  - exec/shell: Rust > codex‑port‑02 engine.ts > codex‑port shell.ts. Our engine is closer to Rust but lacks streaming deltas and signal nuance.
- Decision: Replace applyPatch with codex‑port’s version; add missing tools (readFile, listDir, grepFiles); keep our exec.

- User: “What is our exec missing vs Rust?”
- Assistant: Missing live streaming output deltas; elevated permissions/justification/arg0 params; StreamOutput abstraction; signal‑specific handling; output delta capping; otherwise aligned on sandbox, env, cwd, timeouts.
- Decision: Accept batch mode for library use; streaming matters for TUI UX but not model→tool→model flow.

- User: “QuickJS and console access?”
- Assistant: Tools execute in host (Node), not the QuickJS sandbox; QuickJS has a console proxy (rate‑limited) that forwards logs as script_log events; isolation via WASM/VM; boundary is function marshalling.
- User: “What is the isolation model?”
- Assistant: Worker thread (killable) running QuickJS WASM; within it a QuickJS context (no Node globals/imports); defense‑in‑depth without separate OS process.

- User: “Can models write TS that runs tools in parallel?”
- Assistant: Yes—async/await with Promise.all/race/allSettled; PromiseTracker tracks promises, cancellation, cleanup; context.* is sync, tools.* are async.
- User: “This is easier for models than structured turns.”
- Assistant: Exactly—script harness condenses multi‑tool workflows into a single turn, preserving the original task in context.

- User: “Keep the original prompt at the top each turn (XML wrapper).”
- Assistant: Agrees; prepend <original-user-prompt> each turn; minimal tokens; reduces drift over many tool calls.

- User: “What’s valuable in 4.5 besides a second sandbox?”
- Assistant: tools.spawn (detached tasks), worker‑pool tuning, context reuse, script caching, TS compilation caching, perf benchmarks, docs; drop isolated‑vm.
- User: “Detached tasks matter for 10‑minute phone‑a‑SME calls.”
- Assistant: Then tools.spawn becomes essential; explains worker pool/context reuse/script caching/TS caching patterns with concrete pseudo‑APIs.

- User: “Drop time estimates; they confuse.”
- Assistant: Removes estimates; keeps a crisp task list.

Decisions
- Replace applyPatch; add readFile/listDir/grepFiles; keep exec.
- Exec streaming not required for library use; streaming becomes a UI concern.
- QuickJS‑host boundary: tools in host; console proxy with rate limits.
- Script harness becomes primary multi‑tool interface; maintain original‑prompt prefix per turn.
- Phase 4.5 focuses on spawn + performance + docs (no isolated‑vm).

Acceptance (what reviewers check)
- applyPatch path points to tree‑sitter implementation; tests green.
- New tools registered and described in system prompt; basic unit tests for each tool’s return types.
- Exec behavior documented: batch outputs, no deltas; signal handling/limits documented for future work.
- Script harness examples use Promise.all; original‑prompt tag appears at top in transcripts.
- Phase 4.5 docs list spawn/worker pool/context reuse/script caching/TS cache; no isolated‑vm remains.

