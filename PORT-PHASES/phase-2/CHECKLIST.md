# Phase 2 Checklist

**Phase Start Date:** _Not started_
**Phase End Date:** _Not completed_
**Current Status:** Not Started

---

## Setup & Prerequisites

- [x] Phase 1 complete (✅ 283 tests passing)
- [ ] Review Phase 2 documentation (README.md)
- [ ] Decide on TOML parsing library
- [ ] Review Rust source for core modules
- [ ] Understand rollout file format

---

## Module 1: core/config

- [ ] Read codex-rs/core/src/config/mod.rs
- [ ] Create codex-ts/src/core/config.ts
- [ ] Define Config interface/class
- [ ] Implement default configuration
- [ ] Implement config validation
- [ ] Create codex-ts/src/core/config.test.ts
- [ ] Write tests for config structure (min 15 tests)
- [ ] Write tests for default values
- [ ] Write tests for validation
- [ ] Verify all tests pass
- [ ] Update CHECKLIST.md
- [ ] Update STATUS.md

---

## Module 2: core/config-loader

- [ ] Read codex-rs/core/src/config_loader.rs
- [ ] Research TOML parsing library options
- [ ] Choose and install TOML parser
- [ ] Create codex-ts/src/core/config-loader.ts
- [ ] Implement TOML file loading
- [ ] Implement environment variable overrides
- [ ] Implement CLI argument overrides
- [ ] Implement override priority (CLI > env > file > defaults)
- [ ] Create codex-ts/src/core/config-loader.test.ts
- [ ] Write tests for TOML loading (min 15 tests)
- [ ] Write tests for override precedence
- [ ] Write tests for error handling
- [ ] Verify all tests pass
- [ ] Update CHECKLIST.md
- [ ] Update STATUS.md

---

## Module 3: core/message-history

- [ ] Read codex-rs/core/src/message_history.rs
- [ ] Create codex-ts/src/core/message-history.ts
- [ ] Implement MessageHistory class/interface
- [ ] Implement add/get/clear operations
- [ ] Implement turn tracking
- [ ] Create codex-ts/src/core/message-history.test.ts
- [ ] Write tests for history operations (min 12 tests)
- [ ] Write tests for turn tracking
- [ ] Write tests for edge cases
- [ ] Verify all tests pass
- [ ] Update CHECKLIST.md
- [ ] Update STATUS.md

---

## Module 4: core/rollout

- [ ] Read codex-rs/core/src/rollout.rs
- [ ] Read codex-rs/core/src/rollout/list.rs
- [ ] Understand rollout file format (JSONL)
- [ ] Create codex-ts/src/core/rollout.ts
- [ ] Implement RolloutRecorder class
- [ ] Implement write operations (persist conversation)
- [ ] Implement read operations (load conversation)
- [ ] Implement list operations (list saved conversations)
- [ ] Implement archive operations
- [ ] Implement delete operations
- [ ] Implement find_conversation_path_by_id
- [ ] Create codex-ts/src/core/rollout.test.ts
- [ ] Write tests for write/read cycle (min 20 tests)
- [ ] Write tests for list/archive/delete
- [ ] Write tests for file format compatibility
- [ ] Verify all tests pass
- [ ] Update CHECKLIST.md
- [ ] Update STATUS.md

---

## Module 5: core/codex (LARGEST MODULE)

- [ ] Read codex-rs/core/src/codex.rs thoroughly
- [ ] Understand event loop architecture
- [ ] Understand spawn process
- [ ] Create codex-ts/src/core/codex.ts
- [ ] Implement Codex class
- [ ] Implement spawn method
- [ ] Implement event loop (async generator or EventEmitter)
- [ ] Implement submit method
- [ ] Implement next_event method
- [ ] Implement conversation initialization
- [ ] Implement SessionConfigured event generation
- [ ] Create codex-ts/src/core/codex.test.ts
- [ ] Write tests for spawn (min 25 tests)
- [ ] Write tests for event loop
- [ ] Write tests for submit/next_event
- [ ] Write integration tests
- [ ] Verify all tests pass
- [ ] Update CHECKLIST.md
- [ ] Update STATUS.md

---

## Module 6: core/codex-conversation

- [ ] Read codex-rs/core/src/codex_conversation.rs
- [ ] Create codex-ts/src/core/codex-conversation.ts
- [ ] Implement CodexConversation class
- [ ] Implement submit method (delegate to codex)
- [ ] Implement next_event method (delegate to codex)
- [ ] Implement rollout_path getter
- [ ] Create codex-ts/src/core/codex-conversation.test.ts
- [ ] Write tests for conversation wrapper (min 10 tests)
- [ ] Write tests for delegation
- [ ] Verify all tests pass
- [ ] Update CHECKLIST.md
- [ ] Update STATUS.md

---

## Module 7: core/conversation-manager

- [ ] Read codex-rs/core/src/conversation_manager.rs
- [ ] Create codex-ts/src/core/conversation-manager.ts
- [ ] Implement ConversationManager class
- [ ] Implement new_conversation method
- [ ] Implement get_conversation method
- [ ] Implement resume_conversation_from_rollout method
- [ ] Implement fork_conversation method
- [ ] Implement remove_conversation method
- [ ] Implement conversation tracking (in-memory map)
- [ ] Create codex-ts/src/core/conversation-manager.test.ts
- [ ] Write tests for create/resume/fork (min 20 tests)
- [ ] Write tests for conversation tracking
- [ ] Write integration tests (end-to-end flows)
- [ ] Verify all tests pass
- [ ] Update CHECKLIST.md
- [ ] Update STATUS.md

---

## Integration & Testing

### Integration Tests
- [ ] Test: Create conversation → persist → resume → verify
- [ ] Test: Load config (file + env + CLI) → create conversation
- [ ] Test: Fork conversation → verify history truncated
- [ ] Test: List conversations → verify metadata
- [ ] Test: Archive conversation → verify moved
- [ ] All integration tests pass

### Cross-Module Verification
- [ ] Config system works with conversation creation
- [ ] Rollout persistence matches Rust format
- [ ] Message history integrates with conversation flow
- [ ] All modules work together seamlessly

---

## Documentation & Cleanup

- [ ] Update codex-ts/src/core/index.ts with exports
- [ ] Add JSDoc comments to all public APIs
- [ ] Update codex-ts/PORT_LOG_MASTER.md with Phase 2 results
- [ ] Update PORT-PHASES/phase-2/STATUS.md with final summary
- [ ] Update PORT-PHASES/phase-2/DECISIONS.md with all decisions
- [ ] Run `npm test` and verify 100% pass rate
- [ ] Run `npx tsc --noEmit` and verify no errors
- [ ] Run `npm run format`
- [ ] Review all code for TODOs
- [ ] Verify all Phase 2 goals met

---

## Final Validation

- [ ] All 7 core modules ported
- [ ] Minimum 100+ tests written (target: ~117 tests)
- [ ] 100% test pass rate achieved
- [ ] All integration tests passing
- [ ] Config loads from all sources
- [ ] Can create conversation from config
- [ ] Can persist and resume conversation
- [ ] Documentation complete
- [ ] No TypeScript errors
- [ ] Code formatted
- [ ] DECISIONS.md has all technical decisions
- [ ] STATUS.md has complete progress log
- [ ] Ready for Phase 3

---

## Summary Stats

**Total Tasks:** 150+
**Completed:** 0
**In Progress:** 0
**Blocked:** 0

**Test Target:** 100+ tests (estimated ~117)
**Current Test Count:** TBD

**Estimated Hours:** 58-80
**Actual Hours:** TBD
