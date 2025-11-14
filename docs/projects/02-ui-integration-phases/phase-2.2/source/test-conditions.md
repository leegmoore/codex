# Phase 2.2: Test Conditions

## Test 1: Approval Policy Auto-Approve

**Functional:** Config with approval_policy="never" results in tools executing without prompts.

**Setup:**
- Create config.toml with approval_policy="never"
- Rebuild CLI

**Execute:**
- Run: `cody chat "create file /tmp/test-phase22.txt with content 'test'"`

**Verify:**
- No approval prompt appears
- exec or writeFile tool executes automatically
- File created at /tmp/test-phase22.txt
- No timeout or CodexInternalAgentDiedError

## Test 2: Approval Policy On-Request

**Functional:** Config with approval_policy="on-request" prompts for approval.

**Setup:**
- Update config.toml with approval_policy="on-request"
- Rebuild CLI

**Execute:**
- Run: `cody chat "run command: echo 'hello'"`

**Verify:**
- Approval prompt DOES appear
- Can type 'y' and tool executes
- Can type 'n' and tool is denied
- No timeout

## Test 3: Tool Iteration Limit Increased

**Functional:** Complex tasks requiring >6 tool calls complete successfully.

**Setup:**
- Config with approval_policy="never" (to avoid manual prompts)
- Rebuild with MAX_TOOL_ITERATIONS = 100

**Execute:**
- Run: `cody chat "read README.md, analyze its structure, list all links, check if those files exist, then summarize"`

**Verify:**
- Model calls 10+ tools
- No "Too many tool call iterations" error
- Task completes successfully

## Test 4: Perplexity Search Valid Model

**Functional:** perplexitySearch tool uses valid Sonar model.

**Setup:**
- Ensure PERPLEXITY_API_KEY is set

**Execute:**
- Run: `cody chat "use perplexity to find the latest AI news from this week"`

**Verify:**
- Tool calls perplexitySearch (not webSearch)
- No "Invalid model" 400 error from API
- Returns response with reasoning

## Test 5: No Duplicate Tool Display

**Functional:** Tools displayed only once in output.

**Setup:**
- Config with approval_policy="never"

**Execute:**
- Run: `cody chat "read /tmp/test-phase22.txt"`

**Verify:**
- Tool call shown ONCE in output
- Not displayed in both approval.ts and display.ts
- Clean, non-redundant output

## Test 6: ApplyPatch Works

**Functional:** applyPatch tool executes without timeout.

**Setup:**
- Create test file: `echo "line1" > /tmp/patch-test.txt`
- Config with approval_policy="never"

**Execute:**
- Run: `cody chat "add line2 after line1 in /tmp/patch-test.txt using applyPatch"`

**Verify:**
- applyPatch tool called
- No approval prompt (auto-approved)
- No timeout or CodexInternalAgentDiedError
- Patch applied successfully

## Test 7: Exec Works

**Functional:** exec tool executes without timeout.

**Setup:**
- Config with approval_policy="never"

**Execute:**
- Run: `cody chat "run command: ls -la /tmp | head -5"`

**Verify:**
- exec tool called
- No approval prompt (auto-approved)
- No timeout or CodexInternalAgentDiedError
- Command output displayed

## Test 8: Config Loading Complete

**Functional:** All config fields are loaded and applied.

**Setup:**
- Config with all fields:
```toml
model = "gpt-5-codex"
approval_policy = "never"
sandbox_policy = "full-access"
model_reasoning_effort = "low"
model_reasoning_summary = true
```

**Execute:**
- Load config via loadCliConfig()
- Check loaded Config object

**Verify:**
- core.approvalPolicy === "never"
- core.sandboxPolicy reflects full-access
- core.modelReasoningEffort === "low"
- core.modelReasoningSummary === true
