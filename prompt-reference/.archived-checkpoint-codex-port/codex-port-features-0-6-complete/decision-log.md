# Technical Decision Log - Feature 6

## Summary of Features 0-5 Decisions (Archived)

Features 0-5 established:
- Test override mechanisms for fast testing (timeout, command mocking)
- Exact error message parity with Rust
- Added bun-types for proper TypeScript checking
- Skipped sandboxing per scope guidance
- CamelCase parameter naming for TypeScript consistency
- Indentation mode with parity for Python/C++/JS edge cases

**Full details:** See `.archived-checkpoint-codex-port/codex-port-features-0-5-complete/decision-log.md`

---

## Feature 6 Decisions

_(Decisions for Feature 6 will be added here as work progresses)_

### 2025-10-22 Decision: applyPatch parser type models

**Context:** Needed TypeScript equivalents for Rust `Hunk`, `UpdateFileChunk`, and `ApplyPatchArgs` when porting the parser tests.

**Decision:** Represented hunks as discriminated union objects with string paths and explicit `type` fields; stored patch paths as provided (relative strings) and mirrored `UpdateFileChunk` structure with camelCase property names.

**Rationale:** Discriminated unions make downstream matching easier in TypeScript, preserve Rust variant information, and keep equality checks straightforward in tests.

**Alternatives Considered:**
- Keep Rust-style nested objects without explicit discriminant: harder to narrow types and less idiomatic in TypeScript.
- Re-use Node `Path` objects: unnecessary complexity for parser layer.

**Impact:** Establishes data contracts for parser consumers and informs later executor implementation.

### 2025-10-22 Decision: Expose parser internals for tests

**Context:** Rust tests exercise `parse_one_hunk` and `parse_update_file_chunk` directly; needed parity in Bun tests.

**Decision:** Exported `parseOneHunk` and `parseUpdateFileChunk` from the parser module specifically for tests (will document as internal-use).

**Rationale:** Direct exports keep the test-first plan aligned with Rust coverage and avoid contorting public APIs just for error-path assertions.

**Alternatives Considered:**
- Re-create equivalent scenarios through `parsePatch`: brittle and complicated, especially for error-only cases.
- Duplicate parsing logic inside tests: risks divergence from production code.

**Impact:** Tests can validate edge cases precisely; later modules should treat these functions as internal helpers despite being exported.

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

### 2025-10-22 Decision: applyPatch executor result contract

**Context:** Porting the apply_patch executor required deciding how to surface stdout/stderr to tests and the eventual tool caller in TypeScript.

**Decision:** Implemented `applyPatch` to return an `ApplyPatchResult` object containing `{ success, stdout, stderr }`, mirroring the Rust writers by accumulating strings in-memory instead of streaming.

**Rationale:** Returning a structured result keeps tests simple, preserves the exact strings Rust prints, and gives the future CLI integration a straightforward object to serialize.

**Alternatives Considered:**
- Return nothing and throw on failure: makes it hard to assert stdout/stderr text in tests.
- Require writable streams in options: adds API friction and complicates callers that just need the strings.

**Impact:** Establishes the API surface other substeps (diff, heredoc, seek) will build on and lets upcoming integration reuse the accumulated stdout/stderr without refactoring.

### 2025-10-22 Decision: applyPatch relative path enforcement

**Context:** The TypeScript port must forbid absolute paths for apply_patch, unlike the Rust implementation that accepted them.

**Decision:** Added `resolvePatchPath` to normalise patch paths, reject absolute or escaping inputs, and ensure the resolved file stays under the provided `cwd`.

**Rationale:** Matches project guidance for relative-only semantics, prevents accidental edits outside the workspace, and keeps behaviour predictable across platforms.

**Alternatives Considered:**
- Allow absolute paths (Rust parity): violates the new security requirement for the port.
- Only check `path.isAbsolute` without guarding `..`: still allows directory traversal.

**Impact:** All executor operations now operate on safe, workspace-relative targets and tests assert the new error case so regressions will be caught.

### 2025-10-22 Decision: unified diff generator strategy

**Context:** Porting `unified_diff_from_chunks` required matching Rust's unified diff output without relying on the `similar` crate available there.

**Decision:** Implemented an in-house diff builder using an LCS matrix, SequenceMatcher-style opcodes, and a formatter that replicates GNU diff headers with a context radius of one.

**Rationale:** A custom implementation guarantees byte-for-byte parity with the Rust expectations and avoids the risk of third-party patch libraries producing mismatched headers or extra metadata.

