# Coder Completion Report - Standard Format

## Purpose

This document defines the mandatory completion report format that all coding agents must provide at the end of their work. This prevents vague summaries and ensures clear handoff to verification.

---

## Required Report Structure

Every coder must provide a completion report with ALL of the following sections:

### 1. COMPLETION STATUS

**Required:** Explicit yes/no statement for overall completion.

```markdown
## COMPLETION STATUS

✅ Phase [X] implementation COMPLETE
- All checklist items completed: YES/NO
- All quality gates passed: YES/NO
- Ready for verification: YES/NO
```

### 2. WORK COMPLETED

**Required:** List every major item implemented with file references.

```markdown
## WORK COMPLETED

### Feature 1: [Name]
- Implemented: [What was built]
- Files: [list with file:line references]
- Tests: [test files created/modified]

### Feature 2: [Name]
- Implemented: [What was built]
- Files: [list with file:line references]
- Tests: [test files created/modified]

[Continue for all features...]
```

### 3. QUALITY VERIFICATION RESULTS

**Required:** Actual command output, not just "passed."

```markdown
## QUALITY VERIFICATION

Ran from: [directory path]

### Format Check
```bash
npm run format
```
Result: ✅ PASS (no changes) / ❌ FAIL (X files need formatting)

### Lint Check
```bash
npm run lint
```
Result: ✅ PASS (0 errors, X warnings) / ❌ FAIL (X errors)

### Type Check
```bash
npx tsc --noEmit
```
Result: ✅ PASS (0 errors) / ❌ FAIL (X errors)

### Tests
```bash
npm test
```
Result: ✅ PASS (X/Y tests) / ❌ FAIL (X failing)

### Build
```bash
npm run build
```
Result: ✅ PASS / ❌ FAIL
```

**If any check failed:** Explain what's failing and why it's acceptable (or mark as incomplete).

### 4. ISSUES & PIVOTS

**Required:** Document ANY deviation from the original plan.

```markdown
## ISSUES ENCOUNTERED & RESOLUTIONS

### Issue 1: [Description]
- Problem: [What went wrong]
- Resolution: [How it was fixed]
- Impact: [Any scope/design changes]

[If no issues:]
No significant issues encountered. Implementation followed design as specified.
```

**Required:** Document ANY pivots or design changes.

```markdown
## PIVOTS FROM ORIGINAL DESIGN

### Pivot 1: [What changed]
- Original plan: [What was planned]
- Actual implementation: [What was done instead]
- Rationale: [Why the change]
- Impact: [Scope/timeline effects]

[If no pivots:]
No pivots. Implementation matches design document exactly.
```

### 5. DEFERRED ITEMS

**Required:** Explicitly list anything NOT completed.

```markdown
## DEFERRED ITEMS

[If everything completed:]
None. All planned items completed.

[If items deferred:]
### Item 1: [Name]
- Status: DEFERRED
- Rationale: [Why deferred - must be user-approved, not coder decision]
- Documented in: [decisions.md or other]
- Future work: [When/how this will be addressed]
```

### 6. FILES CHANGED

**Required:** Complete list of all file modifications.

```markdown
## FILES CHANGED

### Created
- path/to/new-file.ts (X lines)
- path/to/test-file.test.ts (Y lines)

### Modified
- path/to/existing-file.ts (added X lines, removed Y lines)
- path/to/config.ts (updated Z function)

### Deleted
- [none / list files]

**Total:** X files created, Y files modified, Z files deleted
```

### 7. TEST RESULTS

**Required:** Automated test results with counts.

```markdown
## TEST RESULTS

### Unit Tests
- Total: X tests
- Passing: X
- Failing: 0
- Skipped: 0

### Integration Tests (Mocked-Service)
- New tests added: X
- All passing: YES/NO
- Coverage: [What workflows are covered]

### Manual Testing Status
- [NOT RUN - will run after verification approval]
- [RUN - see evidence in [file/section]]
```

### 8. VERIFICATION READINESS

**Required:** Explicit checklist confirming ready state.

```markdown
## VERIFICATION READINESS

- [x] All checklist items completed
- [x] All quality gates passed (format/lint/type/test/build)
- [x] No failing tests
- [x] No console.debug or temporary code left in files
- [x] All files committed to git
- [x] decisions.md updated
- [x] checklist.md updated
- [ ] Manual testing NOT YET RUN (verifier will confirm, then manual testing)

**Status:** READY FOR VERIFICATION
```

---

## Anti-Patterns to Avoid

### ❌ Vague Summary
```
I completed the work. Everything looks good. Tests pass. Ready for review.
```

**Problem:** No details, no evidence, can't verify claims.

### ❌ Missing Quality Results
```
I ran the tests and they passed.
```

**Problem:** No command output, no test counts, can't verify.

### ❌ Hidden Pivots
```
I implemented the features using a slightly different approach.
```

**Problem:** What approach? Why? What's the impact?

### ❌ Unreported Deferrals
```
Most of the features are done.
```

**Problem:** What's not done? Why? Who approved deferring it?

---

## Enforcement

**Verifiers should:**
1. Check completion report exists and follows this format
2. Mark CONDITIONAL if report incomplete or vague
3. Require coder to provide properly formatted report before APPROVED

**Key principle:**
If you can't verify a claim because it's vague or missing evidence, it doesn't count as completed.

---

## Example Complete Report

See `docs/projects/02-ui-integration-phases/BUG-FIX-VERIFICATION-REPORT.md` for a good example of detailed reporting.

---

## Integration with Coder Prompts

Add this section to all coder prompts BEFORE the final checklist:

```
---

COMPLETION REPORT REQUIREMENTS:

When you complete all work, provide a structured completion report following this format:

1. COMPLETION STATUS - Explicit yes/no for completion and verification readiness
2. WORK COMPLETED - List all features with file:line references
3. QUALITY VERIFICATION RESULTS - Actual command outputs for format/lint/type/test/build
4. ISSUES & PIVOTS - Document any problems or plan deviations
5. DEFERRED ITEMS - Explicit list (none or detailed with rationale)
6. FILES CHANGED - Complete list of created/modified/deleted files
7. TEST RESULTS - Counts and status for all test types
8. VERIFICATION READINESS - Checklist confirming ready state

See docs/core/coder-completion-report-format.md for detailed format.

DO NOT provide vague summaries. Verifier needs concrete evidence to approve your work.

---
```

This should be added to the FINAL QUALITY CHECK or BEFORE ENDING SESSION section of coder prompts.
