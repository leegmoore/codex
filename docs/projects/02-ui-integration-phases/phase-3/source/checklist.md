# Phase 3: Multi-Provider Support – Task Checklist

**Status:** In Progress
**Estimated Code:** ~660 lines (CLI 110, factory 60, mocked tests 180, integration scripts 310)

---

## Setup & Planning

- [x] Review Phase 2 implementation (ensure tool execution works)
- [x] Read TECH-APPROACH Section 4 (Phase 3 technical approach)
- [x] Read phase-3/source/design.md (implementation details)
- [x] Inspect ported client implementations:
  - [x] ResponsesClient: `codex-ts/src/core/client/responses/client.ts`
  - [x] ChatClient: `codex-ts/src/core/client/chat/` or `chat-completions/`
  - [x] MessagesClient: `codex-ts/src/core/client/messages/adapter.ts`

---

## Core: ModelClient Factory

- [x] Create factory method in ConversationManager (or separate module)
- [x] Implement provider switching logic:
  - [x] Switch on config.provider ('openai' | 'anthropic')
  - [x] Switch on config.api ('responses' | 'chat' | 'messages')
  - [x] Construct appropriate client with apiKey + model
- [x] Error handling:
  - [x] Missing API key → ConfigurationError with helpful message
  - [x] Unsupported combination → ConfigurationError listing valid options
  - [x] Unknown provider → ConfigurationError listing valid providers
- [x] Verify factory returns ModelClient interface (type-safe)
- [x] Document factory location decision in DECISIONS.md

---

## Config System Updates

- [x] Extend ConversationConfig type:
  - [x] Add provider: 'openai' | 'anthropic'
  - [x] Add api: 'responses' | 'chat' | 'messages'
  - [x] Keep model: string
- [x] Update config loader to read provider fields from TOML
- [x] Update config writer to save provider fields
- [x] Add validation:
  - [x] Validate provider/API combination at save time
  - [x] Validate again at conversation creation (safety check)
- [x] Set defaults when fields missing:
  - [x] Default provider: openai
  - [x] Default API: responses (for openai), messages (for anthropic)
  - [x] Default model: gpt-4 (for openai), claude-3-haiku (for anthropic)
- [x] Document defaults in DECISIONS.md

---

## CLI Commands

### set-provider Command

- [x] Create `src/cli/commands/set-provider.ts`
- [x] Implement command:
  - [x] Accept provider argument (openai, anthropic)
  - [x] Accept --api flag (optional)
  - [x] Accept --model flag (optional)
- [x] Validation:
  - [x] Check provider is valid
  - [x] Check API is valid for provider
  - [x] Helpful error messages for invalid inputs
- [x] Config update:
  - [x] Load current config
  - [x] Update provider fields
  - [x] Save to file
- [x] Output:
  - [x] Print confirmation: "✓ Provider set to X (Y)"
  - [x] Show model being used

### set-api Command

- [x] Create `src/cli/commands/set-api.ts`
- [x] Implement command:
  - [x] Accept api argument (responses, chat, messages)
  - [x] Update current provider's API type
- [x] Validation:
  - [x] Check API valid for current provider
  - [x] Error if unsupported combination
- [x] Save and confirm

### list-providers Command

- [x] Create `src/cli/commands/list-providers.ts`
- [x] Implement command:
  - [x] Show all valid provider/API combinations
  - [x] Highlight current selection with arrow (→)
  - [x] Show example models for each combo
- [x] Format output:
  - [x] Clear visual hierarchy
  - [x] Current selection obvious
  - [x] Helpful for user deciding what to switch to

---

## Mocked-Service Tests (TDD)

- [x] Create `tests/mocked-service/phase-3-provider-parity.test.ts`
- [x] Create mock implementations:
  - [x] tests/mocks/provider-clients.ts (createMockResponsesClient, createMockChatClient, createMockMessagesClient)
  - [x] tests/mocks/auth-manager.ts (createMockAuth)

### Provider Parity Suite

- [x] Test 1: Responses API works (mock ResponsesClient, verify conversation flow)
- [x] Test 2: Chat API works (mock ChatClient, verify conversation flow)
- [x] Test 3: Messages API works (mock MessagesClient, verify conversation flow)
- [x] Test 4: All providers return compatible ResponseItems (structure parity check)

### Configuration Suite

- [x] Test 5: Provider switching persists (CLI command updates config, new conversation uses new provider)
- [x] Test 6: Missing API key throws (AuthManager returns null, expect ConfigurationError)
- [x] Test 7: Unsupported combination error (anthropic + chat → error)
- [x] Test 8: Unknown provider error (invalid provider name → error)

