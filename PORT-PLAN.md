# Codex TypeScript Port Plan

## Overview

This document outlines the complete plan for porting the Codex Rust codebase to TypeScript. The port creates a pure TypeScript library (`@openai/codex-core`) that can power CLIs, APIs, and embedded applications without subprocess overhead.

## Goals

1. **Library-first architecture** - Core functionality as importable TypeScript library
2. **Protocol compatibility** - Maintain JSONL event protocol for SDK compatibility
3. **Integration tested** - Verify cross-module flows, not just unit tests
4. **Incremental delivery** - Each phase produces working, testable code
5. **API-ready** - Design enables REST API wrapper without refactoring

## Architecture

```
@openai/codex-core (TypeScript Library)
├── ConversationManager (session lifecycle)
├── Conversation (turn management)
├── ModelClient (LLM communication)
├── ToolExecutor (command/file/MCP execution)
├── Config (configuration)
└── AuthManager (authentication)
```

## Port Phases

### Phase 1: Foundation & Protocol (Week 1-2)
**Goal:** Complete protocol layer and establish testing infrastructure

**Deliverables:**
- All `protocol/*` modules ported
- Test infrastructure matching Rust patterns
- Integration test harness for JSONL events
- Documentation structure

**Success Criteria:**
- All protocol types serialize/deserialize correctly
- Can create conversation IDs, format numbers, parse commands
- Test framework runs 100+ tests
- Golden file testing infrastructure ready

### Phase 2: Core Engine (Week 3-5)
**Goal:** Port the heart of Codex - conversation and turn management

**Deliverables:**
- `core/config` and config loading
- `core/conversation-manager`
- `core/codex-conversation`
- `core/codex` (main orchestrator)
- `core/message-history`
- `core/rollout` (persistence)

**Success Criteria:**
- Can create and resume conversations
- Conversations persist to disk correctly
- Can load config from TOML/env/overrides
- Integration test: create conversation → persist → resume

### Phase 3: Execution & Tools (Week 6-7)
**Goal:** Command execution, file operations, and tool management

**Deliverables:**
- `core/exec` and `exec` module
- `execpolicy` (sandboxing policies)
- `apply-patch` module
- `file-search` module
- `core/tools` orchestration
- Platform-specific sandboxing (Linux/macOS/Windows)

**Success Criteria:**
- Can execute commands with proper sandboxing
- Can apply file patches
- Can search files with fuzzy matching
- Integration test: full turn with command execution + file changes

### Phase 4: Model Integration & MCP (Week 8-9)
**Goal:** LLM communication and MCP server support

**Deliverables:**
- `core/client` and `core/chat_completions`
- `backend-client` (OpenAI/Anthropic APIs)
- `ollama/client` and remaining ollama modules
- `chatgpt` integration
- `mcp-server` and `mcp-types`
- `rmcp-client`
- `core/mcp` orchestration

**Success Criteria:**
- Can communicate with OpenAI/Anthropic APIs
- Can connect to Ollama locally
- Can spawn and communicate with MCP servers
- Integration test: full conversation with real LLM + MCP tools

### Phase 5: CLI, Auth & Polish (Week 10-11)
**Goal:** Complete the system with CLI interface and authentication

**Deliverables:**
- `login` and `keyring-store`
- `core/auth` and `AuthManager`
- `exec/exec_events` (JSONL output)
- `cli` entry point
- `app-server` and `app-server-protocol` (IDE integration)
- Platform-specific utilities (`utils/git`, `utils/image`, `utils/pty`)
- Final documentation and examples

**Success Criteria:**
- Full CLI works: `codex exec "fix the tests"`
- Login flow works (ChatGPT OAuth + API key)
- JSONL output matches Rust binary exactly
- Existing SDK can use new TS binary
- Integration test: end-to-end CLI session

## Testing Strategy

### Unit Tests
- Each module has `.test.ts` file
- Port Rust tests directly where possible
- Maintain 100% pass rate throughout

### Integration Tests
Each phase includes integration tests that verify cross-module functionality:
- Phase 1: Protocol serialization round-trips
- Phase 2: Create → persist → resume conversation
- Phase 3: Execute command → apply patch → verify filesystem
- Phase 4: Send message → call LLM → get response → call MCP tool
- Phase 5: Full CLI session with all features

### Golden File Tests
Compare TS output against known-good Rust output:
- JSONL event streams
- Config file generation
- Rollout file format

### SDK Compatibility Tests
Existing `@openai/codex-sdk` tests run against new TS binary.

## Progress Tracking

Each phase has:
- `PORT-PHASES/phase-{N}/README.md` - Detailed phase plan
- `PORT-PHASES/phase-{N}/CHECKLIST.md` - Task tracking
- `PORT-PHASES/phase-{N}/STATUS.md` - Progress log
- `PORT-PHASES/phase-{N}/DECISIONS.md` - Technical decisions

## Success Metrics

- **All tests passing** - 100% of ported tests pass
- **Protocol compatibility** - JSONL output matches Rust
- **Performance** - No subprocess overhead, <100ms conversation startup
- **Integration** - SDK tests pass with new binary
- **Documentation** - Every exported API documented

## Timeline

- **Phase 1:** 2 weeks (Foundation)
- **Phase 2:** 3 weeks (Core Engine)
- **Phase 3:** 2 weeks (Execution & Tools)
- **Phase 4:** 2 weeks (Model Integration & MCP)
- **Phase 5:** 2 weeks (CLI, Auth & Polish)

**Total:** ~11 weeks for complete port

## Next Steps

1. Review and approve this plan
2. Start Phase 1 (see `PORT-PHASES/phase-1/README.md`)
3. Set up CI/CD for continuous testing
4. Establish integration test baseline from Rust binary
