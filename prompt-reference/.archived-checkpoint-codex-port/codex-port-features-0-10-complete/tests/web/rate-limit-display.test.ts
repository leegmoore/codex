import { describe, expect, it } from "bun:test";

import { createRateLimitDisplay } from "../../web/rate-limit-display.js";

function createStubElement() {
  return { textContent: "" };
}

describe("createRateLimitDisplay", () => {
  it("formats rate limit snapshots into a readable summary", () => {
    const element = createStubElement();
    const update = createRateLimitDisplay(element);

    update({
      total_tokens: { limit: 90_000, remaining: 80_000, interval: "1m" },
      requests: { limit: 300, remaining: 280, interval: "1m" },
    });

    expect(element.textContent).toBe(
      "Rate limits · total_tokens 80,000 / 90,000 (1m) · requests 280 / 300 (1m)",
    );

    update(null);
    expect(element.textContent).toBe("");
  });

  it("ignores malformed entries while preserving known values", () => {
    const element = createStubElement();
    const update = createRateLimitDisplay(element);

    update({
      total_tokens: { limit: 100, remaining: 10 },
      unexpected: { foo: "bar" },
      requests_per_minute: { limit: "NaN", remaining: 0 },
    });

    expect(element.textContent).toBe("Rate limits · total_tokens 10 / 100");
  });
});