### CLI Commands Suite

- [x] Test 9: list-providers shows all options (capture stdout, verify output)
- [x] Test 10: set-provider validation (invalid provider → error message)
- [x] Test 11: set-api validation (unsupported API for provider → error message)

- [x] All 11 tests passing
- [x] Tests run fast (<2 seconds)
- [x] No skipped tests

---

## Model Integration Scripts

**Location:** `scripts/integration-tests/phase-3/`
**Purpose:** Validate real provider behavior with actual API calls

### Script Setup

- [x] Create directory: `scripts/integration-tests/phase-3/`
- [x] Ensure .env has API keys:
  - [x] OPENAI_API_KEY
  - [x] ANTHROPIC_API_KEY
  - [x] OPENROUTER_API_KEY
- [x] Add npm script: `"test:integration": "npm run build && node scripts/integration-tests/phase-3/run-all.js"`

### Individual Scripts

- [x] **test-responses-api.js** (OpenAI Responses, gpt-4o-mini)
  - [x] Create conversation with real ResponsesClient
  - [x] Send test message: "Say hello in one sentence"
  - [x] Verify response received, log content and latency
  - [x] Exit 0 on success, 1 on failure

- [x] **test-chat-api.js** (OpenAI Chat, gpt-4o-mini)
  - [x] Create conversation with real ChatClient
  - [x] Send test message
  - [x] Verify response, log results

- [x] **test-messages-api.js** (Anthropic Messages, haiku-4.5)
  - [x] Create conversation with real MessagesClient
  - [x] Send test message
  - [x] Verify response, log results

- [x] **test-openrouter.js** (OpenRouter, gemini-2.0-flash-001)
  - [x] Create conversation via OpenRouter
  - [x] Model: google/gemini-2.0-flash-001
  - [x] Send test message
  - [x] Verify Gemini responds via OpenRouter

- [x] **test-thinking-controls.js** (Thinking mode)
  - [x] Test 5a: Responses API with thinking enabled
    - [x] Config: thinking={mode: 'enabled', budget: 5000}
    - [x] Send: "Explain why the sky is blue"
    - [x] Verify: Response includes reasoning blocks
  - [x] Test 5b: Messages API with thinking enabled
    - [x] Config: thinking={mode: 'enabled', budget: 5000}
    - [x] Send: "Explain why the sky is blue"
    - [x] Verify: Response includes thinking blocks
  - [x] Log: Token usage with/without thinking

- [x] **test-temperature.js** (Temperature variation)
  - [x] Send same prompt with temp=0.2, 0.7, 1.0
  - [x] Prompt: "Write a creative sentence about coding"
  - [x] Verify: Responses differ (higher temp = more variation)
  - [x] Log: All three responses for comparison

- [x] **run-all.js** (Execute suite)
  - [x] Import all 6 test scripts
  - [x] Run in sequence
  - [x] Catch errors, collect results
  - [x] Print summary table (test name, status, errors)
  - [x] Exit 0 if all pass, 1 if any fail

### Integration Test Execution

- [x] Run: `npm run test:integration`
- [x] Verify: All 6 scripts pass
- [x] Review: Any provider-specific quirks or issues
- [x] Document: Note findings in DECISIONS.md
- [x] Cost check: Should be ~$0.01-0.05 total

---

## Quality Gates

### Code Quality

- [x] Run: `npm run format`
- [x] Verify: No file changes (already formatted)
- [x] Run: `npm run lint`
- [x] Verify: 0 errors (warnings acceptable)
- [x] Run: `npx tsc --noEmit`
- [x] Verify: 0 TypeScript errors

### Testing

- [x] Run: `npm test`
- [x] Verify: All tests passing (1,876+ baseline + 11 new mocked-service tests)
- [x] Verify: 0 skipped tests
- [x] Run: `npm run test:integration`
- [x] Verify: All 6 integration scripts pass
- [x] Review: Integration test logs for issues

### Combined Verification

- [x] Run: `npm run format && npm run lint && npx tsc --noEmit && npm test`
- [x] Verify: All commands succeed in sequence
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

- [x] Update DECISIONS.md:
  - [x] Default API per provider
  - [x] Factory location (ConversationManager method vs separate module)
  - [x] Client reuse strategy (fresh per conversation vs shared)
  - [x] Config validation timing (save time vs creation time)
  - [x] Model name validation approach (allow any vs validate against known)
  - [x] Any provider-specific quirks discovered
- [x] Update checklist (mark completed items)
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