**Alternatives Considered:**
- Use the `diff` npm package: produces additional file headers and context handling that diverged from Codex output.
- Shell out to `diff -u`: would complicate cross-platform support and slow down tests.

**Impact:** The new helper underpins both executor integration and future verification flows, and the added tests lock in the expected unified diff formatting.

### 2025-10-22 Decision: Tree-sitter integration for heredoc parsing

**Context:** Substep 6d required porting the heredoc extractor that relies on Tree-sitter Bash. The Rust implementation bundles the grammar; the TypeScript port needed an equivalent without compiling grammars at runtime.

**Decision:** Adopted `web-tree-sitter@0.25.10` together with the prebuilt grammars from `@vscode/tree-sitter-wasm`, loading both the core runtime and `tree-sitter-bash.wasm` lazily. Queries now use the new `Query` API instead of `Language::query`.

**Rationale:** Using Microsoft’s prebuilt WASM avoids introducing a Rust-based build step, keeps installs fast in the coding harness, and stays aligned with upstream Tree-sitter APIs that ship with TypeScript typings.

**Alternatives Considered:**
- Compiling `tree-sitter-bash` locally via the CLI: adds Rust/emscripten toolchain requirements and slows the developer loop.
- Depending on `tree-sitter` Node bindings: brings native compilation and platform-specific binaries that exceed project scope.

**Impact:** Heredoc parsing works in the Bun/Node runtime with zero extra build steps, and future grammars can reuse the same loader scaffolding.

### 2025-10-22 Decision: maybeParseApplyPatchVerified body handling deferred

**Context:** `maybe_parse_apply_patch_verified` in Rust returns detailed `ApplyPatchAction`s. For substep 6d we only needed implicit invocation errors, but the TypeScript port still needs the full action builder later in Feature 6.

**Decision:** Implemented the implicit invocation and error translation paths now, but left the successful body path unimplemented with an explicit throw and TODO, to be filled in alongside the upcoming seek_sequence and diff plumbing.

**Rationale:** The remaining work depends on seeker fuzziness and unified diff metadata that will evolve in substeps 6e and integration. Deferring avoids duplicating effort or baking in partial behaviour that would immediately change.

**Alternatives Considered:**
- Stub the body branch to return empty changes: risks masking missing functionality in later tests.
- Block substep 6d until the full verifier pipeline is ready: delays progress on the planned sequential build.

**Impact:** Current tests cover the required error paths while signalling unfinished work; later substeps must replace the throw with the full ApplyPatchAction implementation.

### 2025-10-22 Decision: seekSequence fuzzy matching passes

**Context:** The initial TypeScript stub only supported exact matches, but the Rust implementation performs multiple passes (exact, rstrip, trim, unicode normalisation) to tolerate formatting drift when applying hunks.

**Decision:** Implemented the same four-stage matcher in `seekSequence`, including the unicode punctuation/space normalisation table, while clamping the start index and preserving the EOF preference semantics from Rust.

**Rationale:** Tests rely on the relaxed matching to apply GPT-authored patches; without the extra passes we quickly fail to find contexts even when differing by whitespace. Mirroring Rust keeps behavioural parity and reduces future surprises.

**Alternatives Considered:**
- Keep strict exact matching: breaks numerous real patches and fails the ported tests.
- Use a third-party diff/sequence library: unnecessary overhead and harder to guarantee identical behaviour.

**Impact:** `computeReplacements` now benefits from the same fuzziness as Rust, enabling the new seek_sequence tests to pass and preventing spurious "Failed to find context" errors.

### 2025-10-22 Decision: maybeParseApplyPatchVerified action builder

**Context:** Substep 6d left the verified path unimplemented. We needed to return `ApplyPatchAction`s that match Rust, honour relative-path restrictions, and surface IO/compute errors with parity messages.

**Decision:** Added `buildApplyPatchAction` to resolve the effective cwd (respecting heredoc `cd`), reuse the executor's `resolvePatchPath` guard, and aggregate changes into a `Map` keyed by absolute paths. The helper derives diffs via the existing chunk pipeline and translates failures into `ApplyPatchError` variants (`io-error` and `compute-replacements`).

**Rationale:** Centralising the logic keeps `maybeParseApplyPatchVerified` small, reuses our hardened path resolution, and matches Rust's API contract while honouring the new relative-path constraint.

**Alternatives Considered:**
- Duplicate minimal logic inside `maybeParseApplyPatchVerified`: risk of divergence from executor behaviour.
- Revert to Rust's laxer path handling: breaks the previously recorded security decision.

**Impact:** Verified parsing now returns actionable diffs for tests and future agent integration, closing the TODO from substep 6d and aligning error reporting with the executor.
