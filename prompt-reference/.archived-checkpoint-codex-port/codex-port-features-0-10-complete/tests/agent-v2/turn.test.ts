import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { PromptV2Request } from "../../src/agent-v2/prompt";
import { constructPromptV2 } from "../../src/agent-v2/prompt";
import { runTurnStreamV2, runTurnV2, type RunTurnV2Options } from "../../src/agent-v2/turn";
import { appendHistory, createSession, loadSession } from "../../src/agent-v2/session";
import {
  ContextWindowExceededError,
  ResponsesStreamError,
  type ResponsesEventStream,
} from "../../src/client-v2/responses";
import type { ResponseEvent, ResponseItem, TokenUsage } from "../../src/protocol/types";

const ORIGINAL_DATA_DIR = process.env.CODEX_PORT_DATA_DIR;

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "codex-v2-turn-test-"));
  process.env.CODEX_PORT_DATA_DIR = dataDir;
});

describe("runTurnStreamV2", () => {
  it("streams deltas, assistant messages, and usage", async () => {
    await createSession("stream-session-v2", {
      instructions: "stream please",
      now: () => new Date("2025-10-26T14:00:00Z"),
    });

    const assistantItem = makeAssistantMessage("Streaming reply ready");

    const usage: TokenUsage = {
      input_tokens: 21,
      output_tokens: 13,
      total_tokens: 34,
    };

    const responsesClient = new StubResponsesClient([
      {
        events: [
          { type: "created" },
          { type: "output_text.delta", delta: "Hello " },
          { type: "output_text.delta", delta: "world" },
          { type: "output_item.done", item: assistantItem },
          { type: "completed", responseId: "resp-stream", tokenUsage: usage },
        ],
      },
    ]);

    const toolRouter = createStubToolRouter();

    const emitted: Array<ResponseItem | { type: string; [key: string]: unknown }> = [];
    for await (const event of runTurnStreamV2("stream-session-v2", "Begin stream", {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    })) {
      emitted.push(event as ResponseItem | { type: string; [key: string]: unknown });
    }

    expect(emitted).toEqual([
      { type: "output_text.delta", delta: "Hello " },
      { type: "output_text.delta", delta: "world" },
      assistantItem,
      { type: "usage", usage },
    ]);

    const persisted = await loadSession("stream-session-v2");
    expect(persisted.items).toEqual([makeUserMessage("Begin stream"), assistantItem]);

    expect(toolRouter.dispatchToolCall).not.toHaveBeenCalled();

    const history = await loadHistoryLines(dataDir);
    expect(history).toHaveLength(1);
  });

  it("dispatches tool calls and streams tool outputs before final usage", async () => {
    await createSession("stream-tools-v2", {
      instructions: "tools allowed",
      now: () => new Date("2025-10-26T14:30:00Z"),
    });

    const functionCall: ResponseItem = {
      type: "function_call",
      name: "list_dir",
      arguments: JSON.stringify({ dir_path: "." }),
      call_id: "call-stream",
    };

    const toolResult: ResponseItem = {
      type: "function_call_output",
      call_id: "call-stream",
      output: {
        content: JSON.stringify({ files: ["README.md"] }),
        success: true,
      },
    };

    const assistantItem = makeAssistantMessage("Directory listed");

    const usage: TokenUsage = {
      input_tokens: 40,
      output_tokens: 15,
      total_tokens: 55,
    };

    const toolRouter = createStubToolRouter();
    toolRouter.dispatchToolCall.mockResolvedValue(toolResult);

    const responsesClient = new StubResponsesClient([
      {
        events: [
          { type: "output_item.done", item: functionCall },
          { type: "completed", responseId: "resp-tool-1", tokenUsage: null },
        ],
      },
      {
        events: [
          { type: "output_item.done", item: assistantItem },
          { type: "completed", responseId: "resp-tool-2", tokenUsage: usage },
        ],
      },
    ]);

    const emitted: Array<ResponseItem | { type: string; [key: string]: unknown }> = [];
    for await (const event of runTurnStreamV2("stream-tools-v2", "List the directory", {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    })) {
      emitted.push(event as ResponseItem | { type: string; [key: string]: unknown });
    }

    expect(toolRouter.dispatchToolCall).toHaveBeenCalledTimes(1);
    const callArgs = toolRouter.dispatchToolCall.mock.calls[0];
    expect(callArgs[3]).toBe("sub-0");
    expect(callArgs[4]).toMatchObject({
      toolName: "list_dir",
      callId: "call-stream",
      payload: { type: "function", arguments: JSON.stringify({ dir_path: "." }) },
    });

    expect(emitted).toEqual([
      functionCall,
      toolResult,
      assistantItem,
      { type: "usage", usage },
    ]);

    expect(responsesClient.requests).toHaveLength(2);
    const persisted = await loadSession("stream-tools-v2");
    expect(persisted.items).toEqual([
      makeUserMessage("List the directory"),
      functionCall,
      toolResult,
      assistantItem,
    ]);

    const history = await loadHistoryLines(dataDir);
    expect(history).toHaveLength(1);
  });

  it("forwards rate limit snapshots alongside stream events", async () => {
    await createSession("stream-rate-limits-v2", {
      instructions: "monitor limits",
      now: () => new Date("2025-10-26T15:00:00Z"),
    });

    const assistantItem = makeAssistantMessage("Continuing within limits");
    const rateLimitSnapshot = {
      total_tokens: {
        limit: 90_000,
        remaining: 80_000,
        interval: "1m",
      },
    };

    const usage: TokenUsage = {
      input_tokens: 12,
      output_tokens: 8,
      total_tokens: 20,
    };

    const responsesClient = new StubResponsesClient([
      {
        events: [
          { type: "rate_limits", snapshot: rateLimitSnapshot },
          { type: "output_item.done", item: assistantItem },
          { type: "completed", responseId: "resp-rate", tokenUsage: usage },
        ],
      },
    ]);

    const toolRouter = createStubToolRouter();

    const emitted: Array<ResponseItem | { type: string; [key: string]: unknown }> = [];
    for await (const event of runTurnStreamV2("stream-rate-limits-v2", "Check the limits", {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    })) {
      emitted.push(event as ResponseItem | { type: string; [key: string]: unknown });
    }

    expect(emitted).toEqual([
      { type: "rate_limits", snapshot: rateLimitSnapshot },
      assistantItem,
      { type: "usage", usage },
    ]);

    const persisted = await loadSession("stream-rate-limits-v2");
    expect(persisted.items).toEqual([makeUserMessage("Check the limits"), assistantItem]);
  });
});
afterEach(async () => {
  process.env.CODEX_PORT_DATA_DIR = ORIGINAL_DATA_DIR;
  await rm(dataDir, { recursive: true, force: true });
});

