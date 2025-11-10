# Phase 2 Manual Script

1. Enable packs: `cody scripts tools --enable file-ops`
2. Run script calling `tools.readFile` and `tools.applyPatch`; confirm CLI table shows both entries.
3. Disable `file-ops`, rerun script touching readFile → receive ToolNotAllowed error.
4. Run CLI verbose mode (`cody chat --scripts-verbose ...`) to ensure JSON args/results printed.
