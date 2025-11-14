# Phase 2.2: Technical Design - Tool System Fixes & UX Refinements

**Phase:** Tool Integration Refinements (Critical Fixes)
**Goal:** Fix approval policy enforcement, increase tool iteration limit, rename/fix Perplexity integration, resolve UX issues

---

## Issues Discovered

### Critical Issues (Block Core Functionality)

**Issue 1: Approval Policy Not Enforced**
- **Problem:** Config has `approval_policy` setting but it's never consulted
- **Impact:** ALL tools with `requiresApproval: true` always prompt, even when policy = "never"
- **Consequence:** Non-interactive mode hangs waiting for approval → 60s timeout → CodexInternalAgentDiedError
- **Affected Tools:** `applyPatch`, `exec` (both unusable in current state)
- **Root Cause:**
  - `approval_policy` stored in session settings (line unknown in session.ts)
  - Never checked before calling `approvalCallback` in `executeFunctionCalls`
  - Runtime always wires `promptApproval` callback regardless of policy
- **Evidence:** Tool test report shows both tools timeout in non-interactive mode

**Issue 2: Tool Iteration Limit Too Low**
- **Problem:** `MAX_TOOL_ITERATIONS = 6` (session.ts line 44)
- **Impact:** Complex tasks requiring multiple tool calls fail with "Too many tool call iterations"
- **Example:** User request to modify file → model calls: listDir, readFile (2x), exec, grepFiles, fileSearch → hits limit before task complete
- **Root Cause:** Artificial ceiling meant to prevent infinite loops, but set too conservatively

**Issue 3: Config Loading Incomplete (Carryover from Phase 2.1)**
- **Problem:** `loadCliConfig()` only reads provider/auth, ignores `approval_policy` and other settings
- **Impact:** Issue #1 can't be fixed without this
- **Location:** `codex-ts/src/cli/config.ts` lines 58-67
- **Missing Fields:** approval_policy, sandbox_policy, model_reasoning_effort, model_reasoning_summary

### High Priority Issues (UX & Integration)

**Issue 4: Invalid Perplexity Model**
- **Problem:** `webSearch` tool uses deprecated model `llama-3.1-sonar-small-128k-online`
- **Impact:** All web searches fail with 400 "Invalid model" error
- **Current Model:** `llama-3.1-sonar-small-128k-online` (deprecated)
- **Valid Models (2025):** `sonar`, `sonar-pro`, `sonar-reasoning`, `sonar-reasoning-pro`
- **Location:** `codex-ts/src/tools/web/search.ts` line 97

**Issue 5: webSearch Naming Confusion**
- **Problem:** Tool named `webSearch` but actually calls Perplexity chat/completions API (reasoning model)
- **Impact:** Misleading name, doesn't do actual web search
- **Solution:** Rename to `perplexitySearch`, use `sonar-reasoning-pro` model

**Issue 6: No Actual Web Search Tool**
- **Problem:** No tool for actual web search (using Perplexity Search API endpoint)
- **Need:** New `webSearch` tool that uses proper search API, not chat completions

**Issue 7: Duplicate Tool Display**
- **Problem:** Tools displayed twice in output
- **Locations:**
  - `approval.ts` lines 10-11 (shows tool before approval prompt)
  - `display.ts` lines 14-15 (shows tool in event display)
- **Impact:** Cluttered output, user sees same tool call twice

**Issue 8: Approval Input Echo Bug**
- **Problem:** User types 'y', output shows 'yy'
- **Likely Cause:** Readline/stdin buffering issue
- **Location:** `codex-ts/src/cli/approval.ts` (readline configuration)

### Lower Priority Issues

**Issue 9: Firecrawl Dependency in fetchUrl**
- **Problem:** `fetchUrl` tool requires `FIRECRAWL_API_KEY` env var, fails without it
- **Impact:** Tool unusable in development without API key
- **Options:**
  - Mock implementation for development
  - Make API key required and document setup
  - Switch to free alternative
