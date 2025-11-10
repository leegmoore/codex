# Phase 2 Design – Full Tool Integration

## Objective
Expose the entire tool registry to scripts with schema validation, tool packs, and richer CLI output while retaining centralized control over budgets and approval metadata.

## Components

1. **Tool Facade (`tool_facade.ts`):**
   - Builds a proxy keyed by tool name.
   - Checks whitelist/pack membership before exposing a tool.
   - Validates args against existing JSON schemas (reuse structured call validators).
   - Tracks per-call metadata (start/end times, arg snippets) for later logging.

2. **Tool Pack Configuration (`script_config.ts`):**
   - Reads `scripts.yaml` or config entries to determine enabled packs.
   - CLI command `cody scripts tools` lists packs, shows which are active, and allows toggling.

3. **CLI Output Enhancements:**
   - Table summarizing tool calls (name, status, duration).
   - Verbose mode to print JSON args/results when requested.

## Notes
- Budget enforcement (max calls/concurrency) stays in facade so later approval bridge can piggyback on metadata.
- Keep default pack conservative (`core` only) to minimize approval noise.
