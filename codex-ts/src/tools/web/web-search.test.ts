/**
 * Tests for the live web search tool.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { webSearch } from "./web-search.js";

global.fetch = vi.fn();

describe("webSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PERPLEXITY_API_KEY = "test-key";
  });

  it("throws when PERPLEXITY_API_KEY is missing", async () => {
    delete process.env.PERPLEXITY_API_KEY;
    await expect(webSearch({ query: "test" })).rejects.toThrow(
      "PERPLEXITY_API_KEY environment variable not set",
    );
  });

  it("requests Perplexity search API and maps results", async () => {
    const mockResponse = {
      results: [
        {
          url: "https://example.com",
          title: "Example Domain",
          snippet: "An example snippet",
          score: 0.9,
        },
        {
          link: "https://foo.test/path",
          description: "Secondary result",
        },
      ],
    };

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await webSearch({ query: "latest ai news", maxResults: 5 });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      url: "https://example.com",
      title: "Example Domain",
      snippet: "An example snippet",
    });
    expect(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0],
    ).toContain("api.perplexity.ai/search");
  });

  it("throws descriptive error on API failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    await expect(webSearch({ query: "test" })).rejects.toThrow(
      /Perplexity search API error/i,
    );
  });

  it("clamps maxResults to allowed bounds", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await webSearch({ query: "clamp test", maxResults: 99 });

    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
        .body as string,
    );
    expect(body.top_k).toBe(25);
  });
});
