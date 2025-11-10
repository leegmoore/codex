# Phase 2 Test Conditions

1. Enabling packs exposes tools: with `file-ops` enabled, `tools.readFile` accessible; when disabled, access throws `ToolNotAllowedError`.
2. Schema validation fires: malformed args for `applyPatch` produce same error message as structured call path.
3. CLI listing shows packs, highlights active ones, and persists selection in config.
4. CLI verbose mode prints args/results only when `--verbose` supplied.
5. Budget counters increment per call; exceeding limit produces `ToolBudgetExceededError`.
