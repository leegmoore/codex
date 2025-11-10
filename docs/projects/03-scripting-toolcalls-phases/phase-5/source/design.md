# Phase 5 Design – Performance & Security Hardening

## Objective
Make the harness production-ready by pooling QuickJS workers, caching scripts/compilation output, enforcing resource limits, and adding security/observability hooks.

## Components

1. **Worker Pool:** maintains `min(2, cpuCount)` warm QuickJS workers, recycles contexts after N scripts or contamination, measures utilization.
2. **Script + Compilation Cache:** caches transpiled TypeScript and QuickJS bytecode keyed by script hash; invalidates on hash change.
3. **Resource Monitor:** enforces limits (size, call count, concurrency, runtime, memory). Exceeding limits throws structured errors linking to docs.
4. **Security/Fuzz Tests:** attempt banned tokens, prototype pollution, runaway loops, log spam; ensure deterministic failures.
5. **Metrics & Logging:** emit pool stats, cache hit rate, script durations, error categories.
