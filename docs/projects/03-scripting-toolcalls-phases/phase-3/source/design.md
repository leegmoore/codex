# Phase 3 Design – Promise Lifecycle & Detached Tasks

## Objective
Track every async tool call, cancel leaked promises, and add `tools.spawn.*` APIs for detached tasks that survive beyond the current script turn.

## Components

1. **PromiseTracker:** registers all awaited tool calls, associates them with AbortSignals, and cancels outstanding work when scripts finish or abort. Provides helpful diagnostics when a promise leaks (`exec @ script.ts:12 never resolved`).
2. **Spawn Manager:** implements `tools.spawn.<toolName>()` returning handles with `.done`, `.cancel`, `.status`. Spawned tasks continue running after the script returns; results surface in subsequent turns via conversation history.
3. **CLI Task UI:** displays running tool calls (spinners) and a summary banner listing completed vs running tasks. Adds command to list detached tasks.

## Notes
- Persist detached task metadata (id, tool, status) to conversation state so future scripts or structured turns can inspect them.
- Ctrl+C or turn timeout cancels active tasks unless explicitly detached.
