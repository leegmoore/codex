# Phase 1 Design – Detection & Basic Execution

## Objective
Detect `<tool-calls>` script blocks in assistant responses, validate TypeScript snippets, and execute them in a hardened QuickJS runtime with support for `exec`, `readFile`, and `applyPatch` tools. Emit results back into the conversation loop and surface script activity in the CLI.

## Components

1. **Script Detector (`script_detector.ts`):**
   - Scan assistant messages (ResponseItems) for `<tool-calls>...</tool-calls>` using regex.
   - Ignore other roles/types.
   - Support multiple blocks; record start/end indices for logging.

2. **Script Parser (`script_parser.ts`):**
   - Enforce limits: UTF-8, <=20 KB, balanced tags, banned tokens (`require`, `import`, `eval`, `new Function`).
   - Syntax-check via TypeScript transpile probe; auto-wrap with async IIFE when top-level await found.
   - Return `{success, script, error}` with helpful messages.

3. **QuickJS Orchestrator (`script_orchestrator.ts`):**
   - Use quickjs-emscripten to create context per execution (Phase 1 = no pool yet).
   - Apply hardening shim (freeze intrinsics, delete eval/Function/etc.).
   - Inject globals: `tools`, `context`, `console` (rate-limited).
   - Execute script, convert returned value into `ScriptToolCallOutput` items.
   - Capture runtime errors, shorten stack traces to user code.

4. **Minimal Tool Facade:**
   - Expose `tools.exec`, `tools.readFile`, `tools.applyPatch` via proxy that validates arguments and calls existing tool implementations.
   - No approvals yet; rely on existing structured path (Phase 4 adds pause/resume).

5. **CLI Updates:**
   - Display banner `▶️ Running script (hash …)` when script starts.
   - Stream console.log output to CLI (prefix `[script]`).
   - When script finishes, show summary (duration, tools used).

## Error Handling
- Parser errors → ResponseItems with `ScriptParseError`, showing snippet + message.
- Runtime errors → `ScriptRuntimeError` with stack trimmed to script lines.
- Tool errors propagate as structured errors (JSON string with `error` field).

## References
- QuickJS runtime binding (existing Phase 4.4 prototype).
- Tool implementations: `codex-ts/src/tools/*`.
- Response processing pipeline: `codex-ts/src/core/response_processing`.