- **Location:** `codex-ts/src/tools/web/fetch.ts` lines 90-142

**Issue 10: readMcpResource Stubbed**
- **Problem:** Throws "not yet implemented" error
- **Impact:** MCP resource reading fails
- **Defer to:** Phase 5 (MCP implementation) or stub with mock data
- **Location:** `codex-ts/src/core/mcp/connection-manager.ts` lines 227-234

---

## Technical Design

### Fix 1: Enforce Approval Policy

**Goal:** Respect `approval_policy` config before prompting user

**Approval Policy Values:**
- `"never"` → Auto-approve all tools
- `"on-failure"` → Auto-approve all, escalate only on tool execution failure
- `"on-request"` → Prompt for approval (current behavior, default)
- `"untrusted"` → Auto-approve only safe/read-only operations

**Implementation:**

Location: `codex-ts/src/core/codex/session.ts` - `executeFunctionCalls()` method

Before calling `toolRouter.executeFunctionCalls()`, check policy:

```typescript
private async executeFunctionCalls(responseItems: ResponseItem[]): Promise<ResponseItem[]> {
  const policy = this._state.settings.approvalPolicy || 'on-request';

  // Extract function calls
  const functionCalls = responseItems.filter(item => item.type === 'function_call');

  // Auto-approve based on policy
  if (policy === 'never') {
    // Execute all without approval
    return await this.toolRouter.executeFunctionCalls(functionCalls);
  }

  if (policy === 'on-failure') {
    // Execute with auto-approve, only escalate on error
    // Implementation: try execution, catch errors, then prompt if failed
    try {
      return await this.toolRouter.executeFunctionCalls(functionCalls);
    } catch (error) {
      // Escalate to user on failure
      // Fall through to normal approval flow
    }
  }

  // 'on-request' or 'untrusted' - use existing approval flow
  return await this.toolRouter.executeFunctionCalls(functionCalls);
}
```

**Alternative Approach:** Modify `toolRouter.executeFunctionCalls()` to accept policy parameter

**Prerequisite:** Fix Issue #3 (config loading) first

### Fix 2: Increase Tool Iteration Limit

**Simple change:**

File: `codex-ts/src/core/codex/session.ts` line 44

```typescript
// Before:
const MAX_TOOL_ITERATIONS = 6;

// After:
const MAX_TOOL_ITERATIONS = 100;
```

**Rationale:** GPT-5-Codex is highly capable and rarely loops infinitely. The 6-iteration limit is too restrictive for complex tasks. 100 iterations provides safety net while allowing legitimate multi-tool workflows.

### Fix 3: Complete Config Loading

**Add parsing for missing fields:**

File: `codex-ts/src/cli/config.ts` - `loadCliConfig()` function

```typescript
// After line 67, add:

// Parse approval policy
if (cliConfig.approval_policy) {
  const policy = normalizeApprovalPolicy(cliConfig.approval_policy);
  core.approvalPolicy = policy;
}

// Parse sandbox policy
if (cliConfig.sandbox_policy) {
  core.sandboxPolicy = normalizeSandboxPolicy(cliConfig.sandbox_policy);
}

// Parse reasoning effort
if (cliConfig.model_reasoning_effort) {
  core.modelReasoningEffort = normalizeReasoningEffort(cliConfig.model_reasoning_effort);
}

// Parse reasoning summary
if (cliConfig.model_reasoning_summary !== undefined) {
  core.modelReasoningSummary = cliConfig.model_reasoning_summary;
}
```

**Helper functions to add:**

```typescript
function normalizeApprovalPolicy(value: string): AskForApproval {
  const valid: AskForApproval[] = ['never', 'on-failure', 'on-request', 'untrusted'];
  if (valid.includes(value as AskForApproval)) {
    return value as AskForApproval;
  }
  throw new ConfigurationError(
    `Invalid approval_policy: "${value}". Valid values: ${valid.join(', ')}`
  );
}

function normalizeSandboxPolicy(value: string): SandboxMode {
  // Similar validation for sandbox policy
}

function normalizeReasoningEffort(value: string): ReasoningEffort {
  const valid = ['low', 'medium', 'high'];
  if (valid.includes(value)) {
    return value as ReasoningEffort;
  }
  throw new ConfigurationError(
    `Invalid model_reasoning_effort: "${value}". Valid values: ${valid.join(', ')}`
  );
}
```

