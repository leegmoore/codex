# Phase 2.1 Checklist

## Setup
- [x] Read phase-2.1/source/design.md
- [x] Read LESSONS-LEARNED.md
- [x] Understand current config loading (cli/config.ts)

## Issue 1: Config Loading
- [x] Create normalizeApprovalPolicy() function
- [x] Create normalizeSandboxMode() function (implemented as normalizeSandboxPolicy)
- [x] Create normalizeReasoningEffort() function
- [x] Create normalizeSandboxPolicy() helper if needed
- [x] Update loadCliConfig() to call normalization functions
- [x] Apply approval_policy from config to core.approvalPolicy
- [x] Apply sandbox_policy from config to core.sandboxPolicy
- [x] Apply reasoning_effort from config to core.modelReasoningEffort
- [x] Apply reasoning_summary from config to core.modelReasoningSummary
- [x] Write unit test: approval_policy="never" loads correctly
- [x] Write unit test: approval_policy="on-request" loads correctly
- [x] Write unit test: invalid approval_policy throws error
- [x] Write unit test: sandbox_policy loads correctly
- [x] All config loading tests pass

## Issue 2: Duplicate Tool Display
- [x] Remove console.log from approval.ts line 10
- [x] Remove console.log from approval.ts line 11
- [x] Verify display.ts still shows tools (unchanged)
- [x] Test: Tool shown once, not twice

## Issue 3: Submission Logging
- [x] Remove console.debug("Submission:", sub) from core/codex/submission-loop.ts line 27 (made conditional on CODY_DEBUG)
- [x] Remove console.debug("Submission loop started") from core/codex/submission-loop.ts line 121 (made conditional on CODY_DEBUG)
- [x] Or make both conditional on CODY_DEBUG env var
- [x] Test: No submission dumps without DEBUG

## Issue 4: Path References
- [x] Update rollout.ts comments (~/.codex → ~/.cody)
- [x] Update message-history.ts comments (~/.codex → ~/.cody)
- [x] Search for other .codex references
- [x] Update all found references (updated in config.ts as well)

## Quality Verification
- [x] npm run format (clean)
- [x] npm run lint (0 errors, 35 pre-existing warnings)
- [x] npx tsc --noEmit (0 errors)
- [x] npm test (all pass, baseline maintained)

## Manual Testing
- [ ] Create ~/.cody/config.toml with approval_policy="never"
- [ ] Test: `cody chat "add 99 to README"` - no approval prompt
- [ ] Test: Tool executes automatically
- [ ] Test: No timeout errors
- [ ] Test: Output clean (<200 lines)
- [ ] Test: No duplicate tool displays
- [ ] Test: No "Submission:" dumps
- [ ] Update config to approval_policy="on-request"
- [ ] Test: Approval prompts DO appear
- [ ] Test: Can approve/deny successfully

## Documentation
- [x] Update decisions.md with changes
- [x] Document config loading enhancement
- [x] Note UX improvements
