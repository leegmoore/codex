import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendResponsesRequest } from "../../src/core/client/responses/client.js";
import { WireApi, type ModelProviderInfo } from "../../src/core/client/model-provider-info.js";
import type { Prompt } from "../../src/core/client/client-common.js";
import { ReasoningSummary } from "../../src/protocol/config-types.js";
import type { ResponseItem } from "../../src/protocol/models.js";

describe("ResponsesClient Adapter (HTTP-level)", () => {
  const provider: ModelProviderInfo = {
    name: "Test Provider",
    baseUrl: "https://example.com/v1",
    wireApi: WireApi.Responses,
    requiresOpenaiAuth: true,
  };

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function createPrompt(): Prompt {
    return {
      input: [],
      tools: [],
      parallelToolCalls: false,
    } satisfies Prompt;
  }

  function createOptions(overrides: Partial<Parameters<typeof sendResponsesRequest>[1]> = {}) {
    return {
      provider,
      model: "gpt-5-codex",
      apiKey: "test-key",
      reasoningSummary: ReasoningSummary.Auto,
      ...overrides,
    } satisfies Parameters<typeof sendResponsesRequest>[1];
  }

  function mockApiResponse(output: unknown[]): void {
    const payload = {
      id: "resp_test",
      object: "response",
      created_at: Date.now(),
      status: "completed",
      output,
      usage: { total_tokens: 100 },
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(payload),
      } as Response) as unknown as typeof fetch;
  }

  it("maps message items correctly", async () => {
    mockApiResponse([
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Hello!" }],
      },
    ]);

    const items = await sendResponsesRequest(createPrompt(), createOptions());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject<Partial<ResponseItem>>({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Hello!" }],
    });
  });

  it("maps reasoning items correctly", async () => {
    mockApiResponse([
      {
        type: "reasoning",
        id: "rs_123",
        summary: [{ type: "summary_text", text: "I'm thinking..." }],
        content: [{ type: "reasoning_text", text: "Detailed thoughts..." }],
      },
    ]);

    const items = await sendResponsesRequest(createPrompt(), createOptions());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject<Partial<ResponseItem>>({
      type: "reasoning",
      summary: [{ type: "summary_text", text: "I'm thinking..." }],
      content: [{ type: "reasoning_text", text: "Detailed thoughts..." }],
    });
  });

  it("maps function_call items correctly", async () => {
    mockApiResponse([
      {
        type: "function_call",
        id: "fc_456",
        call_id: "call-abc",
        name: "exec",
        arguments: JSON.stringify({ cmd: ["ls"] }),
        status: "completed",
      },
    ]);

    const items = await sendResponsesRequest(createPrompt(), createOptions());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject<Partial<ResponseItem>>({
      type: "function_call",
      call_id: "call-abc",
      name: "exec",
    });
    if (items[0].type === "function_call") {
      expect(items[0].arguments).toContain("ls");
    }
  });

  it("maps function_call_output items correctly", async () => {
    mockApiResponse([
      {
        type: "function_call_output",
        call_id: "call-out",
        output: {
          content: "Command completed",
          success: true,
        },
      },
    ]);

    const items = await sendResponsesRequest(createPrompt(), createOptions());

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject<Partial<ResponseItem>>({
      type: "function_call_output",
      call_id: "call-out",
      output: {
        content: "Command completed",
        success: true,
      },
    });
  });

  it("maps mixed responses in order", async () => {
    mockApiResponse([
      {
        type: "reasoning",
        summary: [{ type: "summary_text", text: "Thinking" }],
      },
      {
        type: "function_call",
        call_id: "call-xyz",
        name: "exec",
        arguments: JSON.stringify({ cmd: ["pwd"] }),
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Done" }],
      },
    ]);

    const items = await sendResponsesRequest(createPrompt(), createOptions());

    expect(items.map((item) => item.type)).toEqual([
      "reasoning",
      "function_call",
      "message",
    ]);
  });

  it("handles empty output arrays", async () => {
    mockApiResponse([]);

    const items = await sendResponsesRequest(createPrompt(), createOptions());

    expect(items).toHaveLength(0);
  });
});