### Fix 4: Rename webSearch → perplexitySearch

**File:** `codex-ts/src/tools/web/search.ts`

**Changes:**
1. Rename function `webSearch` → `perplexitySearch`
2. Update model: `llama-3.1-sonar-small-128k-online` → `sonar-reasoning-pro`
3. Update description to clarify it's Perplexity reasoning, not generic web search

**File:** `codex-ts/src/tools/registry.ts`

**Changes:**
1. Update tool registration: `name: "webSearch"` → `name: "perplexitySearch"`
2. Update description: "Search the web using Perplexity API" → "Perform reasoning-based search using Perplexity Sonar Reasoning Pro"

### Fix 5: Create New webSearch Tool

**New file:** `codex-ts/src/tools/web/web-search.ts`

**Implementation:**
- Use Perplexity Search API endpoint (not chat/completions)
- Return actual search results (URLs, titles, snippets)
- Use `sonar` or `sonar-pro` model

**Register in:** `codex-ts/src/tools/registry.ts`

**Tool Schema:**
```typescript
{
  name: "webSearch",
  description: "Search the web and return ranked results with URLs, titles, and snippets",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      maxResults: { type: "number", description: "Maximum results to return (default: 10)" }
    },
    required: ["query"]
  }
}
```

### Fix 6: Remove Duplicate Tool Display

**File:** `codex-ts/src/cli/approval.ts`

Remove lines 10-11 (tool display in approval prompt):

```typescript
// DELETE these lines:
console.log(`🔧 Tool call: ${tool}`);
console.log(`   Args: ${JSON.stringify(args, null, 2)}`);
```

Keep only the approval question. Tool display should happen in `display.ts` event handler.

### Fix 7: Fix Approval Input Echo

**File:** `codex-ts/src/cli/approval.ts`

**Investigation needed:** Check readline configuration for echo settings

**Possible fix:**
```typescript
const rl = readline.createInterface({
  input,
  output,
  terminal: true,
  // Add these:
  prompt: '',
  removeHistoryDuplicates: true
});
```

Or use raw mode to prevent echo.

### Fix 8: Firecrawl Dependency (Decision Needed)

**Options:**

**A. Mock for Development:**
```typescript
if (!apiKey && process.env.NODE_ENV === 'development') {
  // Return mock HTML content
  return {
    url,
    html: '<html><body>Mock content</body></html>',
    markdown: 'Mock content',
    title: 'Mock Page'
  };
}
```

**B. Document Required Setup:**
- Add to README/docs that `FIRECRAWL_API_KEY` is required
- Provide setup instructions

**C. Switch to Free Alternative:**
- Use `node-fetch` + Readability.js for basic scraping
- No API key required

**Recommendation:** Option C (free alternative) for better developer experience

### Fix 9: Stub readMcpResource (Defer to Phase 5)

**Quick fix for Phase 2.2:**

```typescript
async readResource(serverName: string, uri: string): Promise<ReadResourceResult> {
  // Return mock data instead of throwing
  return {
    contents: [
      {
        uri,
        mimeType: 'text/plain',
        text: `Mock resource content for ${uri} from ${serverName}`
      }
    ]
  };
}
```

**Or:** Leave as-is and defer to Phase 5 when MCP is fully implemented

---

## Test Conditions

### Test 1: Approval Policy Auto-Approve

**Setup:**
```bash
cat > ~/.cody/config.toml << 'EOF'
model = "gpt-5-codex"
approval_policy = "never"
EOF
```

**Execute:**
```bash
cody chat "create a file /tmp/test.txt with content 'hello'"
```

