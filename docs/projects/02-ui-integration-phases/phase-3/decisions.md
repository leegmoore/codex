# Phase 3 Decisions – Multi-Provider Support

## ModelClient Factory Placement
- Introduced `createDefaultModelClientFactory` in `src/core/client/default-model-client-factory.ts`.
- `ConversationManager` now accepts an optional factory and falls back to this default, so non-CLI callers automatically receive the correct provider wiring without duplicating logic.
- The factory instantiates a fresh `ModelClient` per conversation to keep auth snapshots and prompt-level options (temperature, reasoning controls) isolated.

## Provider/API Defaults
- Provider catalog lives in `src/cli/providers.ts`. Defaults:
  - `openai` → `responses` (model `gpt-4o-mini`)
  - `anthropic` → `messages` (model `claude-3-haiku`)
  - `openrouter` → `chat` (model `google/gemini-2.0-flash-001`)
- CLI config persists optional `temperature`; when omitted we send provider defaults (1.0 for chat-style models, null for responses).
- Config validation happens both when writing `config.toml` and during `ConversationManager.newConversation`, ensuring invalid combinations (e.g., `anthropic` + `chat`) never make it to runtime.

## API-Specific Quirks
- Anthropic Messages now requires `max_tokens` (legacy field) instead of `max_output_tokens`, and `tool_choice` must be an object (`{ type: "auto" | "any" | ... }`). The adapter coalesces missing `usage` blocks to zeros to avoid crashes.
- OpenAI Chat Completions responses arrive as plain JSON; we disable streaming for that client path so the CLI receives a single text response aligned with the Responses adapter.
- Integration harness trusts `.env` overrides via `dotenv({ override: true })` so the user’s vetted keys replace any stale shells without the CLI ever reading or logging them.

## Testing & Verification
- Added `tests/mocked-service/phase-3-provider-parity.test.ts` covering all 11 checklist scenarios (factory routing, CLI commands, config validation, missing keys).
- Created `scripts/integration-tests/phase-3/` with six Node harnesses plus `npm run test:integration`; these must pass before Phase 3 closes and serve as the manual verification shortcut in lieu of ad-hoc CLI runs.

## Outstanding Items
- Manual verification via `manual-test-script.md` still needs to be executed and recorded before closing the phase.

