# Phase 2.2 Implementation Decisions

## Date
2025-01-14

## Critical Fixes Implemented

### 1. Config Loading Enhancement
- Added parsing for `approval_policy`, `sandbox_policy`, `model_reasoning_effort`, `model_reasoning_summary`
- Created normalization helpers with validation and error messaging
- All config fields now load from `~/.cody/config.toml`

### 2. Approval Policy Enforcement
- Implemented `never` (auto-approve all tool calls)
- Implemented `on-failure` (auto-approve until a tool reports `success === false`, then escalate to prompts)
- Maintained existing `on-request` behavior (prompt for approval)
- **Deferred:** `untrusted` policy (see Deferred Items)

### 3. Tool Iteration Limit
- Increased from 6 → 100 iterations
- Allows complex multi-tool workflows to finish while still guarding against runaway loops

### 4. Perplexity Integration
- Renamed reasoning helper to `perplexitySearch`
- Updated model to `sonar-reasoning-pro`
- Added new `webSearch` tool using Perplexity Search API that returns URL/title/snippet results

### 5. UX Improvements
- Removed duplicate tool display from `approval.ts`
- Tool events now render once via `display.ts`

## Deferred Items

### Untrusted Approval Policy
- **Status:** Deferred to future release
- **Rationale:** Requires structured permission tiers so the agent can auto-approve read-only tools while prompting for write/exec
- **Action:** Removed from allowed config values; error message points to future release

### Issue 9: fetchUrl Error Logging
- **Status:** Deferred (low priority)
- **Rationale:** fetchUrl succeeds today; additional logging is nice-to-have
- **Plan:** Enhance error message with Firecrawl response payload (tracked for later)

### Issue 10: readMcpResource Stub
- **Status:** Deferred to Phase 5
- **Rationale:** Full MCP support lands in that phase; current stub acceptable

### Issue 8: Approval Input Echo Bug
- **Status:** Deferred pending deeper readline investigation
- **Rationale:** Minor UX issue; functionality unaffected

## Test Coverage
- Config loading: unit tests cover valid/invalid policies, sandbox, reasoning settings
- Approval policy: mocked-service tests for `never`, `on-failure`, `on-request`
- Perplexity tools: unit tests for both `perplexitySearch` and `webSearch`
- Regression: 1,938 total tests passing

## Manual Testing Required
To be run before user sign-off:
1. `approval_policy="never"` auto-approves (exec + applyPatch)
2. `approval_policy="on-request"` prompts and handles approve/deny
3. Complex multi-tool task (>6 calls) succeeds
4. `perplexitySearch` uses `sonar-reasoning-pro` without 400 errors
5. `webSearch` returns ranked search results
6. Tool displayed only once in CLI output

