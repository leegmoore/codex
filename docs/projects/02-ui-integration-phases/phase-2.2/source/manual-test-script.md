# Phase 2.2: Manual Test Script

## Preparation

**Create config:**
```bash
mkdir -p ~/.cody
cat > ~/.cody/config.toml << 'EOF'
model = "gpt-5-codex"
model_reasoning_effort = "low"
approval_policy = "never"
sandbox_policy = "full-access"
EOF
```

**Rebuild:**
```bash
cd /Users/leemoore/code/codex-port-02/codex-ts
npm run build
```

---

## Test 1: Auto-Approve Works (applyPatch & exec)

```bash
# Setup test file
echo "original content" > /tmp/test-phase22.txt

# Test exec tool
cody chat "run this command: cat /tmp/test-phase22.txt"
```

**What to observe:**
- ✓ Tool display: `🔧 Tool: exec`
- ✓ No "Approve? (y/n):" prompt
- ✓ Tool executes immediately
- ✓ Command output shown: "original content"
- ✓ Model confirms completion
- ✓ No timeout/crash

**Failure indicators:**
- ✗ Approval prompt appears
- ✗ CodexInternalAgentDiedError
- ✗ Timeout after 60s

```bash
# Test applyPatch tool
cody chat "add a line 'new line' to /tmp/test-phase22.txt using applyPatch"
```

**What to observe:**
- ✓ Tool display: `🔧 Tool: applyPatch`
- ✓ No approval prompt
- ✓ Patch applied successfully
- ✓ No timeout/crash

**Verify file modified:**
```bash
cat /tmp/test-phase22.txt
# Should show: original content + new line
```

---

## Test 2: Tool Iteration Limit Increased

```bash
cody chat "Read README.md, find all markdown links, check which files exist, list their sizes, then give me a summary"
```

**What to observe:**
- ✓ Model calls 10+ tools (readFile, grepFiles, fileSearch, listDir, etc.)
- ✓ No "Too many tool call iterations" error
- ✓ Task completes with summary
- ✓ All tool calls execute

**Failure indicators:**
- ✗ "Too many tool call iterations" error
- ✗ Task incomplete due to iteration limit

---

## Test 3: Perplexity Search Works

**Requires:** `PERPLEXITY_API_KEY` environment variable set

```bash
cody chat "use perplexity to research what GPT-5 capabilities were announced"
```

**What to observe:**
- ✓ Tool call: `perplexitySearch` (NOT `webSearch`)
- ✓ No "Invalid model" 400 error
- ✓ Returns reasoning-based response
- ✓ May include citations

**Failure indicators:**
- ✗ Perplexity API error (400)
- ✗ "Invalid model" message
- ✗ Tool named webSearch instead of perplexitySearch

---

## Test 4: No Duplicate Tool Display

```bash
cody chat "read /tmp/test-phase22.txt"
```

**What to observe:**
- ✓ Tool shown ONCE: `🔧 Tool: readFile`
- ✓ Tool not repeated in output
- ✓ Clean, non-redundant display

**Failure indicators:**
- ✗ Tool shown twice (once in approval, once in display)
- ✗ Redundant output

---

## Test 5: Manual Approval Still Works (When Configured)

**Update config:**
```bash
cat > ~/.cody/config.toml << 'EOF'
model = "gpt-5-codex"
approval_policy = "on-request"
EOF
```

**Rebuild and test:**
```bash
npm run build
cody chat "run command: ls /tmp"
```

**What to observe:**
- ✓ Approval prompt appears: "Approve? (y/n):"
- ✓ Type 'y' and press Enter
- ✓ Tool executes
- ✓ Result shown
- ✓ No crash

**Then test denial:**
```bash
cody chat "delete all files"
```

Type 'n' and verify:
- ✓ Tool NOT executed
- ✓ Model handles denial gracefully

---

## Test 6: Config Loading Works

**Verify config fields are loaded:**

Create config with all fields:
```bash
cat > ~/.cody/config.toml << 'EOF'
model = "gpt-5-codex"
approval_policy = "never"
sandbox_policy = "full-access"
model_reasoning_effort = "low"
model_reasoning_summary = true
EOF
```

**Rebuild:**
```bash
npm run build
```

**Test:**
```bash
cody chat "what is 2+2"
```

Check console output (or add temporary logging) to verify:
- ✓ Session configured with approval_policy="never"
- ✓ Sandbox policy applied
- ✓ Reasoning effort set to low
- ✓ No errors about invalid config values

---

## Success Checklist

- [ ] Test 1 passed (auto-approve works for exec and applyPatch)
- [ ] Test 2 passed (iteration limit allows 10+ tools)
- [ ] Test 3 passed (perplexitySearch uses valid model)
- [ ] Test 4 passed (no duplicate tool display)
- [ ] Test 5 passed (manual approval still works when configured)
- [ ] Test 6 passed (config fields loaded correctly)
- [ ] No CodexInternalAgentDiedError in any test
- [ ] No timeout errors
- [ ] UX improved (clean output, no duplicates)
