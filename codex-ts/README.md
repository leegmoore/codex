# codex-ts

TypeScript port of codex-rs - A systematic migration of Rust utility modules to idiomatic TypeScript.

## Overview

This project ports portable, algorithmic modules from the codex-rs Rust workspace to TypeScript. The focus is on utility functions, pure algorithms, and business logic that translates well across languages, while platform-specific and system-level modules remain in Rust.

## Status

- **Modules Ported**: 8
- **Tests Passing**: 70
- **Test Coverage**: Comprehensive unit tests ported from Rust

See [PORTING_STATUS.md](./PORTING_STATUS.md) for detailed porting progress and rationale.

## Structure

This project mirrors the structure of codex-rs where applicable, with each Rust module ported to idiomatic TypeScript following modern ES2022+ patterns.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests once
npm test run

# Build
npm run build

# Type check
npm run type-check
```

## Ported Modules

### Utils
- **utils/string** - UTF-8 safe string truncation at character boundaries
  - `takeBytesAtCharBoundary()` - Truncate to byte budget (prefix)
  - `takeLastBytesAtCharBoundary()` - Take suffix within byte budget

- **utils/cache** - LRU cache with SHA-1 hashing
  - `LruCache` - LRU cache wrapper
  - `sha1Digest()` - SHA-1 hashing for cache keys

### Async Utilities
- **async-utils** - Promise cancellation utilities
  - `orCancel()` - Race promise against AbortSignal (Rust tokio::select! pattern)

### Common
- **common/fuzzy-match** - Fuzzy string matching with Unicode support
  - `fuzzyMatch()` - Case-insensitive subsequence matching with scoring
  - `fuzzyIndices()` - Get match indices only

- **common/elapsed** - Duration formatting
  - `formatDuration()` - Human-readable duration from milliseconds
  - `formatElapsed()` - Format elapsed time from start timestamp

- **common/format-env-display** - Environment variable display
  - `formatEnvDisplay()` - Format env vars with masked values

### ANSI Processing
- **ansi-escape** - ANSI escape sequence processing
  - `expandTabs()` - Replace tabs with spaces
  - `processAnsiEscape()` - Basic ANSI processing
  - `processAnsiEscapeLine()` - Single-line processing

### Ollama
- **ollama/url** - Ollama URL utilities
  - `isOpenAiCompatibleBaseUrl()` - Detect OpenAI-compatible URLs
  - `baseUrlToHostRoot()` - Convert provider URL to host root

## Design Principles

1. **Idiomatic TypeScript**: Use modern TypeScript patterns, not literal Rust translations
2. **Comprehensive Tests**: Port all Rust tests and maintain coverage
3. **Unicode Correctness**: Preserve Rust's careful Unicode handling
4. **Type Safety**: Leverage TypeScript's type system fully
5. **Minimal Dependencies**: Use existing libraries where appropriate (lru-cache for caching)
