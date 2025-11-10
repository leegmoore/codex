# Phase 3: Multi-Provider Support – Task Checklist

**Status:** Not Started
**Estimated Code:** ~660 lines (CLI 110, factory 60, mocked tests 180, integration scripts 310)

---

## Setup & Planning

- [ ] Review Phase 2 implementation (ensure tool execution works)
- [ ] Read TECH-APPROACH Section 4 (Phase 3 technical approach)
- [ ] Read phase-3/source/design.md (implementation details)
- [ ] Inspect ported client implementations:
  - [ ] ResponsesClient: `codex-ts/src/core/client/responses/client.ts`
  - [ ] ChatClient: `codex-ts/src/core/client/chat/` or `chat-completions/`
  - [ ] MessagesClient: `codex-ts/src/core/client/messages/adapter.ts`

---

## Core: ModelClient Factory

- [ ] Create factory method in ConversationManager (or separate module)
- [ ] Implement provider switching logic:
  - [ ] Switch on config.provider ('openai' | 'anthropic')
  - [ ] Switch on config.api ('responses' | 'chat' | 'messages')
  - [ ] Construct appropriate client with apiKey + model
- [ ] Error handling:
  - [ ] Missing API key → ConfigurationError with helpful message
  - [ ] Unsupported combination → ConfigurationError listing valid options
  - [ ] Unknown provider → ConfigurationError listing valid providers
- [ ] Verify factory returns ModelClient interface (type-safe)
- [ ] Document factory location decision in DECISIONS.md

---

## Config System Updates

- [ ] Extend ConversationConfig type:
  - [ ] Add provider: 'openai' | 'anthropic'
  - [ ] Add api: 'responses' | 'chat' | 'messages'
  - [ ] Keep model: string
- [ ] Update config loader to read provider fields from TOML
- [ ] Update config writer to save provider fields
- [ ] Add validation:
  - [ ] Validate provider/API combination at save time
  - [ ] Validate again at conversation creation (safety check)
- [ ] Set defaults when fields missing:
  - [ ] Default provider: openai
  - [ ] Default API: responses (for openai), messages (for anthropic)
  - [ ] Default model: gpt-4 (for openai), claude-3-haiku (for anthropic)
- [ ] Document defaults in DECISIONS.md

---

## CLI Commands

### set-provider Command

- [ ] Create `src/cli/commands/set-provider.ts`
- [ ] Implement command:
  - [ ] Accept provider argument (openai, anthropic)
  - [ ] Accept --api flag (optional)
  - [ ] Accept --model flag (optional)
- [ ] Validation:
  - [ ] Check provider is valid
  - [ ] Check API is valid for provider
  - [ ] Helpful error messages for invalid inputs
- [ ] Config update:
  - [ ] Load current config
  - [ ] Update provider fields
  - [ ] Save to file
- [ ] Output:
  - [ ] Print confirmation: "✓ Provider set to X (Y)"
  - [ ] Show model being used

### set-api Command

- [ ] Create `src/cli/commands/set-api.ts`
- [ ] Implement command:
  - [ ] Accept api argument (responses, chat, messages)
  - [ ] Update current provider's API type
- [ ] Validation:
  - [ ] Check API valid for current provider
  - [ ] Error if unsupported combination
- [ ] Save and confirm

### list-providers Command

- [ ] Create `src/cli/commands/list-providers.ts`
- [ ] Implement command:
  - [ ] Show all valid provider/API combinations
  - [ ] Highlight current selection with arrow (→)
  - [ ] Show example models for each combo
- [ ] Format output:
  - [ ] Clear visual hierarchy
  - [ ] Current selection obvious
  - [ ] Helpful for user deciding what to switch to

---

## Mocked-Service Tests (TDD)

- [ ] Create `tests/mocked-service/phase-3-provider-parity.test.ts`
- [ ] Create mock implementations:
  - [ ] tests/mocks/provider-clients.ts (createMockResponsesClient, createMockChatClient, createMockMessagesClient)
  - [ ] tests/mocks/auth-manager.ts (createMockAuth)

### Provider Parity Suite

- [ ] Test 1: Responses API works (mock ResponsesClient, verify conversation flow)
- [ ] Test 2: Chat API works (mock ChatClient, verify conversation flow)
- [ ] Test 3: Messages API works (mock MessagesClient, verify conversation flow)
- [ ] Test 4: All providers return compatible ResponseItems (structure parity check)

### Configuration Suite

- [ ] Test 5: Provider switching persists (CLI command updates config, new conversation uses new provider)
- [ ] Test 6: Missing API key throws (AuthManager returns null, expect ConfigurationError)
- [ ] Test 7: Unsupported combination error (anthropic + chat → error)
- [ ] Test 8: Unknown provider error (invalid provider name → error)

### CLI Commands Suite

- [ ] Test 9: list-providers shows all options (capture stdout, verify output)
- [ ] Test 10: set-provider validation (invalid provider → error message)
- [ ] Test 11: set-api validation (unsupported API for provider → error message)

- [ ] All 11 tests passing
- [ ] Tests run fast (<2 seconds)
- [ ] No skipped tests

---

## Model Integration Scripts

**Location:** `scripts/integration-tests/phase-3/`
**Purpose:** Validate real provider behavior with actual API calls

### Script Setup

- [ ] Create directory: `scripts/integration-tests/phase-3/`
- [ ] Ensure .env has API keys:
  - [ ] OPENAI_API_KEY
  - [ ] ANTHROPIC_API_KEY
  - [ ] OPENROUTER_API_KEY
- [ ] Add npm script: `"test:integration": "node scripts/integration-tests/phase-3/run-all.ts"`