class StubResponsesStream implements ResponsesEventStream {
  public responseId: string | null;

  constructor(
    private readonly events: ResponseEvent[],
    options: { responseId?: string | null; failAtIndex?: number | null; failError?: Error | null } = {},
  ) {
    this.responseId = options.responseId ?? null;
    this.failAtIndex = options.failAtIndex ?? null;
    this.failError = options.failError ?? null;
  }

  private readonly failAtIndex: number | null;
  private readonly failError: Error | null;

  async *[Symbol.asyncIterator](): AsyncIterator<ResponseEvent> {
    for (let index = 0; index < this.events.length; index += 1) {
      if (this.failAtIndex !== null && index === this.failAtIndex) {
        throw this.failError ?? new Error("stream failure");
      }

      const event = this.events[index]!;
      if (event.type === "completed") {
        this.responseId = event.responseId;
      }
      yield event;
    }

    if (this.failAtIndex !== null && this.failAtIndex >= this.events.length) {
      throw this.failError ?? new Error("stream failure");
    }
  }
}

interface StreamPlan {
  events?: ResponseEvent[];
  responseId?: string | null;
  error?: Error;
  failAtIndex?: number;
  failError?: Error;
}

class StubResponsesClient {
  public readonly plans: StreamPlan[];
  public readonly requests: PromptV2Request[] = [];
  private callIndex = 0;

