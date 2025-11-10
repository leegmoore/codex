import { describe, expect, it } from "bun:test";
import {
  ContextWindowExceededError,
  ResponsesStreamError,
  ResponsesClientV2,
  parseResponsesStream,
} from "../../src/client-v2/responses";
import type { PromptV2Request } from "../../src/agent-v2/prompt";
import type { ResponseEvent } from "../../src/protocol/types";

function buildSse(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.join("") + "\n";
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
}

function buildChunkedSse(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

function responseOutputItemDone(payload: unknown): string {
  return `event: response.output_item.done\ndata: ${JSON.stringify(payload)}\n\n`;
}

function responseCompleted(payload: unknown): string {
  return `event: response.completed\ndata: ${JSON.stringify(payload)}\n\n`;
}

function responseFailed(payload: unknown): string {
  return `event: response.failed\ndata: ${JSON.stringify(payload)}\n\n`;
}

function responseCreated(payload: unknown): string {
  return `event: response.created\ndata: ${JSON.stringify(payload)}\n\n`;
}

function responseEvent(kind: string, payload?: unknown): string {
  if (payload === undefined) {
    return `event: ${kind}\n\n`;
  }
  return `event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function minimalResponseEvents(
  responseId: string = "resp-v2",
  text: string = "ok",
): string[] {
  return [
    responseOutputItemDone({
      type: "response.output_item.done",
      item: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    }),
    responseCompleted({
      type: "response.completed",
      response: { id: responseId },
    }),
  ];
}

async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<{
  events: ResponseEvent[];
  error: Error | null;
}> {
  const events: ResponseEvent[] = [];
  let error: Error | null = null;

  try {
    for await (const event of parseResponsesStream(stream)) {
      events.push(event);
    }
  } catch (err) {
    error = err as Error;
  }

  return { events, error };
}

describe("parseResponsesStream", () => {
  it("parses output_item.done events and final completed envelope", async () => {
    const sse = buildSse([
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello" }],
        },
      }),
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "World" }],
        },
      }),
      responseCompleted({
        type: "response.completed",
        response: { id: "resp1" },
      }),
    ]);

    const { events, error } = await collectEvents(sse);

    expect(error).toBeNull();
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: "output_item.done",
      item: { type: "message", role: "assistant" },
    });
    expect(events[1]).toMatchObject({
      type: "output_item.done",
      item: { type: "message", role: "assistant" },
    });
    expect(events[2]).toEqual({
      type: "completed",
      responseId: "resp1",
      tokenUsage: null,
    });
  });

  it("handles SSE payload split across network chunks", async () => {
    const sse = buildChunkedSse([
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello" }],
        },
      }),
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "World" }],
        },
      }),
      responseCompleted({
        type: "response.completed",
        response: { id: "resp-chunked" },
      }),
    ]);

    const { events, error } = await collectEvents(sse);

    expect(error).toBeNull();
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: "output_item.done",
      item: { type: "message", role: "assistant" },
    });
    expect(events[1]).toMatchObject({
      type: "output_item.done",
      item: { type: "message", role: "assistant" },
    });
    expect(events[2]).toEqual({
      type: "completed",
      responseId: "resp-chunked",
      tokenUsage: null,
    });
  });

  it("reports an error when response.completed is missing", async () => {
    const sse = buildSse([
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello" }],
        },
      }),
    ]);

    const { events, error } = await collectEvents(sse);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "output_item.done",
    });
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("stream closed before response.completed");
  });

  it("propagates response.failed errors with retry delay", async () => {
    const rawError = {
      type: "response.failed",
      response: {
        id: "resp_failed",
        error: {
          code: "rate_limit_exceeded",
          message:
            "Rate limit reached for gpt-5 in organization org-AAA on tokens per min (TPM): Limit 30000, Used 22999, Requested 12528. Please try again in 11.054s. Visit https://platform.openai.com/account/rate-limits to learn more.",
        },
      },
    };

    const sse = buildSse([responseFailed(rawError)]);
    const { events, error } = await collectEvents(sse);

    expect(events).toHaveLength(0);
    expect(error).toBeInstanceOf(ResponsesStreamError);
    const streamError = error as ResponsesStreamError;
    expect(streamError.message).toBe(
      "Rate limit reached for gpt-5 in organization org-AAA on tokens per min (TPM): Limit 30000, Used 22999, Requested 12528. Please try again in 11.054s. Visit https://platform.openai.com/account/rate-limits to learn more.",
    );
    expect(streamError.retryAfterMs).toBe(11_054);
  });

  it("treats context length errors as fatal", async () => {
    const rawError = {
      type: "response.failed",
      response: {
        id: "resp_ctx",
        error: {
          code: "context_length_exceeded",
          message:
            "Your input exceeds the context window of this model. Please adjust your input and try again.",
        },
      },
    };

    const sse = buildSse([responseFailed(rawError)]);
    const { events, error } = await collectEvents(sse);

    expect(events).toHaveLength(0);
    expect(error).toBeInstanceOf(ContextWindowExceededError);
    expect(error?.message).toBe(
      "Your input exceeds the context window of this model. Please adjust your input and try again.",
    );
  });

  it("treats context length errors containing newlines as fatal", async () => {
    const rawError = {
      type: "response.failed",
      response: {
        id: "resp_ctx_newline",
        error: {
          code: "context_length_exceeded",
          message:
            "Your input exceeds the context window of this model. Please adjust your input and try\nagain.",
        },
      },
    };

    const sse = buildSse([responseFailed(rawError)]);
    const { events, error } = await collectEvents(sse);

    expect(events).toHaveLength(0);
    expect(error).toBeInstanceOf(ContextWindowExceededError);
    expect(error?.message).toBe(
      "Your input exceeds the context window of this model. Please adjust your input and try\nagain.",
    );
  });

  it("parses delta events, web search markers, and token usage", async () => {
    const sse = buildSse([
      responseCreated({
        type: "response.created",
        response: { id: "resp-created" },
      }),
      responseEvent("response.output_text.delta", {
        type: "response.output_text.delta",
        delta: "Hello ",
      }),
      responseEvent("response.reasoning_summary_text.delta", {
        type: "response.reasoning_summary_text.delta",
        delta: "Plan",
      }),
      responseEvent("response.reasoning_text.delta", {
        type: "response.reasoning_text.delta",
        delta: "Step 1",
      }),
      responseEvent("response.reasoning_summary_part.added", {
        type: "response.reasoning_summary_part.added",
      }),
      responseEvent("response.output_item.added", {
        type: "response.output_item.added",
        item: {
          type: "web_search_call",
          id: "search-1",
        },
      }),
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello world" }],
        },
      }),
      responseCompleted({
        type: "response.completed",
        response: {
          id: "resp-final",
          usage: {
            input_tokens: 12,
            input_tokens_details: null,
            output_tokens: 8,
            output_tokens_details: null,
            total_tokens: 20,
          },
        },
      }),
    ]);

    const { events, error } = await collectEvents(sse);

    expect(error).toBeNull();
    expect(events.map((ev) => ev.type)).toEqual([
      "created",
      "output_text.delta",
      "reasoning_summary.delta",
      "reasoning_content.delta",
      "reasoning_summary.part_added",
      "web_search_call.begin",
      "output_item.done",
      "completed",
    ]);

    const usageEvent = events.at(-1);
    expect(usageEvent).toMatchObject({
      type: "completed",
      responseId: "resp-final",
      tokenUsage: {
        input_tokens: 12,
        output_tokens: 8,
        total_tokens: 20,
      },
    });
  });

  it("handles event kinds consistently", async () => {
    const completed = {
      type: "response.completed",
      response: {
        id: "resp-completed",
        usage: {
          input_tokens: 0,
          input_tokens_details: null,
          output_tokens: 0,
          output_tokens_details: null,
          total_tokens: 0,
        },
      },
    };

    const cases: Array<{
      name: string;
      event: { type: string; [key: string]: unknown };
      expectedTypes: string[];
    }> = [
      {
        name: "created",
        event: {
          type: "response.created",
          response: {},
        },
        expectedTypes: ["created", "completed"],
      },
      {
        name: "output_item.done",
        event: {
          type: "response.output_item.done",
          item: {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "hi" }],
          },
        },
        expectedTypes: ["output_item.done", "completed"],
      },
      {
        name: "unknown",
        event: {
          type: "response.new_tool_event",
        },
        expectedTypes: ["completed"],
      },
    ];

    for (const testCase of cases) {
      const sse = buildSse([
        responseEvent(testCase.event.type, testCase.event),
        responseCompleted(completed),
      ]);

      const { events: parsed, error } = await collectEvents(sse);
      expect(error).toBeNull();
      expect(parsed.map((ev) => ev.type)).toEqual(testCase.expectedTypes);
    }
  });

  it("emits rate limit snapshots", async () => {
    const snapshot = {
      type: "response.rate_limits.updated",
      rate_limits: {
        primary: { used_percent: 12.5 },
      },
    };

    const sse = buildSse([
      responseEvent("response.rate_limits.updated", snapshot),
      responseCompleted({
        type: "response.completed",
        response: { id: "resp-rate", usage: null },
      }),
    ]);

    const { events, error } = await collectEvents(sse);

    expect(error).toBeNull();
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: "rate_limits", snapshot });
    expect(events[1]).toEqual({
      type: "completed",
      responseId: "resp-rate",
      tokenUsage: null,
    });
  });
});

type AuthDetails = {
  token: string;
  accountId?: string;
};

function createClientWithReadable(
  streamFactory: () => ReadableStream<Uint8Array>,
  auth: AuthDetails = { token: "test-token" },
  options: { baseUrl?: string } = {},
) {
  const calls: Array<{ input: RequestInfo; init?: RequestInit }> = [];

  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(streamFactory(), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  const client = new ResponsesClientV2({
    fetchImpl: fetchMock,
    authProvider: async () => auth,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });

  return { client, calls };
}

function createClientWithEvents(
  events: string[],
  auth: AuthDetails = { token: "test-token" },
  options: { baseUrl?: string } = {},
) {
  return createClientWithReadable(() => buildSse(events), auth, options);
}

async function drainStream(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of stream) {
    // exhaust iterator
  }
}

describe("ResponsesClientV2", () => {
  const baseRequest: PromptV2Request = {
    model: "gpt-5-codex",
    instructions: "system prompt",
    input: [],
    tools: [],
    parallel_tool_calls: false,
    max_output_tokens: 8_000,
    store: false,
    stream: true,
    tool_choice: "auto",
  };

  it("sends POST to ChatGPT endpoint with bearer token and SSE headers", async () => {
    const { client, calls } = createClientWithEvents(minimalResponseEvents(), {
      token: "test-token",
    });

    const stream = await client.create(baseRequest);
    await drainStream(stream);

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.input).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "OpenAI-Beta": "responses=experimental",
      "Codex-Task-Type": "agent",
    });

    const body = JSON.parse(String(call.init?.body));
    expect(body).toMatchObject({
      model: baseRequest.model,
      instructions: baseRequest.instructions,
      input: [],
      parallel_tool_calls: false,
      store: false,
      stream: true,
      tool_choice: "auto",
    });
    expect(body.max_output_tokens).toBeUndefined();
  });

  it("includes chatgpt-account-id header when provided", async () => {
    const { client, calls } = createClientWithEvents(minimalResponseEvents(), {
      token: "token-with-account",
      accountId: "acct_456",
    });

    const stream = await client.create(baseRequest);
    await drainStream(stream);

    const call = calls[0];
    expect(call.init?.headers).toMatchObject({
      Authorization: "Bearer token-with-account",
      "chatgpt-account-id": "acct_456",
      "Codex-Task-Type": "agent",
    });
  });

  it("reuses the last non-empty instructions when omitted", async () => {
    const eventsQueue = [minimalResponseEvents("resp-first", "first"), minimalResponseEvents("resp-second", "second")];
    const calls: Array<{ input: RequestInfo; init?: RequestInit }> = [];

    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      const events = eventsQueue.shift() ?? minimalResponseEvents("fallback", "fallback");
      return new Response(buildSse(events), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    };

    const client = new ResponsesClientV2({
      fetchImpl: fetchMock,
      authProvider: async () => ({ token: "persist-token" }),
    });

    const firstRequest = { ...baseRequest, instructions: "keep me" };
    const firstStream = await client.create(firstRequest);
    await drainStream(firstStream);

    const secondRequest: PromptV2Request = {
      ...baseRequest,
      instructions: "",
    };
    const secondStream = await client.create(secondRequest);
    await drainStream(secondStream);

    expect(calls).toHaveLength(2);
    const firstBody = JSON.parse(String(calls[0]!.init!.body));
    const secondBody = JSON.parse(String(calls[1]!.init!.body));
    expect(firstBody.instructions).toBe("keep me");
    expect(secondBody.instructions).toBe("keep me");
  });

  it("retains OpenAI-specific payload fields when targeting api.openai.com", async () => {
    const { client, calls } = createClientWithEvents(minimalResponseEvents(), { token: "openai-token" }, { baseUrl: "https://api.openai.com" });

    const request = {
      ...baseRequest,
      max_output_tokens: 4_000,
    } as PromptV2Request & { previous_response_id?: string };
    request.previous_response_id = "resp-prev";

    const stream = await client.create(request);
    await drainStream(stream);

    const call = calls[0];
    expect(call.input).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(call.init?.body));
    expect(body.max_output_tokens).toBe(4_000);
    expect(body.previous_response_id).toBe("resp-prev");
  });

  it("serializes function_call_output payloads as strings while preserving structured content", async () => {
    const toolResult = {
      type: "function_call_output" as const,
      call_id: "call-1",
      output: {
        content: "tool-output",
        success: true,
        structured_content: { foo: "bar" },
      },
    };

    const request: PromptV2Request = {
      ...baseRequest,
      input: [toolResult],
    };

    const { client, calls } = createClientWithEvents(minimalResponseEvents());

    const stream = await client.create(request);
    await drainStream(stream);

    expect(request.input[0]).toEqual(toolResult);
    expect(request.input[0]?.output).toEqual({
      content: "tool-output",
      success: true,
      structured_content: { foo: "bar" },
    });

    const call = calls[0];
    const body = JSON.parse(String(call.init?.body));
    expect(body.input).toEqual([
      {
        type: "function_call_output",
        call_id: "call-1",
        output: "tool-output",
      },
    ]);
  });
});