### Individual Scripts

- [ ] **test-responses-api.ts** (OpenAI Responses, gpt-4o-mini)
  - [ ] Create conversation with real ResponsesClient
  - [ ] Send test message: "Say hello in one sentence"
  - [ ] Verify response received, log content and latency
  - [ ] Exit 0 on success, 1 on failure

- [ ] **test-chat-api.ts** (OpenAI Chat, gpt-4o-mini)
  - [ ] Create conversation with real ChatClient
  - [ ] Send test message
  - [ ] Verify response, log results

- [ ] **test-messages-api.ts** (Anthropic Messages, haiku-4.5)
  - [ ] Create conversation with real MessagesClient
  - [ ] Send test message
  - [ ] Verify response, log results

- [ ] **test-openrouter.ts** (OpenRouter, gemini-2.0-flash-001)
  - [ ] Create conversation via OpenRouter
  - [ ] Model: google/gemini-2.0-flash-001
  - [ ] Send test message
  - [ ] Verify Gemini responds via OpenRouter

- [ ] **test-thinking-controls.ts** (Thinking mode)
  - [ ] Test 5a: Responses API with thinking enabled
    - [ ] Config: thinking={mode: 'enabled', budget: 5000}
    - [ ] Send: "Explain why the sky is blue"
    - [ ] Verify: Response includes reasoning blocks
  - [ ] Test 5b: Messages API with thinking enabled
    - [ ] Config: thinking={mode: 'enabled', budget: 5000}
    - [ ] Send: "Explain why the sky is blue"
    - [ ] Verify: Response includes thinking blocks
  - [ ] Log: Token usage with/without thinking

- [ ] **test-temperature.ts** (Temperature variation)
  - [ ] Send same prompt with temp=0.2, 0.7, 1.0
  - [ ] Prompt: "Write a creative sentence about coding"
  - [ ] Verify: Responses differ (higher temp = more variation)
  - [ ] Log: All three responses for comparison

- [ ] **run-all.ts** (Execute suite)
  - [ ] Import all 6 test scripts
  - [ ] Run in sequence
  - [ ] Catch errors, collect results
  - [ ] Print summary table (test name, status, errors)
  - [ ] Exit 0 if all pass, 1 if any fail

### Integration Test Execution

- [ ] Run: `npm run test:integration`
- [ ] Verify: All 6 scripts pass
- [ ] Review: Any provider-specific quirks or issues
- [ ] Document: Note findings in DECISIONS.md
- [ ] Cost check: Should be ~$0.01-0.05 total

---

## Quality Gates

### Code Quality

- [ ] Run: `npm run format`
- [ ] Verify: No file changes (already formatted)
- [ ] Run: `npm run lint`
- [ ] Verify: 0 errors (warnings acceptable)
- [ ] Run: `npx tsc --noEmit`
- [ ] Verify: 0 TypeScript errors

### Testing

- [ ] Run: `npm test`
- [ ] Verify: All tests passing (1,876+ baseline + 11 new mocked-service tests)
- [ ] Verify: 0 skipped tests
- [ ] Run: `npm run test:integration`
- [ ] Verify: All 6 integration scripts pass
- [ ] Review: Integration test logs for issues

### Combined Verification

- [ ] Run: `npm run format && npm run lint && npx tsc --noEmit && npm test`
- [ ] Verify: All commands succeed in sequence
- [ ] Screenshot or save output for verification

---

## Manual Verification

- [ ] Follow `manual-test-script.md` (5 test scenarios)
- [ ] Test 1: OpenAI Responses works
- [ ] Test 2: OpenAI Chat works
- [ ] Test 3: Anthropic Messages works
- [ ] Test 4: Invalid combination handled
- [ ] Test 5: Missing key error is clear
- [ ] All manual tests ✓

---

## Code Review

### Stage 1: Traditional Review

- [ ] Run GPT-5-Codex /review with instructions from `prompts/CODEX-REVIEW.txt`
- [ ] Review focus:
  - [ ] Provider switching logic correct
  - [ ] Config handling safe (atomic writes, validation)
  - [ ] Error messages helpful and actionable
  - [ ] CLI UX clear (list-providers output, confirmation messages)
  - [ ] Factory pattern clean (no tight coupling)
- [ ] Address critical issues
- [ ] Document major/minor issues for Phase 7 or future work

### Stage 2: Port Validation Review

- [ ] Verify provider abstraction preserved (WireApi pattern maintained)
- [ ] Verify adapter patterns correct (clients normalize to ResponseItems)
- [ ] Review model integration results:
  - [ ] All providers work with real APIs
  - [ ] Config parameters work (thinking, temperature)
  - [ ] Any provider-specific quirks documented
- [ ] Address critical issues
- [ ] Document findings

---

## Documentation

- [ ] Update DECISIONS.md:
  - [ ] Default API per provider
  - [ ] Factory location (ConversationManager method vs separate module)
  - [ ] Client reuse strategy (fresh per conversation vs shared)
  - [ ] Config validation timing (save time vs creation time)
  - [ ] Model name validation approach (allow any vs validate against known)
  - [ ] Any provider-specific quirks discovered
- [ ] Update checklist (mark completed items)
- [ ] Verify phase ready for next phase

---

## Final Verification

- [ ] All tasks above completed
- [ ] All tests passing (mocked + integration)
- [ ] All quality gates passed
- [ ] Manual verification complete
- [ ] Code review complete (both stages)
- [ ] Documentation updated
- [ ] Ready to commit and move to Phase 4

---

**Phase 3 complete when all items checked ✓**
