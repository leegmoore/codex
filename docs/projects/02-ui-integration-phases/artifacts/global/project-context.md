# Project 02: UI Integration & Library Definition

## What We're Building

Project 02 integrates all ported Codex modules (Phases 1-6) into a working command-line interface called **Cody** and defines the library API surface for @openai/codex-core. This project validates the Rust → TypeScript port by wiring protocol, configuration, persistence, execution, client, tools, and orchestration layers into complete conversation flows.

## Why It Matters

The port is functionally complete but untested as an integrated system. Individual modules have unit tests, but we haven't verified end-to-end workflows. This project proves the port works, exposes integration issues, and establishes the library interface that external developers will use.

## Project Success Criteria

By project completion:
- User can create conversations, send messages, receive responses (all providers: OpenAI Responses/Chat, Anthropic Messages)
- All auth methods work (API keys, ChatGPT OAuth, Claude OAuth)
- Tools execute with approval flow
- Conversations persist and resume (JSONL format)
- MCP integration functional
- Library API documented (public exports, usage examples)
- REST API designed (optional implementation)
- Zero-error quality baseline maintained (0 TS errors, 0 ESLint errors, all tests passing)

## Dependencies

- Phase 6 complete (75 modules ported, 1,876 tests passing)
- Phase 5.2 complete (quality baseline clean)
- API keys: OpenAI, Anthropic, OpenRouter
- OAuth tokens: Read from ~/.codex (ChatGPT), ~/.claude (Claude)

## Scope

**In scope:** CLI commands, provider integration (3 APIs), auth methods (4 total), tool execution, persistence/resume, library API docs, REST API spec

**Non-scope:** Script harness (Project 03), memory innovations (Projects 04-06), rich TUI, additional tools, performance optimization, production hardening
