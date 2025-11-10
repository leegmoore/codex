# Phase 3: Manual Test Script

**Goal:** Verify CLI can switch among OpenAI Responses, OpenAI Chat, and Anthropic Messages APIs and that all three providers work correctly with real models.

**Prerequisites:**
- Phase 2 complete and merged (tool execution working)
- API keys configured in .env or ~/.cody/config.toml
- CLI built and available: `npm run build`

---

## Setup

**1. Verify API keys available:**
```bash
# Check keys are set
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY

# Or verify in config
cat ~/.cody/config.toml
```

**2. Set baseline config:**
```bash
cody set-provider openai --api responses --model gpt-4o-mini
```

**3. Verify baseline:**
```bash
cody list-providers
# Should show → openai/responses as current
```

---

## Test 1: OpenAI Responses API

**Objective:** Verify Responses API works end-to-end

**Steps:**
1. Create new conversation:
   ```bash
   cody new
   ```
   **Expected:** Prints "Created conversation: conv_XXXXX"

2. Send message:
   ```bash
   cody chat "Summarize what Cody CLI does in one sentence"
   ```
   **Expected:** 
   - Response from GPT-4o-mini displayed
   - Response is coherent summary
   - No errors

3. Multi-turn test:
   ```bash
   cody chat "What did I just ask you?"
   ```
   **Expected:**
   - Model remembers previous message
   - Response references the summary question

**Success criteria:**
- [ ] Conversation created successfully
- [ ] Responses received and displayed
- [ ] Multi-turn context maintained
- [ ] No errors or crashes

---

## Test 2: OpenAI Chat Completions API

**Objective:** Verify Chat API works and switching is seamless

**Steps:**
1. Switch to Chat API:
   ```bash
   cody set-api chat
   ```
   **Expected:** Prints "✓ API set to chat"

2. Verify switch persisted:
   ```bash
   cody list-providers
   ```
   **Expected:** Shows → openai/chat as current

3. Create new conversation:
   ```bash
   cody new
   ```

4. Send message:
   ```bash
   cody chat "Explain the difference between Responses and Chat APIs in one sentence"
   ```
   **Expected:**
   - Response from Chat API (gpt-4o-mini)
   - Response explains API difference
   - CLI shows provider: openai (chat)

5. Verify conversation works:
   ```bash
   cody chat "Give me an example use case for each"
   ```
   **Expected:** Multi-turn context maintained

**Success criteria:**
- [ ] API switch successful
- [ ] New conversation uses Chat API
- [ ] Responses coherent
- [ ] No errors

---

## Test 3: Anthropic Messages API

**Objective:** Verify Messages API works and provider switching works

**Steps:**
1. Switch to Anthropic:
   ```bash
   cody set-provider anthropic --api messages --model claude-3-haiku
   ```
   **Expected:** Prints "✓ Provider set to anthropic (messages)"

2. Verify switch:
   ```bash
   cody list-providers
   ```
   **Expected:** Shows → anthropic/messages as current

3. Create conversation:
   ```bash
   cody new
   ```

4. Send message:
   ```bash
   cody chat "List three tools available in Cody CLI"
   ```
   **Expected:**
   - Response from Claude (haiku-4.5)
   - May trigger tool calls (readFile to check available tools)
   - If tool approval requested → approve
   - Response lists tools (exec, readFile, applyPatch, etc.)

5. Verify Claude style:
   ```bash
   cody chat "What's your name?"
   ```
   **Expected:** Response identifies as Claude (confirms Messages API used)

**Success criteria:**
- [ ] Provider switch successful
- [ ] Messages API works
- [ ] Tool calls work with Anthropic (if triggered)
- [ ] Responses are Claude-style
- [ ] No errors

---

## Test 4: Invalid Combination Handling

**Objective:** Verify error handling for unsupported provider/API combinations

**Steps:**
1. Attempt invalid combo:
   ```bash
   cody set-provider anthropic --api chat
   ```
   **Expected:**
   - Error message: "Provider 'anthropic' does not support API 'chat'"
   - Lists supported APIs: "Supported APIs for anthropic: messages"
   - Exit code 1

2. Verify config unchanged:
   ```bash
   cody list-providers
   ```
   **Expected:** Still shows previous valid config (anthropic/messages from Test 3)

3. Attempt another invalid combo:
   ```bash
   cody set-provider openai --api messages
   ```
   **Expected:**
   - Error message: "Provider 'openai' does not support API 'messages'"
   - Lists supported: "Supported APIs for openai: responses, chat"

**Success criteria:**
- [ ] Invalid combinations rejected
- [ ] Error messages helpful and actionable
- [ ] Config remains in valid state
- [ ] No crashes

---

## Test 5: Missing API Key Error Handling

**Objective:** Verify clear error when API key missing

**Steps:**
1. Temporarily remove Anthropic key:
   ```bash
   # Backup current config
   cp ~/.cody/config.toml ~/.cody/config.toml.backup
   
   # Edit config to remove anthropic_api_key
   # Or unset env var if using that
   ```

2. Attempt to use Anthropic:
   ```bash
   cody set-provider anthropic --api messages
   cody new
   ```
   **Expected:**
   - Error: "Missing API key for provider anthropic"
   - Suggests: "Set in config: [auth]\nanthropic_api_key = \"...\""
   - Or: "Run: cody set-auth api-key"

3. Restore config:
   ```bash
   mv ~/.cody/config.toml.backup ~/.cody/config.toml
   ```

**Success criteria:**
- [ ] Missing key detected
- [ ] Error message clear and actionable
- [ ] Suggests how to fix
- [ ] No crash or hang

---

## Test 6: Provider Parity Check

**Objective:** Verify same conversation works across all providers

**Steps:**
1. Test with each provider using same prompt:
   ```bash
   # OpenAI Responses
   cody set-provider openai --api responses
   cody new
   cody chat "What is 2+2?"
   # Record response
   
   # OpenAI Chat
   cody set-api chat
   cody new
   cody chat "What is 2+2?"
   # Record response
   
   # Anthropic Messages
   cody set-provider anthropic --api messages
   cody new
   cody chat "What is 2+2?"
   # Record response
   ```

2. Compare responses:
   - All should answer "4" (or equivalent)
   - All should be coherent
   - Format may differ slightly (provider style) but content equivalent

**Success criteria:**
- [ ] All three providers respond correctly
- [ ] Responses are equivalent in content
- [ ] No provider fails or errors
- [ ] Switching between providers seamless

---

## Success Checklist

**Functional verification:**
- [ ] OpenAI Responses API works
- [ ] OpenAI Chat API works
- [ ] Anthropic Messages API works
- [ ] Provider switching persists
- [ ] list-providers shows current selection
- [ ] Invalid combinations rejected gracefully
- [ ] Missing key errors are clear and actionable
- [ ] Provider parity confirmed (same conversation works on all)

**Quality verification:**
- [ ] All mocked-service tests passing (11 tests)
- [ ] All model integration scripts passing (6 scripts)
- [ ] TypeScript: 0 errors
- [ ] ESLint: 0 errors
- [ ] Format: clean
- [ ] Combined: All checks pass

**Code review:**
- [ ] Stage 1 complete (traditional review)
- [ ] Stage 2 complete (port validation)
- [ ] Critical issues addressed

---

**All checks ✓ → Phase 3 functional verification complete**

**Next:** Commit changes, update project logs, proceed to Phase 4
