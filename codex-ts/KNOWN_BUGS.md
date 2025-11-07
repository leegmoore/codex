# Known Bugs and Issues

**Status:** Tracking bugs for future fix pass
**Last Updated:** 2025-11-07

---

## Active Bugs

*None - All bugs fixed!* 🎉

---

## Fixed Bugs

### ✅ Bug #1: TypeScript generic constraint error in cache module (FIXED)
**Module:** `utils/cache`
**File:** `src/utils/cache/index.ts:17,38`
**Fixed:** 2025-11-07

**Original Issue:**
Type parameters `K` and `V` did not satisfy the constraint `{}` in LRU cache implementation.

**Original Error:**
```
src/utils/cache/index.ts(18,27): error TS2344: Type 'K' does not satisfy the constraint '{}'.
src/utils/cache/index.ts(29,31): error TS2344: Type 'K' does not satisfy the constraint '{}'.
```

**Fix:**
Added `extends {}` constraint to both generic type parameters `K` and `V` to match `lru-cache` library requirements.

**Changed:**
```typescript
// Before
export class LruCache<K, V> {

// After
export class LruCache<K extends {}, V extends {}> {
```

**Verification:**
- TypeScript compilation now succeeds with zero errors in cache module
- All 13 cache tests still passing (100%)

---

### ✅ Bug #2: ESLint configuration missing (FIXED)
**Module:** `codex-ts` (project-level)
**File:** `.eslintrc.json` (created)
**Fixed:** 2025-11-07

**Original Issue:**
No ESLint configuration file existed. Running `npm run lint` failed with "couldn't find a configuration file".

**Fix:**
Created `.eslintrc.json` with TypeScript-appropriate configuration:
- Uses `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`
- Extends recommended ESLint and TypeScript ESLint rulesets
- Configured to allow `_`-prefixed unused variables
- Enforces no `any` types
- Ignores node_modules, dist, and .js files

**Verification:**
- `npm run lint` now runs successfully
- ESLint processes all TypeScript files
- Code quality checks now active

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

- **Total Active:** 0 🎉
- **Total Fixed:** 2
- **By Severity:**
  - Critical: 0
  - High: 0
  - Medium: 0 (2 fixed)
  - Low: 0
- **By Phase:**
  - Phase 0 (pre-work): 0 (2 fixed)
  - Phase 1-5: 0
- **Last Bug Pass:** 2025-11-07 (after Phase 5 completion)
- **Next Bug Pass:** When 5+ bugs accumulated or before release
