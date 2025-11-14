# Phase 2.2 Checklist

## Setup
- [ ] Read phase-2.2/source/design.md
- [ ] Read tool test report (context provided)
- [ ] Understand current config loading (cli/config.ts)
- [ ] Understand approval flow (session.ts, approval.ts)

## Issue 1: Config Loading (Prerequisite for Approval Fix)
- [ ] Create normalizeApprovalPolicy() function in cli/config.ts
- [ ] Create normalizeSandboxPolicy() function in cli/config.ts
- [ ] Create normalizeReasoningEffort() function in cli/config.ts
- [ ] Update loadCliConfig() to parse approval_policy from TOML
- [ ] Update loadCliConfig() to parse sandbox_policy from TOML
- [ ] Update loadCliConfig() to parse model_reasoning_effort from TOML
- [ ] Update loadCliConfig() to parse model_reasoning_summary from TOML
- [ ] Write unit test: approval_policy="never" loads correctly
- [ ] Write unit test: approval_policy="on-request" loads correctly
- [ ] Write unit test: invalid approval_policy throws error
- [ ] Write unit test: sandbox_policy loads correctly
- [ ] All config loading tests pass

## Issue 2: Approval Policy Enforcement (Critical - Unblocks applyPatch & exec)
- [ ] Read current executeFunctionCalls() implementation in session.ts
- [ ] Add policy check before tool execution
- [ ] Implement auto-approve logic for policy === 'never'
- [ ] Implement auto-approve with error escalation for policy === 'on-failure'
- [ ] Keep existing prompt behavior for policy === 'on-request'
- [ ] Handle policy === 'untrusted' (auto-approve safe operations only)
- [ ] Write test: approval_policy="never" executes tools without prompt
- [ ] Write test: approval_policy="on-request" prompts for approval
- [ ] Write test: applyPatch works with auto-approve
- [ ] Write test: exec works with auto-approve
- [ ] All approval policy tests pass

## Issue 3: Tool Iteration Limit
- [ ] Change MAX_TOOL_ITERATIONS from 6 to 100 in session.ts line 44
- [ ] Test with complex multi-tool task (verify >6 tools can execute)
- [ ] Verify error message still appears if 100 iterations exceeded

## Issue 4 & 5: Perplexity Tool Renaming
- [ ] Rename webSearch() → perplexitySearch() in tools/web/search.ts
- [ ] Update model: llama-3.1-sonar-small-128k-online → sonar-reasoning-pro
- [ ] Update function description to clarify it's reasoning-based search
- [ ] Update tool registration in tools/registry.ts (name: "perplexitySearch")
- [ ] Update tool description in registry
- [ ] Test perplexitySearch tool with valid model (no 400 error)

## Issue 6: New webSearch Tool
- [ ] Create tools/web/web-search.ts
- [ ] Implement webSearch() using Perplexity Search API endpoint
- [ ] Use sonar or sonar-pro model (not chat/completions endpoint)
- [ ] Return search results with URLs, titles, snippets
- [ ] Define tool schema (query, maxResults parameters)
- [ ] Register new webSearch tool in tools/registry.ts
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

## Issue 9: Firecrawl Dependency (Optional)
- [ ] Decide approach: mock / document / replace with free alternative
- [ ] If mock: Add development mode check and mock return
- [ ] If document: Add FIRECRAWL_API_KEY setup to docs
- [ ] If replace: Implement node-fetch + Readability.js alternative
- [ ] Test fetchUrl tool works with chosen approach

## Issue 10: readMcpResource Stub (Optional - Defer to Phase 5)
- [ ] Decide: stub with mock data OR leave as-is for Phase 5
- [ ] If stub: Replace throw with mock ReadResourceResult
- [ ] If defer: Document in decisions.md for Phase 5
- [ ] Test readMcpResource doesn't crash CLI

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
- [ ] Update decisions.md with changes
- [ ] Document approval policy implementation
- [ ] Document tool renaming (webSearch → perplexitySearch)
- [ ] Document new webSearch tool
- [ ] Note deferred items (Firecrawl, MCP)
