# Phase 2.2 Checklist

## Setup
- [x] Read phase-2.2/source/design.md
- [x] Read tool test report (context provided)
- [x] Understand current config loading (cli/config.ts)
- [x] Understand approval flow (session.ts, approval.ts)

## Issue 1: Config Loading (Prerequisite for Approval Fix)
- [x] Create normalizeApprovalPolicy() function in cli/config.ts
- [x] Create normalizeSandboxPolicy() function in cli/config.ts
- [x] Create normalizeReasoningEffort() function in cli/config.ts
- [x] Update loadCliConfig() to parse approval_policy from TOML
- [x] Update loadCliConfig() to parse sandbox_policy from TOML
- [x] Update loadCliConfig() to parse model_reasoning_effort from TOML
- [x] Update loadCliConfig() to parse model_reasoning_summary from TOML
- [x] Write unit test: approval_policy="never" loads correctly
- [x] Write unit test: approval_policy="on-request" loads correctly
- [x] Write unit test: invalid approval_policy throws error
- [x] Write unit test: sandbox_policy loads correctly
- [x] All config loading tests pass

## Issue 2: Approval Policy Enforcement (Critical - Unblocks applyPatch & exec)
- [x] Read current executeFunctionCalls() implementation in session.ts
- [x] Add policy check before tool execution
- [x] Implement auto-approve logic for policy === 'never'
- [x] Implement auto-approve with error escalation for policy === 'on-failure'
- [x] Keep existing prompt behavior for policy === 'on-request'
- [ ] Handle policy === 'untrusted' (auto-approve safe operations only)
- [x] Write test: approval_policy="never" executes tools without prompt
- [x] Write test: approval_policy="on-request" prompts for approval
- [x] Write test: applyPatch works with auto-approve
- [x] Write test: exec works with auto-approve
- [x] All approval policy tests pass

## Issue 3: Tool Iteration Limit
- [x] Change MAX_TOOL_ITERATIONS from 6 to 100 in session.ts line 44
- [ ] Test with complex multi-tool task (verify >6 tools can execute)
- [ ] Verify error message still appears if 100 iterations exceeded

## Issue 4 & 5: Perplexity Tool Renaming
- [x] Rename webSearch() → perplexitySearch() in tools/web/search.ts
- [x] Update model: llama-3.1-sonar-small-128k-online → sonar-reasoning-pro
- [x] Update function description to clarify it's reasoning-based search
- [x] Update tool registration in tools/registry.ts (name: "perplexitySearch")
- [x] Update tool description in registry
- [ ] Test perplexitySearch tool with valid model (no 400 error)

## Issue 6: New webSearch Tool
- [x] Create tools/web/web-search.ts
- [x] Implement webSearch() using Perplexity Search API endpoint
- [x] Use sonar or sonar-pro model (not chat/completions endpoint)
- [x] Return search results with URLs, titles, snippets
- [x] Define tool schema (query, maxResults parameters)
- [x] Register new webSearch tool in tools/registry.ts
- [ ] Test new webSearch returns actual search results

## Issue 7: Duplicate Tool Display
- [ ] Remove console.log from approval.ts line 10 (tool call display)
- [ ] Remove console.log from approval.ts line 11 (args display)
- [ ] Verify display.ts still shows tools (unchanged)
- [ ] Test: Tool shown once, not twice

## Issue 8: Approval Input Echo Bug
- [ ] Investigate readline configuration in approval.ts
- [ ] Test current behavior (y appears as yy)
- [ ] Try fixing with readline options (prompt, removeHistoryDuplicates)
- [ ] Or try raw mode to prevent echo
- [ ] Test: Single 'y' input doesn't echo twice

## Issue 9: fetchUrl Error Logging (Optional - Low Priority)
- [x] Deferred - see decisions.md

## Issue 10: readMcpResource Stub (Optional - Defer to Phase 5)
- [x] Deferred to Phase 5 - see decisions.md

## Quality Verification
- [ ] npm run format (clean)
- [ ] npm run lint (0 errors)
- [ ] npx tsc --noEmit (0 errors)
- [ ] npm test (all pass, baseline maintained)

## Manual Testing
- [ ] Create ~/.cody/config.toml with approval_policy="never"
- [ ] Test: `cody chat "create file /tmp/test.txt"` - no approval prompt
- [ ] Test: applyPatch executes automatically (no timeout)
- [ ] Test: exec command runs automatically (no timeout)
- [ ] Update config to approval_policy="on-request"
- [ ] Test: Approval prompts DO appear
- [ ] Test: Can approve/deny successfully
- [ ] Test: `cody chat "complex task needing 10+ tools"` - no iteration limit error
- [ ] Test: perplexitySearch works (no invalid model error)
- [ ] Test: webSearch returns actual search results
- [ ] Test: Tool displayed only once (not duplicate)
- [ ] Test: Typing 'y' doesn't echo as 'yy'

## Documentation
- [x] Update decisions.md with changes
- [x] Document approval policy implementation
- [x] Document tool renaming (webSearch → perplexitySearch)
- [x] Document new webSearch tool
- [x] Note deferred items (Firecrawl, MCP, untrusted policy)
