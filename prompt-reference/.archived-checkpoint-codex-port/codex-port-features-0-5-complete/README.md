# Codex CLI TypeScript Port

This project ports the core tools and harness of the Codex CLI from Rust to TypeScript. The autonomous phase covers project scaffolding plus the initial four tools (`grep_files`, `list_dir`, `shell`, and `read_file` slice mode) with full test parity against the original Rust implementation.

## Project Structure

```
src/
  tools/
    grepFiles.ts
    listDir.ts
    shell.ts
    readFile.ts
    types.ts
  types.ts

tests/
  tools/
    grepFiles.test.ts
    listDir.test.ts
    shell.test.ts
    readFile.test.ts
  helpers/
    fixtures.ts
    assertions.ts
```

The test suite runs on Bun. Use `bun test` to execute all tests.
