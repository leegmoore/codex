# Phase 2: Core Engine

## Overview

Phase 2 builds the core conversation engine by porting configuration management, session lifecycle, and persistence layer. This phase uses the protocol types from Phase 1 to implement the business logic.

## Goals

1. **Configuration system** - Load and manage Codex configuration
2. **Conversation lifecycle** - Create, resume, fork conversations
3. **Session persistence** - Store and retrieve conversation history (rollout)
4. **Message history** - Track turns and items

## What Needs Porting

### Core Modules (7 modules)

1. **core/config.rs** (~400 lines, 8-12 hours)
   - Configuration data structure
   - Config validation
   - Default values
   - Dependencies: `protocol/config-types`

2. **core/config_loader.rs** (~300 lines, 4-6 hours)
   - Load config from TOML files
   - Environment variable overrides
   - CLI argument overrides
   - Dependencies: `core/config`, `common/config-override`

3. **core/message_history.rs** (~200 lines, 4-6 hours)
   - Track conversation turns
   - Manage turn items
   - Dependencies: `protocol/message-history`, `protocol/items`

4. **core/rollout.rs** (~800 lines, 8-12 hours)
   - Persist conversations to disk
   - Load conversations from disk
   - Archive and delete operations
   - Dependencies: `protocol/*`

5. **core/codex.rs** (~1200 lines, 16-20 hours) **LARGEST**
   - Main orchestrator
   - Spawn conversations
   - Event loop
   - Dependencies: ALL above + `core/client`

6. **core/codex_conversation.rs** (~40 lines, 6-8 hours)
   - Conversation wrapper
   - Submit operations
   - Receive events
   - Dependencies: `core/codex`

7. **core/conversation_manager.rs** (~200 lines, 12-16 hours)
   - High-level conversation API
   - Create/resume/fork/list operations
   - Dependencies: ALL above

## Module Dependencies

```
core/config ← protocol/config-types
    ↓
core/config-loader ← common/config-override
    ↓
core/message-history ← protocol/message-history, protocol/items
    ↓
core/rollout ← protocol/*
    ↓
core/codex ← ALL above
    ↓
core/codex-conversation
    ↓
core/conversation-manager ← ALL above
```

## Porting Order

**Recommended sequence:**
1. `core/config` (foundation)
2. `core/config-loader` (depends on config)
3. `core/message-history` (independent, can be parallel)
4. `core/rollout` (persistence layer)
5. `core/codex` (main orchestrator, largest)
6. `core/codex-conversation` (thin wrapper)
7. `core/conversation-manager` (high-level API)

**Parallel opportunities:**
- `core/message-history` can be done in parallel with `core/config-loader`

## Testing Strategy

### Unit Tests
- Each module needs comprehensive unit tests
- Test configuration loading from various sources
- Test conversation lifecycle operations
- Test persistence (rollout) read/write

### Integration Tests
- **Config integration**: Load config from file → apply overrides → validate
- **Conversation flow**: Create → send message → persist → resume
- **Rollout**: Write conversation → read back → verify equality

### Key Test Scenarios
1. **Config loading**: TOML file + env vars + CLI overrides
2. **Conversation creation**: Default config vs custom config
3. **Resume conversation**: Load from disk, continue session
4. **Fork conversation**: Branch at specific turn
5. **List conversations**: Pagination, filtering
6. **Archive**: Move to archived directory
7. **Delete**: Remove from disk

## Technical Decisions to Make

### Configuration Format
- **Decision needed**: TOML parsing library
- **Options**: `@iarna/toml`, `smol-toml`, custom parser
- **Rust uses**: `toml` crate (full TOML 1.0)

### Persistence Format
- **Decision**: Keep Rust's format or create new?
- **Recommendation**: Match Rust format exactly for compatibility
- **Format**: JSONL with event stream

### File Paths
- **Rust uses**: `PathBuf` extensively
- **TypeScript**: Use `string` with `path` module
- **Cross-platform**: Use `path.join()`, `path.resolve()`

### Async Patterns
- **Rust uses**: `tokio` async runtime
- **TypeScript**: Native `async/await` with Node.js
- **Channels**: Rust `mpsc` → TypeScript `EventEmitter` or async generators

## Success Criteria

- [x] Phase 1 complete (prerequisite)
- [ ] All 7 core modules ported
- [ ] Minimum 100+ tests (avg 15 per module)
- [ ] 100% test pass rate
- [ ] Integration tests passing
- [ ] Can create conversation from config
- [ ] Can persist and resume conversation
- [ ] Config loads from all sources (TOML, env, CLI)
- [ ] Documentation updated

## Estimated Effort

- **core/config**: 8-12 hours
- **core/config-loader**: 4-6 hours
- **core/message-history**: 4-6 hours
- **core/rollout**: 8-12 hours
- **core/codex**: 16-20 hours
- **core/codex-conversation**: 6-8 hours
- **core/conversation-manager**: 12-16 hours

**Total**: 58-80 hours (~3 weeks at 20 hours/week)

## File Structure

```
codex-ts/src/core/
├── config.ts
├── config.test.ts
├── config-loader.ts
├── config-loader.test.ts
├── message-history.ts
├── message-history.test.ts
├── rollout.ts
├── rollout.test.ts
├── codex.ts
├── codex.test.ts
├── codex-conversation.ts
├── codex-conversation.test.ts
├── conversation-manager.ts
├── conversation-manager.test.ts
└── index.ts (exports)
```

## Next Phase Preview

Phase 3 will use Phase 2's conversation engine to add:
- Command execution (`core/exec`, `exec`, `execpolicy`)
- File operations (`apply-patch`, `file-search`)
- Tool orchestration (`core/tools`)
- Sandboxing (`core/sandboxing`)
