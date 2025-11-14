# Phase 2.2 Verifier Feedback - Required Fixes

**Date:** 2025-01-14
**Status:** REJECTED → Fixes Required

## Critical Issues to Address

### 1. Remove "untrusted" from Valid Approval Policies

**Problem:** The `untrusted` policy is documented but not implemented. It falls through to the same behavior as `on-request`, which is incorrect.

**Decision:** Defer `untrusted` policy to a future phase that designs a comprehensive structured permission system.

**Required Changes:**

**File: `codex-ts/src/cli/config.ts`**
- Update `normalizeApprovalPolicy()` function:
  - Change valid values from `['never', 'on-failure', 'on-request', 'untrusted']`
  - To: `['never', 'on-failure', 'on-request']`
  - Update error message to reflect valid values
  - Add helpful message: "Note: 'untrusted' policy deferred to future release"

**File: `docs/projects/02-ui-integration-phases/phase-2.2/source/design.md`**
- Update Fix 1 section (lines 88-93) to remove `untrusted` from the list
- Add note: "Note: 'untrusted' policy (selective auto-approval based on tool risk) deferred to future phase requiring structured permission system design"

**File: `codex-ts/src/cli/config.test.ts`**
- Remove any tests for `approval_policy="untrusted"` if present
- Add test: `should throw error for unsupported "untrusted" policy with helpful message`

**File: `docs/projects/02-ui-integration-phases/phase-2.2/source/checklist.md`**
- Remove any checklist items related to implementing `untrusted` policy

### 2. Format Check Scope Clarification

**Problem:** Verifier ran `npm run format` at repo root, which flagged 9 files outside Phase 2.2 scope.

**Clarification:** Phase 2.2 scope is `codex-ts/` directory only. Files like `AGENTS.md`, `README.md`, `test-transcript-01.md` are not part of this phase.

**Required Action:**
- Run `npm run format` from `codex-ts/` directory only
- Only fix formatting for files you modified in Phase 2.2
- Document in completion notes: "Formatting verified for codex-ts/ directory only (phase scope)"

### 3. Document Deferred Items

**Problem:** Checklist has unchecked items for deferred work (Firecrawl, MCP, approval input echo) with no documentation.

**Required Changes:**

**File: `docs/projects/02-ui-integration-phases/phase-2.2/decisions.md`** (create if doesn't exist)

Add section:

```markdown
## Deferred Items

### Issue 9: fetchUrl Error Logging
- **Status:** Deferred to future phase
- **Rationale:** Low priority - fetchUrl works, just needs better diagnostics
- **Implementation:** Simple - add full Firecrawl response to error message
- **Effort:** 5 minutes

### Issue 10: readMcpResource Stub
- **Status:** Deferred to Phase 5 (MCP Implementation)
- **Rationale:** Full MCP support is Phase 5 work
- **Current State:** Throws "not yet implemented" - acceptable for now

### Issue 8: Approval Input Echo ('y' shows as 'yy')
- **Status:** Deferred - requires investigation
- **Rationale:** Low priority UX issue, doesn't affect functionality
- **Investigation needed:** Readline/stdin buffering configuration

### Untrusted Approval Policy
- **Status:** Deferred to future release
- **Rationale:** Requires comprehensive structured permission system design
- **Scope:** Selective auto-approval based on tool risk levels
- **Implementation:** Will be part of larger policy/permissions feature
```

**File: `docs/projects/02-ui-integration-phases/phase-2.2/source/checklist.md`**
- Check off deferred items with note: "(Deferred - see decisions.md)"

## Non-Critical Recommendations (Optional)

### Iteration Limit Verification

**Verifier Request:** Evidence that >6 tool chains now work.

**Response:** This will be verified during manual testing (post-verification). The change is trivial (one constant), and manual testing is the appropriate verification method for this.

**Optional:** Add a comment in session.ts near MAX_TOOL_ITERATIONS explaining the rationale:
```typescript
// Increased from 6 to 100 to support complex multi-tool workflows.
// The original limit was too conservative and blocked legitimate tasks.
// 100 provides safety against infinite loops while allowing real-world usage.
const MAX_TOOL_ITERATIONS = 100;
```

## Completion Checklist

- [ ] Remove `untrusted` from normalizeApprovalPolicy() valid values
- [ ] Update error message to list only supported policies
- [ ] Add helpful message about `untrusted` being deferred
- [ ] Update design.md to remove `untrusted` references
- [ ] Remove any `untrusted` tests, add rejection test
- [ ] Create decisions.md with deferred items section
- [ ] Update checklist.md to mark deferred items
- [ ] Run `npm run format` from codex-ts/ directory
- [ ] Run `npm run lint` (0 errors expected)
- [ ] Run `npx tsc --noEmit` (0 errors expected)
- [ ] Run `npm test` (all pass expected)
- [ ] Commit all changes
- [ ] Request re-verification

## Expected Outcome

After these fixes:
- All mechanical checks pass (format/lint/typecheck/tests)
- Config loading properly rejects `untrusted` with clear message
- Deferred items documented with rationale
- Phase 2.2 ready for manual testing with supported policies: `never`, `on-failure`, `on-request`
