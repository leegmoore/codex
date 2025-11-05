# Known Bugs and Issues

**Status:** Tracking bugs for future fix pass
**Last Updated:** 2025-11-05

---

## Active Bugs

### 🐛 Bug #1: TypeScript generic constraint error in cache module
**Module:** `utils/cache`
**File:** `src/utils/cache/index.ts:18,29`
**Severity:** Low (pre-existing from Phase 0)

**Description:**
Type parameter `K` does not satisfy the constraint `{}` in LRU cache implementation.

**Error:**
```
src/utils/cache/index.ts(18,27): error TS2344: Type 'K' does not satisfy the constraint '{}'.
src/utils/cache/index.ts(29,31): error TS2344: Type 'K' does not satisfy the constraint '{}'.
```

**Impact:**
TypeScript compilation fails with `tsc --noEmit`. Tests pass fine (Vitest doesn't use same strict checking).

**Notes:**
This was ported in Phase 0 before structured phases. Generic type constraints need adjustment.

**Priority:** Medium (blocks clean TypeScript compilation)

---

### 🐛 Bug #2: ESLint configuration missing
**Module:** `codex-ts` (project-level)
**File:** None (missing .eslintrc)
**Severity:** Low

**Description:**
No ESLint configuration file exists. Running `npm run lint` fails with "couldn't find a configuration file".

**Impact:**
Cannot run linting checks. No code quality enforcement beyond TypeScript compiler.

**Notes:**
Need to add `.eslintrc.json` with appropriate rules for TypeScript project. See `rich-ts` port for reference configuration.

**Priority:** Medium (needed for code quality standards)

---

## Fixed Bugs

*None yet*

---

## Bug Triage Guidelines

**Severity Levels:**
- **Critical:** Crashes, data loss, security issues, blocks all work
- **High:** Major functionality broken, many tests failing, blocks phase completion
- **Medium:** Incorrect behavior, minor functionality issues, compilation warnings
- **Low:** Edge cases, cosmetic issues, non-blocking warnings

**When to do bug pass:**
- 5+ bugs accumulated
- Critical/High severity bug found
- End of major phase (e.g., after Phase 5)
- Before release/merge to main

**Bug Pass Strategy:**
1. Sort bugs by severity
2. Fix Critical and High first
3. Address Medium if time permits
4. Document Low bugs for future consideration
5. Re-run full test suite after fixes
6. Update this file with "Fixed Bugs" section

---

## Reporting New Bugs

When you discover a bug:

1. **Add entry above** in "Active Bugs" section
2. **Include:**
   - Module name
   - File and line number
   - Severity level
   - Clear description
   - Expected vs actual behavior
   - Impact assessment
   - Priority level
3. **Don't fix immediately** unless Critical
4. **Continue with current work** - bug passes are scheduled
5. **Update bug count** in PORT_LOG_MASTER.md

---

## Bug Tracking Stats

- **Total Active:** 2
- **By Severity:**
  - Critical: 0
  - High: 0
  - Medium: 2
  - Low: 0
- **By Phase:**
  - Phase 0 (pre-work): 2
  - Phase 1: 0
  - Phase 2: 0
- **Next Bug Pass:** After Phase 5 or when 5+ bugs accumulated
