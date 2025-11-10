import { describe, expect, it } from "bun:test";
import { ResponsesClient } from "../../src/client/responses";
import { ResponsesRequest } from "../../src/client/types";

type AuthDetails = {
  token: string;
  accountId?: string;
};

function buildSse(events: string[]): ReadableStream<Uint8Array> {
  const text = events.join("") + "\n";
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function buildChunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
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

function createClientWithReadable(
  streamFactory: () => ReadableStream<Uint8Array>,
  auth: AuthDetails = { token: "test-token" },
) {
  const calls: Array<{ input: RequestInfo; init?: RequestInit }> = [];
  const fetchMock: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(streamFactory(), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  const client = new ResponsesClient({
    baseUrl: "https://example.test",
    fetchImpl: fetchMock,
    authProvider: async () => auth,
  });

  return { client, calls };
}

function createClientWithStream(events: string[], auth?: AuthDetails) {
  return createClientWithReadable(() => buildSse(events), auth);
}

function responseOutputItemDone(payload: unknown) {
  return `event: response.output_item.done\ndata: ${JSON.stringify(payload)}\n\n`;
}

function responseCompleted(payload: unknown) {
  return `event: response.completed\ndata: ${JSON.stringify(payload)}\n\n`;
}

describe("ResponsesClient", () => {
  it("sends POST /v1/responses with bearer token", async () => {
    const events = [
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "hi" }],
        },
      }),
      "data: [DONE]\n\n",
    ];

    const { client, calls } = createClientWithStream(events);

    const request: ResponsesRequest = {
      model: "gpt-5-codex",
      messages: [],
    };

    const stream = await client.create(request);
    for await (const _ of stream) {
      // exhaust iterator
    }

    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.input).toBe("https://example.test/v1/responses");
    expect(call.init?.method).toBe("POST");
    expect(call.init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "OpenAI-Beta": "responses=experimental",
      "Codex-Task-Type": "agent",
    });
    const body = JSON.parse(String(call.init?.body));
    expect(body).toEqual({
      model: "gpt-5-codex",
      input: [],
    });
  });

  it("includes chatgpt-account-id header when provided", async () => {
    const { client, calls } = createClientWithStream(
      [
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "hi" }],
        },
      }),
      "data: [DONE]\n\n",
    ],
      {
        token: "test-token",
        accountId: "acct_123",
      },
    );

    const stream = await client.create({ model: "gpt-5-codex", messages: [] });
    for await (const _ of stream) {
      // exhaust iterator
    }

    const call = calls[0];
    expect(call.init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "chatgpt-account-id": "acct_123",
      "Codex-Task-Type": "agent",
    });
  });

  it("builds ChatGPT payload keeping model/instructions but removing disallowed content", async () => {
    // Capture request body
    const calls: Array<{ input: RequestInfo; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      // Return a minimal SSE stream that immediately completes
      const events = [
        responseOutputItemDone({
          type: "response.output_item.done",
          item: { type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] },
        }),
        "data: [DONE]\n\n",
      ];
      return new Response(buildSse(events), { status: 200, headers: { "content-type": "text/event-stream" } });
    };

    const client = new ResponsesClient({
      fetchImpl: fetchMock,
      authProvider: async () => ({ token: "oauth", accountId: "acct" }),
    });

    const request: ResponsesRequest = {
      model: "gpt-5-codex",
      instructions: "system text to strip",
      messages: [
        { role: "system", content: [{ type: "text", text: "should be removed" }] },
        { role: "user", content: [{ type: "input_text", text: "hello" }] },
      ],
      tools: [
        {
          type: "function",
          name: "read_file",
          description: "reads file",
          strict: false,
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
          },
        },
      ],
      parallel_tool_calls: false,
      max_output_tokens: 123,
      store: false,
      stream: true,
      tool_choice: "auto",
    };

    const stream = await client.create(request);
    for await (const _ of stream) {
      // exhaust
    }

    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body).toEqual({
      instructions: "system text to strip",
      model: "gpt-5-codex",
      tool_choice: "auto",
      parallel_tool_calls: false,
      store: false,
      stream: true,
      tools: [
        {
          type: "function",
          name: "read_file",
          description: "reads file",
          strict: false,
          parameters: {
            type: "object",
            properties: { path: { type: "string" } },
          },
        },
      ],
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: "system text to strip" }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
        },
      ],
    });
  });

  it("yields assistant messages from SSE stream", async () => {
    const events = [
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          id: "msg_1",
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "Hello" },
            { type: "output_text", text: " world" },
          ],
        },
      }),
      responseCompleted({
        type: "response.completed",
        response: { id: "resp_1" },
      }),
      "data: [DONE]\n\n",
    ];

    const { client } = createClientWithStream(events);

    const stream = await client.create({
      model: "gpt-5-codex",
      messages: [],
    });

    const items = [];
    for await (const item of stream) {
      items.push(item);
    }

    expect(items).toEqual([
      {
        id: "msg_1",
        role: "assistant",
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: " world" },
        ],
      },
    ]);
  });

  it("parses tool_use events with JSON arguments", async () => {
    const events = [
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          call_id: "call_123",
          name: "read_file",
          arguments: JSON.stringify({ path: "/tmp/file.txt" }),
        },
      }),
      responseCompleted({
        type: "response.completed",
        response: { id: "resp_1" },
      }),
      "data: [DONE]\n\n",
    ];

    const { client } = createClientWithStream(events);

    const stream = await client.create({
      model: "gpt-5-codex",
      messages: [],
    });

    const items = [];
    for await (const item of stream) {
      items.push(item);
    }

    expect(items).toEqual([
      {
        type: "tool_use",
        name: "read_file",
        call_id: "call_123",
        input: { path: "/tmp/file.txt" },
      },
    ]);
  });

  it("records token usage from response.completed", async () => {
    const events = [
      responseOutputItemDone({
        type: "response.output_item.done",
        item: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "ok" }],
        },
      }),
      responseCompleted({
        type: "response.completed",
        response: {
          id: "resp_1",
          usage: {
            input_tokens: 12,
            output_tokens: 8,
            total_tokens: 20,
          },
        },
      }),
      "data: [DONE]\n\n",
    ];

    const { client } = createClientWithStream(events);

    const stream = await client.create({
      model: "gpt-5-codex",
      messages: [],
    });

    for await (const _ of stream) {
      // exhaust
    }

    expect(stream.usage).toEqual({
      input_tokens: 12,
      output_tokens: 8,
      total_tokens: 20,
    });
  });

  it("throws on non-2xx responses", async () => {
    const fetchMock: typeof fetch = async () =>
      new Response("nope", { status: 401 });

    const client = new ResponsesClient({
      baseUrl: "https://example.test",
      fetchImpl: fetchMock,
      tokenProvider: async () => "token",
    });

    const request: ResponsesRequest = {
      model: "gpt-5-codex",
      messages: [],
    };

    await expect(client.create(request)).rejects.toThrow(
      "Request failed with status 401",
    );
  });

  it("handles chunked SSE data across reads", async () => {
    const itemPayload = {
      type: "response.output_item.done",
      item: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Segmented event" }],
      },
    };

    const completionPayload = {
      type: "response.completed",
      response: {
        id: "resp_chunk",
        usage: {
          input_tokens: 4,
          output_tokens: 6,
          total_tokens: 10,
        },
      },
    };

    const itemJson = JSON.stringify(itemPayload);
    const completionJson = JSON.stringify(completionPayload);

    const chunks = [
      "event: response.output_item.done\n",
      `data: ${itemJson.slice(0, 40)}`,
      itemJson.slice(40, 80),
      itemJson.slice(80) + "\n\n",
      "event: response.completed\n",
      `data: ${completionJson.slice(0, 30)}`,
      completionJson.slice(30, 60),
      completionJson.slice(60) + "\n\n",
      "data: [DONE]\n\n",
    ];

    const { client } = createClientWithReadable(() => buildChunkedStream(chunks));

    const stream = await client.create({
      model: "gpt-5-codex",
      messages: [],
    });

    const items = [];
    for await (const item of stream) {
      items.push(item);
    }

    expect(items).toEqual([
      {
        role: "assistant",
        content: [{ type: "text", text: "Segmented event" }],
      },
    ]);

    expect(stream.usage).toEqual({
      input_tokens: 4,
      output_tokens: 6,
      total_tokens: 10,
    });
  });

  it("preserves tool outputs in follow-up payload input", async () => {
    const calls: Array<{ input: RequestInfo; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      const events = [
        responseOutputItemDone({
          type: "response.output_item.done",
          item: { type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] },
        }),
        "data: [DONE]\n\n",
      ];
      return new Response(buildSse(events), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    };

    const client = new ResponsesClient({
      fetchImpl: fetchMock,
      authProvider: async () => ({ token: "oauth-token" }),
    });

    const request: ResponsesRequest = {
      model: "gpt-5-codex",
      instructions: "system guidance",
      messages: [
        { role: "system", content: [{ type: "text", text: "redundant system message" }] },
        { role: "user", content: [{ type: "input_text", text: "Review the README" }] },
        {
          role: "assistant",
          content: [
            {
              type: "tool_call",
              id: "call-previous",
              name: "read_file",
              input: { file_path: "/repo/README.md" },
            } as any,
          ],
        },
        {
          role: "tool",
          tool_call_id: "call-previous",
          content: [{ type: "output_text", text: "Earlier listing output" }],
        },
      ],
      tools: [],
      stream: true,
      tool_choice: "auto",
      input: [
        {
          type: "function_call",
          name: "read_file",
          call_id: "call-1",
          arguments: JSON.stringify({ file_path: "/repo/README.md" }),
        },
        {
          type: "function_call_output",
          call_id: "call-1",
          output: "L1: README heading",
        },
      ],
    };

    const stream = await client.create(request);
    for await (const _ of stream) {
      // exhaust iterator
    }

    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(Array.isArray(body.input)).toBe(true);
    expect(body.input).toHaveLength(6);
    expect(body.input[0]).toEqual({
      role: "system",
      content: [{ type: "input_text", text: "system guidance" }],
    });
    expect(body.input[1]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "Review the README" }],
    });
    expect(body.input[2]).toEqual({
      type: "function_call",
      name: "read_file",
      call_id: "call-previous",
      arguments: JSON.stringify({ file_path: "/repo/README.md" }),
    });
    expect(body.input[3]).toEqual({
      type: "function_call_output",
      call_id: "call-previous",
      output: "Earlier listing output",
    });
    expect(body.input[4]).toEqual({
      type: "function_call",
      name: "read_file",
      call_id: "call-1",
      arguments: JSON.stringify({ file_path: "/repo/README.md" }),
    });
    expect(body.input[5]).toEqual({
      type: "function_call_output",
      call_id: "call-1",
      output: "L1: README heading",
    });
  });

});
