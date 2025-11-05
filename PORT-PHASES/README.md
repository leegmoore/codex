# TypeScript Port Phases

This directory contains detailed plans, checklists, and progress tracking for each phase of the Codex Rust → TypeScript port.

## Quick Links

- [**Overall Port Plan**](../PORT-PLAN.md) - Complete port strategy
- [**API Design**](../API-DESIGN.md) - Target API we're building
- [**Current Status**](../ts-port-status.md) - What's already done

## Phases

### [Phase 1: Foundation & Protocol](./phase-1/README.md) ⬅️ START HERE
**Goal:** Complete protocol layer and establish testing infrastructure

**Status:** Not Started

**Documents:**
- [README.md](./phase-1/README.md) - Detailed phase plan
- [CHECKLIST.md](./phase-1/CHECKLIST.md) - Task tracking
- [STATUS.md](./phase-1/STATUS.md) - Progress log
- [DECISIONS.md](./phase-1/DECISIONS.md) - Technical decisions
- [KICKOFF.md](./phase-1/KICKOFF.md) - Agent kickoff prompt

**Key Deliverables:**
- All `protocol/*` modules ported (8 modules)
- 80+ tests passing
- Golden file test infrastructure
- SDK type compatibility verified

---

### Phase 2: Core Engine
**Goal:** Conversation and turn management

**Status:** Not Started

**Key Deliverables:**
- `core/config` and config loading
- `core/conversation-manager`
- `core/codex-conversation`
- `core/message-history`
- `core/rollout` (persistence)

---

### Phase 3: Execution & Tools
**Goal:** Command execution, file operations, tool management

**Status:** Not Started

**Key Deliverables:**
- `core/exec` and `exec` module
- `execpolicy` and sandboxing
- `apply-patch` module
- `file-search` module
- `core/tools` orchestration

---

### Phase 4: Model Integration & MCP
**Goal:** LLM communication and MCP server support

**Status:** Not Started

**Key Deliverables:**
- `core/client` and `core/chat_completions`
- `backend-client` (API communication)
- `ollama/client` and remaining ollama modules
- `chatgpt` integration
- `mcp-server` and `mcp-types`

---

### Phase 5: CLI, Auth & Polish
**Goal:** Complete system with CLI and authentication

**Status:** Not Started

**Key Deliverables:**
- `login` and `keyring-store`
- `core/auth` and `AuthManager`
- `exec/exec_events` (JSONL output)
- `cli` entry point
- `app-server` (IDE integration)
- Platform utilities (git, image, pty)

---

## How to Use This Structure

### Starting a Phase

1. Read `PORT-PLAN.md` for context
2. Read `phase-N/README.md` for detailed requirements
3. Review `phase-N/CHECKLIST.md` for tasks
4. Start working through the checklist

### During a Phase

1. Check off completed items in `CHECKLIST.md`
2. Update `STATUS.md` after each session with:
   - What you completed
   - What's in progress
   - Blockers or decisions
   - Hours spent
3. Record technical decisions in `DECISIONS.md`

### Completing a Phase

1. Verify all checklist items complete
2. Ensure all tests passing
3. Update documentation
4. Write final summary in `STATUS.md`
5. Move to next phase

---

## Phase Dependencies

```
Phase 1 (Protocol)
    ↓
Phase 2 (Core Engine) ← depends on Phase 1
    ↓
Phase 3 (Execution & Tools) ← depends on Phase 2
    ↓
Phase 4 (Model Integration & MCP) ← depends on Phase 2 & 3
    ↓
Phase 5 (CLI, Auth & Polish) ← depends on all previous
```

Each phase builds on the previous, so they must be completed in order.

---

## Success Criteria

Each phase is complete when:
- ✅ All checklist items checked
- ✅ All tests passing (100% pass rate)
- ✅ Integration tests passing
- ✅ Documentation updated
- ✅ No TypeScript errors
- ✅ No linter warnings
- ✅ STATUS.md has final summary
- ✅ Ready for next phase

---

## Getting Help

If you encounter issues:

1. Check `DECISIONS.md` for similar problems
2. Review Rust source code for reference
3. Check existing TS modules for patterns
4. Document the decision in `DECISIONS.md`

---

## Timeline

- Phase 1: 1-2 weeks
- Phase 2: 3 weeks
- Phase 3: 2 weeks
- Phase 4: 2 weeks
- Phase 5: 2 weeks

**Total: ~11 weeks**