**Verify:**
- No approval prompt appears
- File created successfully
- Tool executes automatically

### Test 2: Approval Policy On-Request

**Setup:**
```bash
cat > ~/.cody/config.toml << 'EOF'
model = "gpt-5-codex"
approval_policy = "on-request"
EOF
```

**Execute:**
```bash
cody chat "run ls -la"
```

**Verify:**
- Approval prompt DOES appear
- Can approve/deny
- Tool executes only after approval

### Test 3: Tool Iteration Limit Increased

**Execute:**
```bash
cody chat "read README.md, find all markdown links, list the files they reference, then summarize the structure"
```

**Verify:**
- Model can call 10+ tools without hitting limit
- No "Too many tool call iterations" error
- Task completes successfully

### Test 4: Perplexity Search Works

**Execute:**
```bash
cody chat "use perplexity to research the latest GPT models released in 2025"
```

**Verify:**
- Tool calls `perplexitySearch` (not `webSearch`)
- No "invalid model" error
- Returns reasoning-based response with citations

### Test 5: No Duplicate Tool Display

**Execute:**
```bash
cody chat "read /tmp/test.txt"
```

**Verify:**
- Tool displayed only ONCE in output
- Not shown in both approval prompt and event display

---

## Implementation Checklist

### Config & Approval (Critical Path)

- [ ] Add `normalizeApprovalPolicy()` helper function
- [ ] Add `normalizeSandboxPolicy()` helper function
- [ ] Add `normalizeReasoningEffort()` helper function
- [ ] Update `loadCliConfig()` to parse approval_policy from TOML
- [ ] Update `loadCliConfig()` to parse sandbox_policy from TOML
- [ ] Update `loadCliConfig()` to parse reasoning settings from TOML
- [ ] Modify `session.ts::executeFunctionCalls()` to check approval policy
- [ ] Implement auto-approve for `policy === 'never'`
- [ ] Implement auto-approve with error escalation for `policy === 'on-failure'`
- [ ] Test approval policy enforcement end-to-end

### Tool Iteration Limit

- [ ] Change `MAX_TOOL_ITERATIONS` from 6 to 100 in session.ts line 44
- [ ] Test with complex multi-tool task

### Perplexity Integration

- [ ] Rename `webSearch()` function → `perplexitySearch()` in web/search.ts
- [ ] Update model from `llama-3.1-sonar-small-128k-online` → `sonar-reasoning-pro`
- [ ] Update tool registration in registry.ts (name and description)
- [ ] Create new `web-search.ts` for actual web search
- [ ] Implement new `webSearch()` using Perplexity Search API
- [ ] Register new `webSearch` tool in registry
- [ ] Test both tools work independently

### UX Fixes

- [ ] Remove duplicate tool display from approval.ts lines 10-11
- [ ] Test tool shown only once
- [ ] Investigate and fix 'y' echoing as 'yy' in approval.ts
- [ ] Test approval input handling

### Optional Fixes

- [ ] Decide on Firecrawl approach (mock/document/replace)
- [ ] Implement chosen approach for fetchUrl
- [ ] Decide on readMcpResource (stub or defer)
- [ ] Implement chosen approach

### Quality Verification

- [ ] npm run format (clean)
- [ ] npm run lint (0 errors)
- [ ] npx tsc --noEmit (0 errors)
- [ ] npm test (all pass, baseline maintained)

### Manual Testing

- [ ] Test approval_policy="never" (auto-approve)
- [ ] Test approval_policy="on-request" (prompt)
- [ ] Test complex multi-tool task (>6 tools)
- [ ] Test perplexitySearch with valid model
- [ ] Test new webSearch tool
- [ ] Test no duplicate displays
- [ ] Test approval input (no double echo)

### Documentation

- [ ] Update decisions.md with all changes
- [ ] Document approval policy behavior
- [ ] Document tool renaming
- [ ] Note any deferred items (MCP, Firecrawl)
