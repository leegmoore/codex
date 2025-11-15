# Phase 2: Tool Integration - Task Checklist

**Phase:** 2 - Tool Integration
**Status:** In Progress
**Estimated Code:** ~300 lines (CLI ~200, tests ~100)

---

## Setup

- [x] Review Phase 1 code (understand existing CLI structure)
- [x] Read tool registry: codex-ts/src/tools/registry.ts
- [x] Read exec tool: codex-ts/src/core/exec/index.ts
- [x] Understand FunctionCall/FunctionCallOutput types

---

## Approval Module

- [x] Create src/cli/approval.ts
- [x] Import readline/promises
- [x] Implement promptApproval(toolName, args) function
  - [x] Display tool name and arguments
  - [x] Prompt user for y/n
  - [x] Return boolean Promise
- [x] Handle edge cases (Ctrl+C, invalid input)
- [ ] Test manually: Can prompt and get response

---

## Display Enhancements

- [x] Open src/cli/display.ts (from Phase 1)
- [x] Add renderToolCall(call: FunctionCall)
  - [x] Display tool name
  - [x] Display arguments (formatted JSON)
- [x] Add renderToolResult(output: FunctionCallOutput)
  - [x] Parse output JSON
  - [x] Display result (stdout, content, or full object)
- [x] Test: Functions render nicely to console

---

## Event Loop Enhancement

- [x] Open src/cli/commands/chat.ts (from Phase 1)
- [x] Modify to handle multiple events (not just single response)
- [x] Add event loop:
  - [x] While not complete, call nextEvent()
  - [x] Handle different event types
  - [x] Display appropriately
- [x] Handle tool_call events (display via renderToolCall)
- [x] Handle tool_result events (display via renderToolResult)
- [x] Handle final assistant message
- [x] Test: Event loop works for multi-event responses

---

## Approval Callback Injection

- [x] Determine where to inject approval callback
  - [x] Check Codex.spawn() signature
  - [x] Or Session constructor
  - [x] Or ConversationManager
- [x] Modify CLI initialization (src/cli/index.ts)
  - [x] Import promptApproval
  - [x] Pass to Codex/Session/Manager during creation
- [x] Document injection point in DECISIONS.md
- [x] Test: Approval callback gets called

---

## Session Integration (if needed)

- [x] Check if Session already routes tools (likely yes from port)
- [x] If not: Add tool detection logic
  - [x] Scan ResponseItems for FunctionCall
  - [x] Look up in ToolRegistry
  - [x] Check requiresApproval
  - [x] Call approval callback if needed
  - [x] Execute tool
  - [x] Return FunctionCallOutput
- [x] If yes: Just wire approval callback, rest works
- [x] Document findings in DECISIONS.md

---

## Mocked-Service Tests (TDD - Write These FIRST)

### Test Setup

- [x] Create tests/mocked-service/phase-2-tool-execution.test.ts
- [x] Create tests/mocks/tool-handlers.ts
- [x] Implement createMockToolHandler(result)
  - [x] Returns RegisteredTool with mocked execute
  - [x] Configurable result
- [x] Enhance tests/mocks/model-client.ts
  - [x] Add createMockClientWithToolCall(toolName, args)
  - [x] Returns ResponseItems including FunctionCall

### Test 1: Execute Approved Tool

- [x] Setup: Mock client with FunctionCall, mock tool handler, approval = true
- [x] Execute: Create conversation, send message
- [x] Verify: Tool handler execute() called
- [x] Verify: Response includes FunctionCallOutput
- [x] Test passes

### Test 2: Block Denied Tool

- [x] Setup: Mock client with FunctionCall, approval = false
- [x] Execute: Send message
- [x] Verify: Tool handler execute() NOT called
- [x] Verify: FunctionCallOutput has denial error
- [x] Test passes

### Test 3: Multiple Tools Sequence

- [x] Setup: Mock client with two tool calls
- [x] Approval = true for both
- [x] Execute: Send message
- [x] Verify: Both tools executed
- [x] Verify: Both outputs returned
- [x] Test passes

### Test 4: Tool Not Found

- [x] Setup: Mock client requests 'fake_tool'
- [x] Execute: Send message
- [x] Verify: Error output (tool not found)
- [x] Verify: No crash
- [x] Test passes

### Test 5: Tool Execution Fails

- [x] Setup: Mock tool throws error
- [x] Execute: Send message (approve)
- [x] Verify: Error captured in output
- [x] Verify: Model receives error message
- [x] Test passes

### Test 6: Display Functions

- [x] Spy on renderToolCall and renderToolResult
- [x] Execute tool flow
- [x] Verify: Display functions called
- [x] Test passes

### All Tests

- [x] All 6 tests pass
- [x] Tests run fast (<2 seconds)
- [x] No real tool execution (all mocked)

---

## Functional Verification (Manual CLI Testing)

- [ ] Test: Tool approval (approve case) - readFile
- [ ] Test: Tool approval (deny case) - exec
- [ ] Test: Multiple tools in conversation
- [ ] Test: Tool execution error handling
- [ ] Verify: All manual tests from manual-test-script.md pass

---

## Quality Gates

- [x] Run: npm run format → no changes
- [x] Run: npm run lint → 0 errors
- [x] Run: npx tsc --noEmit → 0 errors
- [x] Run: npm test
  - [x] Phase 2 mocked-service tests: all passing
  - [x] Unit test baseline: 1,876+ maintained
  - [x] No skipped tests
- [x] Combined: npm run format && npm run lint && npx tsc --noEmit && npm test
  - [x] All pass in sequence

---

## Documentation

- [x] Update DECISIONS.md
  - [x] Approval callback injection point
  - [x] Event loop approach
  - [x] Tool display format choices
  - [x] Any other key decisions
- [ ] Review: All tasks checked off above
- [ ] Verify: Checklist complete

---

## Final

- [ ] All tasks complete
- [ ] All quality gates passed
- [ ] Manual testing successful
- [ ] Code committed and pushed
- [ ] Phase 2 ready for verification stages
