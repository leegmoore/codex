# Phase 4 Manual Script

1. Run script calling exec + applyPatch (both approval-required). Observe prompt with script hash/snippet.
2. Approve first, deny second, confirm script catches denial (try/catch) and CLI logs both decisions.
3. Review audit log (CLI or log file) to confirm entries.
