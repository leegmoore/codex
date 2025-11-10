# Phase 5 Test Conditions

1. Worker pool reuse: borrow/release workers and verify warm execution <20 ms.
2. Cache hit: same script twice uses cached bytecode/transpile output.
3. Cache invalidation: modified script hash causes recompilation.
4. Resource limit enforcement: oversize script, too many tool calls, long runtime, and excessive memory each trigger correct error.
5. Security fuzz: eval/Function attempts rejected; prototype pollution prevented; while(true) hits timeout; console spam rate-limited.
6. Metrics reporting: mock logger receives pool utilization + error stats.
