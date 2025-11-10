# Phase 5 Manual Checklist

1. Run benchmark script repeatedly; monitor CLI log for cache hit info and confirm executions stay under target latency.
2. Intentionally run script exceeding runtime limit to verify friendly error.
3. Trigger banned token (eval) and prototype pollution attempt; ensure errors match docs.
4. Inspect metrics endpoint/logs for pool utilization and cache stats.
