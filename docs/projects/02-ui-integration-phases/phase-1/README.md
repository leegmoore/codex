# Phase 1: Basic Chat Flow

**Status:** Planning Complete
**Dependencies:** Phase 6 (port) complete, Phase 5.2 (quality) complete
**Estimated Code:** ~400 lines
**Estimated Duration:** 3-6 hours

---

## Overview

Phase 1 wires the CLI to the ported library for basic conversation capability. This is the first time all ported components (ConversationManager, Codex, Session, ModelClient) talk to each other in a complete workflow. We're proving end-to-end integration works with minimal variables: single provider (OpenAI Responses API), single auth method (API key), basic commands (new, chat).

**Functional outcome:** User can start conversation, send messages, receive responses, maintain multi-turn context.

---

## Technical Design

See TECH-APPROACH.md Section 2 for complete design including:
- Target state diagram (system structure)
- Component structure (UML class diagram)
- Connection points detail (how components wire together)
- End-to-end sequence diagram (complete flow)
- Contracts defined (createConversation, sendMessage)
- Verification approach (functional + mocked-service tests)

---

## Key Integration Points

**CLI → ConversationManager:**
- CLI imports ConversationManager
- Constructs ModelClient from config
- Passes client to manager
- Calls createConversation(), sendMessage()

**ConversationManager → Codex:**
- Manager creates Codex instance
- Wraps in Conversation
- Delegates sendMessage to Codex

**Codex → Session → ModelClient:**
- Codex coordinates Session
- Session calls ModelClient.sendMessage()
- ModelClient handles OpenAI Responses API
- Returns ResponseItems

---

## Files Being Created

**CLI Layer (~300 lines):**
- src/cli/index.ts (entry point, Commander.js setup)
- src/cli/commands/new.ts (create conversation command)
- src/cli/commands/chat.ts (send message command)
- src/cli/config.ts (load config from ~/.codex/config.toml)
- src/cli/display.ts (render responses to console)
- src/cli/client-factory.ts (construct ModelClient from config)

**Testing (~100 lines):**
- tests/mocked-service/phase-1-conversation-flow.test.ts
- tests/mocks/model-client.ts
- tests/mocks/config.ts

---

## Execution

1. Read: CODER-PROMPT.txt (full context and workflow)
2. Read: References (PRD, TECH-APPROACH, standards)
3. Follow: TDD workflow (tests first, implement to green)
4. Update: CHECKLIST.md as you work
5. Log: DECISIONS.md for implementation choices
6. Verify: Quality gates before completion
7. Run: Quality verifier (Stage 1)
8. Run: Code reviewer via CODEX-REVIEW-PROMPT.txt (Stage 2)

---

## Success Criteria

From PRD Section 2:
- User can create conversation via CLI
- User can send messages and receive responses
- Multi-turn conversation maintains history
- All quality gates pass (format, lint, typecheck, tests)
- Mocked-service tests verify conversation flow

---

## Notes

**First integration:** Components never wired together before. Expect to discover integration issues. Document in DECISIONS.md. If blockers found, stop and report—don't redesign core modules.

**Testing strategy:** Mock all external boundaries (ModelClient API calls). Fast, deterministic tests that verify wiring correctness without network dependencies.

**Next phase:** Phase 2 adds tool execution on top of this foundation.
