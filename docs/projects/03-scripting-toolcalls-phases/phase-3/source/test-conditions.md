# Phase 3 Test Conditions

1. Tracker cancels pending promises when script exits normally (mock tool resolves after delay → ensure cancellation occurs).
2. Ctrl+C (simulated) aborts running tools and surfaces `ScriptCanceledError`.
3. `tools.spawn.exec` returns handle whose `.done` resolves after script completes; status persisted to history.
4. Detached task result surfaces next turn (mock pipeline ensures conversation history carries task output).
5. CLI displays running/completed counts and `scripts tasks` command lists active handles.
