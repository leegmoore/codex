# Phase 2.1 – UX Refinement & Config Loading Decisions

## Config Loading Enhancement

**Date:** December 2024

**Issue:** Configuration values (`approval_policy`, `sandbox_policy`, `model_reasoning_effort`, `model_reasoning_summary`) from `config.toml` were not being applied to the core config object, causing defaults to always be used regardless of user settings.

**Solution:** Added normalization functions to validate and convert config values, then applied them in `loadCliConfig()`.

### Implementation Details

1. **Normalization Functions:**
   - `normalizeApprovalPolicy()` - Validates and converts approval policy strings ("never", "on-request", "on-failure", "untrusted") to `AskForApproval` type
   - `normalizeSandboxPolicy()` - Validates and converts sandbox policy strings ("read-only", "full-access", "workspace-write") to `SandboxPolicy` type, supporting both string and object formats
   - `normalizeReasoningEffort()` - Validates reasoning effort values ("minimal", "low", "medium", "high") to `ReasoningEffort` enum
   - `normalizeReasoningSummary()` - Validates reasoning summary values ("auto", "concise", "detailed", "none") to `ReasoningSummary` enum

2. **Config Application:**
   - All normalization functions are called during `loadCliConfig()` after the core config is created
   - Values are only applied if they are defined in the config file (undefined values use defaults)
   - When `approval_policy` or `sandbox_policy` are set, `didUserSetCustomApprovalPolicyOrSandboxMode` flag is set to `true`

3. **Error Handling:**
   - Invalid values throw `ConfigurationError` with clear messages listing valid options
   - Error messages include the invalid value and all valid alternatives

### Testing

- Added comprehensive unit tests for all config value types
- Tests verify correct loading, default behavior, and error handling
- All tests pass (16 new tests added to `config.test.ts`)

### TOML Structure Note

Discovered that TOML parsers require top-level keys to appear **before** section headers. Keys placed after `[provider]` or `[auth]` sections are parsed as belonging to those sections. Updated all test TOML files to place config values at the top before any sections.

## Duplicate Tool Display Fix

**Issue:** Tool calls were being displayed twice - once in `approval.ts` via `console.log` and once in `display.ts`.

**Solution:** Removed the duplicate `console.log` statements from `approval.ts` (lines 10-11) that displayed tool name and arguments. The `display.ts` module continues to handle all tool display formatting, ensuring tools are shown exactly once.

## Submission Logging Cleanup

**Issue:** Debug logging in `submission-loop.ts` was always active, cluttering output even when not debugging.

**Solution:** Made `console.debug` statements conditional on `CODY_DEBUG` environment variable:
- Line 27: `console.debug("Submission:", sub)` now only runs if `process.env.CODY_DEBUG` is set
- Line 121: `console.debug("Submission loop started")` now only runs if `process.env.CODY_DEBUG` is set

This allows developers to enable verbose logging when needed without affecting normal user experience.

## Path Reference Updates

**Issue:** Documentation comments referenced `~/.codex` but the actual directory is `~/.cody`.

**Solution:** Updated all path references in comments:
- `rollout.ts`: Updated directory structure comments and JSDoc parameter descriptions
- `message-history.ts`: Updated file location comments
- `config.ts`: Updated interface documentation comments

All references now correctly point to `~/.cody` to match the actual implementation.

## ESLint Warnings

**Note:** The codebase has 35 pre-existing `@typescript-eslint/no-non-null-assertion` warnings in files not modified by this phase:
- `src/core/exec/engine.ts`
- `src/core/script-harness/parser.test.ts`
- `src/core/script-harness/runtime/script-cache.ts`
- `src/tools/integration.test.ts`
- And others

These warnings are not related to Phase 2.1 changes and should be addressed in a separate cleanup effort. All Phase 2.1 code follows ESLint rules with 0 errors.

## Files Modified

- `codex-ts/src/cli/config.ts` - Added normalization functions and config application logic
- `codex-ts/src/cli/config.test.ts` - Added comprehensive config loading tests
- `codex-ts/src/cli/approval.ts` - Removed duplicate console.log statements
- `codex-ts/src/core/codex/submission-loop.ts` - Made debug logging conditional
- `codex-ts/src/core/rollout.ts` - Updated path references in comments
- `codex-ts/src/core/message-history.ts` - Updated path references in comments
- `codex-ts/src/core/config.ts` - Updated path references in comments

## Verification

- ✅ All TypeScript type checks pass (0 errors)
- ✅ All tests pass (1929 tests, including 16 new config tests)
- ✅ Code formatting verified
- ✅ ESLint shows 0 errors (35 pre-existing warnings unrelated to this phase)

