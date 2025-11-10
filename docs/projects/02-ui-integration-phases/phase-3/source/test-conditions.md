# Phase 3: Test Conditions

**Test Frameworks:** 
- Vitest (mocked-service tests)
- Node.js scripts (model integration tests)

---

## Mocked-Service Tests

**File:** `tests/mocked-service/phase-3-provider-parity.test.ts`
**Mocks:** `tests/mocks/provider-clients.ts`, `tests/mocks/auth-manager.ts`

### Suite 1: Provider Parity

**Test 1: Responses API Works**
- **Setup:** Mock ResponsesClient returning assistant message, config provider=openai api=responses
- **Execute:** Create conversation, send message
- **Verify:** ResponseItems returned, ModelClient.sendMessage called, response structure valid

**Test 2: Chat API Works**
- **Setup:** Mock ChatClient, config provider=openai api=chat
- **Execute:** Create conversation, send message
- **Verify:** ChatClient used (spy on constructor or factory), response valid

**Test 3: Messages API Works**
- **Setup:** Mock MessagesClient, config provider=anthropic api=messages
- **Execute:** Create conversation, send message
- **Verify:** MessagesClient used, response valid

**Test 4: All Providers Return Compatible ResponseItems**
- **Setup:** Run same conversation on all three providers with mocked clients
- **Execute:** Send identical message to each
- **Verify:** Response structure consistent (all have type='message', role='assistant', content array)

### Suite 2: Configuration & Validation

**Test 5: Provider Switching Persists**
- **Setup:** Start with openai/responses
- **Execute:** Run CLI command `cody set-provider anthropic --api messages`, reload config
- **Verify:** Config updated, new conversation uses MessagesClient

**Test 6: Missing API Key Throws**
- **Setup:** AuthManager mock returns null for requested provider
- **Execute:** Attempt createConversation()
- **Verify:** Throws ConfigurationError with message "Missing API key for provider X"

**Test 7: Unsupported Combination Error**
- **Setup:** Config provider=anthropic api=chat (invalid combo)
- **Execute:** Attempt createConversation()
- **Verify:** Throws ConfigurationError with message "Unsupported provider/api combination"

**Test 8: Unknown Provider Error**
- **Setup:** Config provider=invalid
- **Execute:** Attempt createConversation()
- **Verify:** Throws ConfigurationError listing valid providers

### Suite 3: CLI Commands

**Test 9: list-providers Output**
- **Execute:** Run `cody list-providers`
- **Verify:** Output includes all valid combinations, current provider highlighted with arrow

**Test 10: set-provider Validation**
- **Execute:** Run `cody set-provider invalid-name`
- **Verify:** Error message, exit code 1, lists valid providers

**Test 11: set-api Validation**
- **Setup:** Current provider=anthropic
- **Execute:** Run `cody set-api chat`
- **Verify:** Error message "anthropic does not support chat", suggests valid APIs

---

## Model Integration Tests

**Location:** `scripts/integration-tests/phase-3/`
**Run via:** `npm run test:integration` or `node scripts/integration-tests/phase-3/run-all.ts`
**Requirements:** Real API keys in .env, network access

### Script 1: test-responses-api.ts

**Test:** OpenAI Responses API with gpt-4o-mini
- **Setup:** Real AuthManager with OPENAI_API_KEY, config api=responses
- **Execute:** Create conversation, send "Say hello in one sentence"
- **Verify:** Response received, no errors, response is coherent text
- **Log:** Response content, latency, token usage

### Script 2: test-chat-api.ts

**Test:** OpenAI Chat Completions with gpt-4o-mini
- **Setup:** Real AuthManager, config api=chat
- **Execute:** Create conversation, send "Say hello in one sentence"
- **Verify:** Response received, no errors, response is coherent
- **Log:** Response content, latency, token usage

### Script 3: test-messages-api.ts

