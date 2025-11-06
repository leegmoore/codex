/**
 * Rate limit window snapshot
 * Generated from OpenAPI schema
 */
export interface RateLimitWindowSnapshot {
  used_percent: number;
  limit_window_seconds: number;
  reset_after_seconds: number;
  reset_at: number;
}
