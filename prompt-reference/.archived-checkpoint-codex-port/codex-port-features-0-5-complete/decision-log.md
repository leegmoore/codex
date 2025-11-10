# Technical Decision Log - Feature 5

## Summary of Features 0-4 Decisions (Archived)

Features 0-4 established:
- Test override mechanisms for fast testing (timeout, command mocking)
- Exact error message parity with Rust
- Added bun-types for proper TypeScript checking
- Skipped sandboxing per scope guidance

**Full details:** See `codex-port-features-0-4-complete/decision-log.md`

---

## Feature 5 Decisions

_(Decisions for Feature 5 will be added here as work progresses)_

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

### 2025-10-22 Decision: Indentation Mode Parameter Naming

**Context:** Porting the indentation-aware read logic required adding several new options to `readFile`.

**Decision:** Exposed the new arguments in camelCase (`anchorLine`, `maxLevels`, `includeSiblings`, `includeHeader`, `maxLines`) while keeping the existing JSON field semantics.

**Rationale:** The rest of the TypeScript tool surface already uses camelCase; matching that style avoids a mixed-case API and keeps call sites ergonomic.

**Alternatives Considered:**
- Snake_case properties (e.g., `max_levels`): would have matched Rust naming but diverged from the established TS style.
- Nested options object: unnecessary indirection for the current set of flags.

**Impact:** All call sites and tests reference the camelCase names; documentation must reflect this convention going forward.

### 2025-10-22 Decision: Skip JavaScript Indentation Fixture

**Context:** The Rust suite marks the complex JavaScript indentation test with `#[ignore]` because the current algorithm does not expand that case fully.

**Decision:** Added the corresponding Bun test as `test.skip`, mirroring the ignored Rust case while leaving the expected output documented for future work.

**Rationale:** Keeps parity with the reference implementation without blocking the suite; the skipped test still captures the desired behavior for later improvements.

**Alternatives Considered:**
- Enabling the test: would currently fail because the algorithm does not yet produce the expected lines.
- Dropping the test entirely: would lose the specification for the improvement.

**Impact:** Test count remains aligned with Rust; future enhancements can re-enable the test once the behavior is implemented.