**Test:** Anthropic Messages API with haiku-4.5
- **Setup:** Real AuthManager with ANTHROPIC_API_KEY, config api=messages
- **Execute:** Create conversation, send "Say hello in one sentence"
- **Verify:** Response received, no errors, response is coherent
- **Log:** Response content, latency, token usage

### Script 4: test-openrouter.ts

**Test:** OpenRouter with gemini-2.0-flash-001
- **Setup:** Real AuthManager with OPENROUTER_API_KEY, config provider=openai api=chat model=google/gemini-2.0-flash-001
- **Execute:** Create conversation, send "Say hello in one sentence"
- **Verify:** Response received via OpenRouter, Gemini model responds
- **Log:** Response content, latency, token usage

### Script 5: test-thinking-controls.ts

**Test:** Thinking mode with Responses and Messages APIs
- **Test 5a:** OpenAI Responses with thinking enabled
  - Config: api=responses, model=gpt-4o-mini, thinking={mode: 'enabled', budget: 5000}
  - Send: "Explain why the sky is blue"
  - Verify: Response includes reasoning blocks (check for reasoning content type)
  
- **Test 5b:** Anthropic Messages with thinking enabled
  - Config: api=messages, model=claude-3-haiku, thinking={mode: 'enabled', budget: 5000}
  - Send: "Explain why the sky is blue"
  - Verify: Response includes thinking blocks (check for thinking content type)

**Log:** Whether thinking blocks present, token usage difference

### Script 6: test-temperature.ts

**Test:** Temperature variation produces different outputs
- **Setup:** Same prompt, three temperatures (0.2, 0.7, 1.0)
- **Execute:** Send "Write a creative sentence about coding" with each temperature
- **Verify:** Responses differ (higher temp = more variation), all coherent
- **Log:** All three responses, compare creativity/variation

### Script 7: run-all.ts

**Test:** Execute all 6 scripts, collect results
- **Execute:** Run each script in sequence
- **Verify:** All pass (exit code 0)
- **Log:** Summary table (test name, status, errors if any)

**Expected runtime:** ~30 seconds total
**Expected cost:** ~$0.01-0.05 (cheap models, short prompts)

---

## Mock Strategy

**For mocked-service tests:**

**Mock provider clients:**
- createMockResponsesClient(responses: ResponseItems[][])
- createMockChatClient(responses: ResponseItems[][])
- createMockMessagesClient(responses: ResponseItems[][])
- Each returns mock with sendMessage spy

**Mock AuthManager:**
- createMockAuth(tokens: Record<string, string>)
- Returns token per provider
- Can configure to return null for negative tests

**Mock config file:**
- Use temp directory for CLI command tests
- Avoid touching real ~/.cody/config.toml during tests

**For model integration scripts:**
- No mocks (real API calls)
- Use real AuthManager, real clients
- Require API keys in environment

---

## Verification Checklist

**Automated tests pass:**
- [ ] Mocked-service tests: 11 tests in phase-3-provider-parity.test.ts
- [ ] All tests pass in <2 seconds
- [ ] No skipped tests

**Model integration pass:**
- [ ] test-responses-api.ts: ✓
- [ ] test-chat-api.ts: ✓
- [ ] test-messages-api.ts: ✓
- [ ] test-openrouter.ts: ✓
- [ ] test-thinking-controls.ts: ✓
- [ ] test-temperature.ts: ✓
- [ ] run-all.ts: 6/6 passing

**Quality gates:**
- [ ] TypeScript: 0 errors
- [ ] ESLint: 0 errors
- [ ] Format: no changes
- [ ] Combined: `npm run format && npm run lint && npx tsc --noEmit && npm test` succeeds

**Manual verification:**
- [ ] Follow manual-test-script.md (5 scenarios)
- [ ] All providers work in actual CLI usage

**Code review:**
- [ ] Stage 1 (Traditional): Provider logic, config handling, errors, UX
- [ ] Stage 2 (Port Validation): Abstraction preserved, adapters correct, integration results reviewed

---

**All checks ✓ → Phase 3 complete**
