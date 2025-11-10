# Technical Decision Log

## Purpose
This log captures technical decisions made during implementation. Each decision should include:
- What was decided
- Why (rationale)
- Any alternatives considered
- Date/context

---

## Decision Template

```markdown
### [Date] Decision: [Short Title]

**Context:** [What problem were you solving?]

**Decision:** [What did you choose?]

**Rationale:** [Why this choice?]

**Alternatives Considered:**
- [Option A]: [Why not this?]
- [Option B]: [Why not this?]

**Impact:** [What does this affect?]
```

---

## Decisions Log

_(Decisions will be added here as work progresses)_

### [2025-10-22] Decision: Grep Tool Command Overrides

**Context:** Tests need to exercise ripgrep timeouts and failure paths without waiting 30 seconds or invoking the real binary in every case.

**Decision:** Added optional `timeoutMs` and `rgCommand` overrides to `grepFiles`, while keeping the user-facing timeout error message identical to the Rust implementation ("rg timed out after 30 seconds").

**Rationale:** Allows deterministic timeout testing and the ability to stub `rg` when necessary, without changing production behavior or message strings.

**Alternatives Considered:**
- Rely on the real `rg` binary with the full 30-second timeout: too slow and flaky for unit tests.
- Mock `Bun.spawn` globally: more invasive and brittle across tests.

**Impact:** Test suite runs quickly while preserving expected runtime behavior and error messaging for production calls.

### [2025-10-22] Decision: Shell Tool Timeout Handling

**Context:** Porting the shell tool requires a timeout mechanism that mirrors the Rust error string but still allows fast unit tests.

**Decision:** Implemented a configurable timeout (default 30 seconds) with a shared helper that always reports "command timed out after 30 seconds" on expiry, matching Rust output. No sandbox or approval hooks were added in the initial port.

**Rationale:** Preserves message parity and keeps MVP scope aligned with project brief (no sandboxing yet) while enabling fast timeout tests by lowering the timer.

**Alternatives Considered:**
- Dynamic timeout strings reflecting test overrides: rejected to maintain exact message parity.
- Adding sandbox checks up front: deferred per scope guidance.

**Impact:** Shell tests complete quickly, and future work can extend the helper with richer context without breaking message compatibility.

### [2025-10-22] Decision: Include Bun Type Definitions

**Context:** Running `tsc --noEmit` surfaced missing type declarations for `bun` and `bun:test` modules.

**Decision:** Added `bun-types` as a dev dependency and configured `tsconfig.json` to include both `bun-types` and `node` ambient definitions.

**Rationale:** Ensures static analysis via `tsc` matches the execution environment and avoids ad-hoc module declarations.

**Alternatives Considered:**
- Suppressing compiler errors via `skipLibCheck` alone: would hide genuine issues with Bun APIs.
- Creating local ambient module stubs: more maintenance and less fidelity than the official typings.

**Impact:** `tsc --noEmit` now passes, providing safer refactors for future features.
