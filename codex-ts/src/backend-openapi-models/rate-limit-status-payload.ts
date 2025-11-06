import type { PlanType } from "./plan-type";
import type { RateLimitStatusDetails } from "./rate-limit-status-details";

/**
 * Rate limit status payload
 * Generated from OpenAPI schema
 */
export interface RateLimitStatusPayload {
  plan_type: PlanType;
  rate_limit?: RateLimitStatusDetails | null;
}