  constructor(plans: StreamPlan[]) {
    this.plans = plans;
  }

  async create(request: PromptV2Request): Promise<ResponsesEventStream> {
    this.requests.push(request);
    const plan = this.plans[this.callIndex] ?? this.plans[this.plans.length - 1];
    this.callIndex += 1;
    if (plan.error) {
      throw plan.error;
    }

    const events = plan.events ?? [];
    return new StubResponsesStream(events, {
      responseId: plan.responseId ?? null,
      failAtIndex: plan.failAtIndex ?? null,
      failError: plan.failError ?? null,
    });
  }
}

function createStubToolRouter() {
  const dispatch = mock(async () => {
    throw new Error("Unexpected tool call");
  });

  return {
    specs: () => [] as unknown[],
    toolSupportsParallel: () => false,
    dispatchToolCall: dispatch,
  };
}

async function loadHistoryLines(baseDir: string): Promise<string[]> {
  try {
    const historyPath = join(baseDir, "history.jsonl");
    const content = await readFile(historyPath, "utf-8");
    return content.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function makeUserMessage(text: string): ResponseItem {
  return {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
  };
}

function makeAssistantMessage(text: string): ResponseItem {
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

describe("runTurnV2", () => {
  it("stores assistant messages and usage results", async () => {
    await createSession("turn-session-v2", {
      instructions: "system guidance",
      now: () => new Date("2025-10-26T12:00:00Z"),
    });

    const assistantItem = makeAssistantMessage("Hello from assistant");

    const usage: TokenUsage = {
      input_tokens: 14,
      output_tokens: 9,
      total_tokens: 23,
    };

    const responsesClient = new StubResponsesClient([
      {
        events: [
          { type: "created" },
          { type: "output_item.done", item: assistantItem },
          { type: "completed", responseId: "resp-1", tokenUsage: usage },
        ],
      },
    ]);

    const toolRouter = createStubToolRouter();

    const options: RunTurnV2Options = {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    };

    const result = await runTurnV2("turn-session-v2", "Inspect README.md", options);

    expect(responsesClient.requests).toHaveLength(1);
    const [request] = responsesClient.requests;
    expect(request.input.at(-1)).toEqual(makeUserMessage("Inspect README.md"));

    const persisted = await loadSession("turn-session-v2");
    expect(persisted.items).toEqual([makeUserMessage("Inspect README.md"), assistantItem]);
    expect(result.items).toEqual(persisted.items);
    expect(result.usage).toEqual(usage);

    expect(toolRouter.dispatchToolCall).not.toHaveBeenCalled();

    const history = await loadHistoryLines(dataDir);
    expect(history).toHaveLength(1);
  });

  it("executes tool calls and submits tool outputs on follow-up request", async () => {
    await createSession("tool-turn-v2", {
      instructions: "tools ready",
      now: () => new Date("2025-10-26T12:30:00Z"),
    });

    const functionCall: ResponseItem = {
      type: "function_call",
      name: "list_dir",
      arguments: JSON.stringify({ dir_path: "/repo" }),
      call_id: "call-1",
    };

    const assistantItem = makeAssistantMessage("Directory contents listed");

    const toolRouter = createStubToolRouter();
    const toolResult: ResponseItem = {
      type: "function_call_output",
      call_id: "call-1",
      output: {
        content: JSON.stringify({ files: ["README.md"] }),
        success: true,
      },
    };
    toolRouter.dispatchToolCall.mockResolvedValue(toolResult);

    const usage: TokenUsage = {
      input_tokens: 30,
      output_tokens: 12,
      total_tokens: 42,
    };

    const responsesClient = new StubResponsesClient([
      {
        events: [
          { type: "created" },
          { type: "output_item.done", item: functionCall },
          { type: "completed", responseId: "resp-first", tokenUsage: null },
        ],
      },
      {
        events: [
          { type: "output_item.done", item: assistantItem },
          { type: "completed", responseId: "resp-second", tokenUsage: usage },
        ],
      },
    ]);

    const options: RunTurnV2Options = {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    };

    const result = await runTurnV2("tool-turn-v2", "List the repo directory", options);

    expect(toolRouter.dispatchToolCall).toHaveBeenCalledTimes(1);
    const [invocation] = toolRouter.dispatchToolCall.mock.calls;
    expect(invocation[3]).toBe("sub-0");
    expect(invocation[4]).toMatchObject({
      toolName: "list_dir",
      callId: "call-1",
      payload: { type: "function", arguments: JSON.stringify({ dir_path: "/repo" }) },
    });

    expect(responsesClient.requests).toHaveLength(2);
    const secondRequest = responsesClient.requests.at(1);
    expect(secondRequest?.input?.slice(-3)).toEqual([
      makeUserMessage("List the repo directory"),
      functionCall,
      toolResult,
    ]);

    const persisted = await loadSession("tool-turn-v2");
    expect(persisted.items).toEqual([
      makeUserMessage("List the repo directory"),
      functionCall,
      toolResult,
      assistantItem,
    ]);

    expect(result.items).toEqual(persisted.items);
    expect(result.usage).toEqual(usage);

    const history = await loadHistoryLines(dataDir);
    expect(history).toHaveLength(1);
  });

  it("appends to history when turn already persisted", async () => {
    await createSession("history-turn-v2", {
      instructions: "",
      now: () => new Date("2025-10-26T13:00:00Z"),
    });

    await appendHistory("history-turn-v2", "previous", new Date("2025-10-26T13:05:00Z"));

    const responsesClient = new StubResponsesClient([
      {
        events: [
          { type: "output_item.done", item: makeAssistantMessage("ack") },
          {
            type: "completed",
            responseId: "resp-history",
            tokenUsage: {
              input_tokens: 8,
              output_tokens: 4,
              total_tokens: 12,
            },
          },
        ],
      },
    ]);

    const toolRouter = createStubToolRouter();

    await runTurnV2("history-turn-v2", "Check status", {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    });

    const history = await loadHistoryLines(dataDir);
    expect(history).toHaveLength(2);
  });

  it("retries when the client throws and eventually succeeds", async () => {
    await createSession("retry-turn-v2", {
      instructions: "retry please",
      now: () => new Date("2025-10-26T13:30:00Z"),
    });

    const assistantItem = makeAssistantMessage("after retry");

    const responsesClient = new StubResponsesClient([
      { error: new ResponsesStreamError("temporary failure", { retryAfterMs: 0 }) },
      {
        events: [
          { type: "output_item.done", item: assistantItem },
          { type: "completed", responseId: "resp-success", tokenUsage: null },
        ],
      },
    ]);

    const toolRouter = createStubToolRouter();

    await runTurnV2("retry-turn-v2", "Trigger retry", {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    });

    expect(responsesClient.requests).toHaveLength(2);
    const persisted = await loadSession("retry-turn-v2");
    expect(persisted.items.at(-1)).toEqual(assistantItem);
  });

  it("includes prior turns when building prompts", async () => {
    await createSession("prompt-history-v2", {
      instructions: "keep it short",
      now: () => new Date("2025-10-26T14:00:00Z"),
    });

    const firstAssistant = makeAssistantMessage("First reply");
    const secondAssistant = makeAssistantMessage("Second reply");

    const responsesClient = new StubResponsesClient([
      {
        events: [
          { type: "output_item.done", item: firstAssistant },
          { type: "completed", responseId: "resp-1", tokenUsage: null },
        ],
      },
      {
        events: [
          { type: "output_item.done", item: secondAssistant },
          { type: "completed", responseId: "resp-2", tokenUsage: null },
        ],
      },
    ]);

    const toolRouter = createStubToolRouter();
    const promptSnapshots: ResponseItem[][] = [];
    const promptBuilder = (items: ResponseItem[]) => {
      promptSnapshots.push(items);
      return constructPromptV2(items);
    };

    await runTurnV2("prompt-history-v2", "first message", {
      responsesClient,
      promptBuilder,
      toolRouter,
    });

    await runTurnV2("prompt-history-v2", "second message", {
      responsesClient,
      promptBuilder,
      toolRouter,
    });

    expect(promptSnapshots).toHaveLength(2);

    const firstPrompt = promptSnapshots[0];
    expect(firstPrompt?.length).toBe(3);
    expect(firstPrompt?.[0]?.role).toBe("user");
    expect(firstPrompt?.[1]?.role).toBe("user");
    expect(firstPrompt?.[2]).toEqual(makeUserMessage("first message"));
    const instructionsText = firstPrompt?.[0]?.content?.[0]?.text ?? "";
    expect(instructionsText).toContain("<user_instructions>");
    expect(instructionsText).toContain("keep it short");

    const secondPrompt = promptSnapshots[1];
    expect(secondPrompt?.length).toBe(5);
    expect(secondPrompt?.[0]?.role).toBe("user");
    expect(secondPrompt?.[1]?.role).toBe("user");
    expect(secondPrompt?.[2]).toEqual(makeUserMessage("first message"));
    expect(secondPrompt?.[3]).toEqual(firstAssistant);
    expect(secondPrompt?.[4]).toEqual(makeUserMessage("second message"));
  });

  it("retries when the stream fails after emitting items", async () => {
    await createSession("stream-retry-v2", {
      instructions: "retry stream",
      now: () => new Date("2025-10-26T14:30:00Z"),
    });

    const partial = makeAssistantMessage("partial");
    const final = makeAssistantMessage("final");

    const responsesClient = new StubResponsesClient([
      {
        events: [partial, final].map((item) => ({ type: "output_item.done", item })),
        failAtIndex: 1,
        failError: new ResponsesStreamError("stream disconnected", { retryAfterMs: 0 }),
      },
      {
        events: [
          { type: "output_item.done", item: final },
          { type: "completed", responseId: "resp-final", tokenUsage: null },
        ],
      },
    ]);

    const toolRouter = createStubToolRouter();

    await runTurnV2("stream-retry-v2", "handle interruptions", {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    });

    expect(responsesClient.requests).toHaveLength(2);
    const persisted = await loadSession("stream-retry-v2");
    expect(persisted.items.at(-1)).toEqual(final);
  });

  it("propagates context window errors without retrying", async () => {
    await createSession("context-window-v2", {
      instructions: "",
      now: () => new Date("2025-10-26T14:45:00Z"),
    });

    const error = new ContextWindowExceededError("context window exceeded");

    const responsesClient = new StubResponsesClient([
      {
        events: [],
        failAtIndex: 0,
        failError: error,
      },
    ]);

    const toolRouter = createStubToolRouter();

    await expect(
      runTurnV2("context-window-v2", "Trigger window", {
        responsesClient,
        promptBuilder: constructPromptV2,
        toolRouter,
      }),
    ).rejects.toBe(error);

    expect(responsesClient.requests).toHaveLength(1);

    const persisted = await loadSession("context-window-v2");
    expect(persisted.items).toEqual([]);

    const history = await loadHistoryLines(dataDir);
    expect(history).toHaveLength(0);
  });

  it("propagates context window errors in streaming turns without retrying", async () => {
    await createSession("context-window-stream-v2", {
      instructions: "",
      now: () => new Date("2025-10-26T14:50:00Z"),
    });

    const error = new ContextWindowExceededError("stream window exceeded");

    const responsesClient = new StubResponsesClient([
      {
        events: [],
        failAtIndex: 0,
        failError: error,
      },
    ]);

    const toolRouter = createStubToolRouter();

    const stream = runTurnStreamV2("context-window-stream-v2", "Trigger stream window", {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    });

    await expect(stream.next()).rejects.toBe(error);
    expect(responsesClient.requests).toHaveLength(1);

    const persisted = await loadSession("context-window-stream-v2");
    expect(persisted.items).toEqual([]);

    const history = await loadHistoryLines(dataDir);
    expect(history).toHaveLength(0);
  });

  it("records tool failure results when dispatch reports errors", async () => {
    await createSession("tool-failure-v2", {
      instructions: "tools",
      now: () => new Date("2025-10-26T15:00:00Z"),
    });

    const toolCall: ResponseItem = {
      type: "function_call",
      name: "echo_tool",
      arguments: JSON.stringify({ value: 1 }),
      call_id: "fail-call",
    };

    const assistantMessage = makeAssistantMessage("Tool reported failure");

    const failureResult: ResponseItem = {
      type: "function_call_output",
      call_id: "fail-call",
      output: {
        content: 'Tool "echo_tool" execution failed: boom',
        success: false,
      },
    };

    const toolRouter = createStubToolRouter();
    toolRouter.dispatchToolCall.mockResolvedValue(failureResult);

    const responsesClient = new StubResponsesClient([
      {
        events: [
          { type: "output_item.done", item: toolCall },
          { type: "completed", responseId: "resp-tool", tokenUsage: null },
        ],
      },
      {
        events: [
          { type: "output_item.done", item: assistantMessage },
          {
            type: "completed",
            responseId: "resp-final",
            tokenUsage: {
              input_tokens: 12,
              output_tokens: 8,
              total_tokens: 20,
            },
          },
        ],
      },
    ]);

    const result = await runTurnV2("tool-failure-v2", "trigger failure", {
      responsesClient,
      promptBuilder: constructPromptV2,
      toolRouter,
    });

    expect(toolRouter.dispatchToolCall).toHaveBeenCalledTimes(1);
    expect(responsesClient.requests).toHaveLength(2);

    const persisted = await loadSession("tool-failure-v2");
    expect(persisted.items.slice(-3)).toEqual([toolCall, failureResult, assistantMessage]);
    expect(result.items.slice(-3)).toEqual([toolCall, failureResult, assistantMessage]);
  });

  it("returns failure outputs for unknown tools via the default router", async () => {
    await createSession("unknown-tool-v2", {
      instructions: "",
      now: () => new Date("2025-10-26T15:30:00Z"),
    });

    const unknownCall: ResponseItem = {
      type: "function_call",
      name: "missing_tool",
      arguments: "{}",
      call_id: "unknown-1",
    };

    const assistant = makeAssistantMessage("Tool failure acknowledged");

    const responsesClient = new StubResponsesClient([
      {
        events: [
          { type: "output_item.done", item: unknownCall },
          { type: "completed", responseId: "resp-first", tokenUsage: null },
        ],
      },
      {
        events: [
          { type: "output_item.done", item: assistant },
          { type: "completed", responseId: "resp-second", tokenUsage: null },
        ],
      },
    ]);

    const result = await runTurnV2("unknown-tool-v2", "invoke missing tool", {
      responsesClient,
      promptBuilder: constructPromptV2,
    });

    expect(responsesClient.requests).toHaveLength(2);

    const failureItem = result.items[result.items.length - 2];
    expect(failureItem).toMatchObject({
      type: "function_call_output",
      call_id: "unknown-1",
      output: {
        content: "unsupported call: missing_tool",
        success: false,
      },
    });
  });
});
