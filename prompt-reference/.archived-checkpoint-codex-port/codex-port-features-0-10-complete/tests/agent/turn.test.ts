import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AssistantMessageItem, StreamItem, TokenUsage, ToolUseItem } from "../../src/client/types";
import type { RunTurnOptions } from "../../src/agent/turn";
import type { SessionItem } from "../../src/agent/session";

const ORIGINAL_DATA_DIR = process.env.CODEX_PORT_DATA_DIR;

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "codex-turn-test-"));
  process.env.CODEX_PORT_DATA_DIR = dataDir;
});

afterEach(async () => {
  process.env.CODEX_PORT_DATA_DIR = ORIGINAL_DATA_DIR;
  await rm(dataDir, { recursive: true, force: true });
});

class StubResponsesStream implements AsyncIterable<StreamItem> {
  public readonly usage: TokenUsage | null;
  public readonly responseId: string | null;

  constructor(
    private readonly items: StreamItem[],
    options: { usage?: TokenUsage | null; failIndex?: number; responseId?: string | null } = {},
  ) {
    this.usage = options.usage ?? null;
    this.failIndex = options.failIndex ?? null;
    this.responseId = options.responseId ?? null;
  }

  private readonly failIndex: number | null;

  async *iterator(): AsyncGenerator<StreamItem, void, undefined> {
    for (let index = 0; index < this.items.length; index += 1) {
      if (this.failIndex !== null && index === this.failIndex) {
        throw new Error("stream failure");
      }
      yield this.items[index]!;
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamItem> {
    return this.iterator();
  }
}

interface StreamPlan {
  items?: StreamItem[];
  usage?: TokenUsage | null;
  failIndex?: number;
  error?: Error;
  responseId?: string;
}

class StubResponsesClient {
  public readonly plans: StreamPlan[];
  public callCount = 0;
  public readonly requests: unknown[] = [];

  constructor(plans: StreamPlan[]) {
    this.plans = plans;
  }

  async create(request: unknown): Promise<AsyncIterable<StreamItem> & { usage: TokenUsage | null }> {
    this.requests.push(request);
    const plan = this.plans[this.callCount] ?? this.plans[this.plans.length - 1];
    this.callCount += 1;

    if (plan.error) {
      throw plan.error;
    }

    const streamItems = plan.items ?? [];
    return new StubResponsesStream(streamItems, {
      usage: plan.usage ?? null,
      failIndex: plan.failIndex ?? null,
      responseId: plan.responseId ?? null,
    });
  }
}

async function loadHistory(baseDir: string): Promise<string[]> {
  try {
    const historyPath = join(baseDir, "history.jsonl");
    const content = await readFile(historyPath, "utf-8");
    return content.trim().split("\n");
  } catch {
    return [];
  }
}

describe("runTurn", () => {
  it("stores assistant messages and usage results", async () => {
    const { createSession, loadSession } = await import("../../src/agent/session");
    const { runTurn } = await import("../../src/agent/turn");

    await createSession("turn-session", {
      instructions: "system",
      now: () => new Date("2025-10-22T10:00:00Z"),
    });

    const assistantMessage: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "Hello from assistant" }],
    };

    const usage: TokenUsage = {
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
    };

    const responsesClient = new StubResponsesClient([
      { items: [assistantMessage], usage },
    ]);

    const capturedRequests: unknown[] = [];
    const options: RunTurnOptions = {
      responsesClient: responsesClient as any,
      promptBuilder: (items) => {
        capturedRequests.push(items);
        return {
          model: "test-model",
          messages: [],
        };
      },
    };

    const result = await runTurn("turn-session", "User message", options);

    expect(capturedRequests).toHaveLength(1);
    const promptItems = capturedRequests[0] as SessionItem[];
    expect(promptItems).toHaveLength(3);

    const [instructionsItem, environmentItem, userPromptItem] = promptItems;
    expect(instructionsItem).toEqual({
      role: "user",
      content: [
        {
          type: "input_text",
          text: expect.stringContaining("<user_instructions>"),
        },
      ],
    });
    const instructionsText = instructionsItem.content[0]?.text ?? "";
    expect(instructionsText).toContain("</user_instructions>");
    expect(instructionsText).toContain("system");

    expect(environmentItem).toEqual({
      role: "user",
      content: [
        {
          type: "input_text",
          text: expect.stringContaining("<environment_context>"),
        },
      ],
    });

    expect(userPromptItem).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "User message" }],
    });

    const savedSession = await loadSession("turn-session");
    expect(savedSession.items).toHaveLength(2);
    expect(savedSession.items[0]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "User message" }],
    });
    expect(savedSession.items[1]).toEqual(assistantMessage);

    expect(result.items).toEqual(savedSession.items);
    expect(result.usage).toEqual(usage);

    const history = await loadHistory(dataDir);
    expect(history).toHaveLength(1);
  });

  it("executes tool calls and records results", async () => {
    const { createSession, loadSession } = await import("../../src/agent/session");
    const { runTurn } = await import("../../src/agent/turn");

    await createSession("tool-session", {
      instructions: "tools",
      now: () => new Date("2025-10-22T11:00:00Z"),
    });

    const toolCall: ToolUseItem = {
      type: "tool_use",
      call_id: "call-1",
      name: "echo_tool",
      input: { value: 42 },
    };

    const assistantAfterTool: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "Here is the result" }],
    };

    const usage: TokenUsage = {
      input_tokens: 50,
      output_tokens: 25,
      total_tokens: 75,
    };

    const responsesClient = new StubResponsesClient([
      { items: [toolCall], responseId: "resp-initial" },
      { items: [assistantAfterTool], usage, responseId: "resp-final" },
    ]);

    const toolRegistry = {
      echo_tool: async (input: unknown) => {
        return { content: JSON.stringify(input), success: true };
      },
    };

    const result = await runTurn("tool-session", "Use the tool", {
      responsesClient: responsesClient as any,
      toolRegistry,
      promptBuilder: (items) => ({
        model: "test-model",
        messages: items.map(() => ({ role: "user", content: [] })),
      }),
    });

    const session = await loadSession("tool-session");
    expect(session.items).toHaveLength(4);
    expect(session.items[1]).toEqual(toolCall);
    expect(session.items[2]).toEqual({
      type: "tool_result",
      call_id: "call-1",
      output: { content: JSON.stringify({ value: 42 }), success: true },
    });
    expect(session.items[3]).toEqual({
      role: "assistant",
      content: [{ type: "text", text: "Here is the result" }],
    });

    expect(result.usage).toEqual(usage);
    expect(responsesClient.requests).toHaveLength(2);
    const toolFollowUp = responsesClient.requests[1] as any;
    // For ChatGPT Codex target, we omit previous_response_id and pair function_call with function_call_output.
    expect(toolFollowUp.previous_response_id).toBeUndefined();
    expect(toolFollowUp.input?.[0]?.type).toBe("function_call");
    expect(toolFollowUp.input?.[1]?.type).toBe("function_call_output");
    expect(Array.isArray(toolFollowUp.messages)).toBe(true);
    expect(toolFollowUp.messages.length).toBeGreaterThan(0);
    expect(toolFollowUp.input).toEqual([
      { type: "function_call", name: "echo_tool", arguments: JSON.stringify({ value: 42 }), call_id: "call-1" },
      { type: "function_call_output", call_id: "call-1", output: JSON.stringify({ value: 42 }) },
    ]);
  });

  it("retries when the client throws and eventually succeeds", async () => {
    const { createSession } = await import("../../src/agent/session");
    const { runTurn } = await import("../../src/agent/turn");

    await createSession("retry-session", {
      instructions: "retry",
      now: () => new Date("2025-10-22T12:00:00Z"),
    });

    const assistant: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "after retry" }],
    };

    const responsesClient = new StubResponsesClient([
      { error: new Error("temporary failure") },
      { items: [assistant] },
    ]);

    await runTurn("retry-session", "please retry", {
      responsesClient: responsesClient as any,
      promptBuilder: (items) => ({
        model: "retry-model",
        messages: items.map(() => ({ role: "user", content: [] })),
      }),
    });

    expect(responsesClient.callCount).toBe(2);
  });

  it("throws when tool is unknown", async () => {
    const { createSession } = await import("../../src/agent/session");
    const { runTurn } = await import("../../src/agent/turn");

    await createSession("unknown-tool", {
      instructions: "unknown",
      now: () => new Date("2025-10-22T13:00:00Z"),
    });

    const toolCall: ToolUseItem = {
      type: "tool_use",
      call_id: "missing",
      name: "missing_tool",
      input: {},
    };

    const assistantAfterFailure: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "Tool failed: boom" }],
    };

    const responsesClient = new StubResponsesClient([
      { items: [toolCall], responseId: "resp-initial" },
      { items: [assistantAfterFailure], responseId: "resp-final" },
    ]);

    await expect(
      runTurn("unknown-tool", "call missing", {
        responsesClient: responsesClient as any,
        promptBuilder: (items) => ({
          model: "test",
          messages: items.map(() => ({ role: "user", content: [] })),
        }),
      }),
    ).rejects.toThrow("Tool not found: missing_tool");
  });

  it("includes prior turns when building prompts", async () => {
    const { createSession, loadSession } = await import("../../src/agent/session");
    const { runTurn } = await import("../../src/agent/turn");

    await createSession("multi-turn", {
      instructions: "system",
      now: () => new Date("2025-10-22T14:00:00Z"),
    });

    const firstAssistant: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "First reply" }],
    };

    const secondAssistant: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "Second reply" }],
    };

    const responsesClient = new StubResponsesClient([
      { items: [firstAssistant] },
      { items: [secondAssistant] },
    ]);

    const promptHistory: SessionItem[][] = [];

    const options: RunTurnOptions = {
      responsesClient: responsesClient as any,
      promptBuilder: (items) => {
        promptHistory.push([...items]);
        return {
          model: "test-model",
          messages: [],
        };
      },
    };

    await runTurn("multi-turn", "first message", options);
    await runTurn("multi-turn", "second message", options);

    expect(promptHistory).toHaveLength(2);
    expect(promptHistory[0]?.length).toBe(3);
    expect(promptHistory[1]?.length).toBe(5);

    const session = await loadSession("multi-turn");
    expect(session.items).toHaveLength(4);
    expect(session.items[0]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "first message" }],
    });
    expect(session.items[1]).toEqual(firstAssistant);
    expect(session.items[2]).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "second message" }],
    });
    expect(session.items[3]).toEqual(secondAssistant);
  });

  it("retries when the stream fails after emitting items", async () => {
    const { createSession, loadSession } = await import("../../src/agent/session");
    const { runTurn } = await import("../../src/agent/turn");

    await createSession("mid-stream", {
      instructions: "retry",
      now: () => new Date("2025-10-22T15:00:00Z"),
    });

    const assistant: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "Partial" }],
    };

    const finalAssistant: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "Final" }],
    };

    const responsesClient = new StubResponsesClient([
      { items: [assistant, finalAssistant], failIndex: 1 },
      { items: [finalAssistant] },
    ]);

    await runTurn("mid-stream", "retry please", {
      responsesClient: responsesClient as any,
      promptBuilder: (items) => ({
        model: "retry-model",
        messages: items.map(() => ({ role: "user", content: [] })),
      }),
    });

    expect(responsesClient.callCount).toBe(2);

    const session = await loadSession("mid-stream");
    expect(session.items).toHaveLength(2);
    expect(session.items[1]).toEqual(finalAssistant);
  });

  it("propagates tool execution failures without retrying", async () => {
    const { createSession } = await import("../../src/agent/session");
    const { runTurn } = await import("../../src/agent/turn");

    await createSession("tool-failure", {
      instructions: "tools",
      now: () => new Date("2025-10-22T16:00:00Z"),
    });

    const toolCall: ToolUseItem = {
      type: "tool_use",
      call_id: "fail-1",
      name: "explode",
      input: { value: 1 },
    };

    const assistantAfterFailure: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "Tool failed: boom" }],
    };

    const responsesClient = new StubResponsesClient([
      { items: [toolCall], responseId: "resp-initial" },
      { items: [assistantAfterFailure], responseId: "resp-final" },
    ]);

    const toolRegistry = {
      explode: async () => {
        throw new Error("boom");
      },
    };

    const result = await runTurn("tool-failure", "trigger", {
      responsesClient: responsesClient as any,
      toolRegistry,
      promptBuilder: (items) => ({
        model: "tool-model",
        messages: items.map(() => ({ role: "user", content: [] })),
      }),
    });

    expect(responsesClient.callCount).toBe(2);
    const failureResult = result.items[result.items.length - 2] as SessionItem;
    expect(failureResult).toEqual({
      type: "tool_result",
      call_id: "fail-1",
      output: {
        success: false,
        error: "boom",
      },
    });

    const assistantMessage = result.items[result.items.length - 1] as SessionItem;
    expect(assistantMessage).toEqual(assistantAfterFailure);

    const followUpRequest = responsesClient.requests[1] as any;
    expect(followUpRequest.previous_response_id).toBeUndefined();
    expect(followUpRequest.input?.[0]?.type).toBe("function_call");
    expect(followUpRequest.input?.[1]?.type).toBe("function_call_output");
    expect(followUpRequest.input).toEqual([
      { type: "function_call", name: "explode", arguments: JSON.stringify({ value: 1 }), call_id: "fail-1" },
      { type: "function_call_output", call_id: "fail-1", output: "boom" },
    ]);
  });
});

describe("runTurnStream", () => {
  it("streams session items and reports usage", async () => {
    const { createSession, loadSession } = await import("../../src/agent/session");
    const { runTurnStream } = await import("../../src/agent/turn");

    await createSession("stream-session", {
      instructions: "stream",
      now: () => new Date("2025-10-22T17:00:00Z"),
    });

    const assistant: AssistantMessageItem = {
      role: "assistant",
      content: [{ type: "text", text: "Streaming reply" }],
    };

    const toolCall: ToolUseItem = {
      type: "tool_use",
      call_id: "call-2",
      name: "echo_tool",
      input: { value: 7 },
    };

    const usage: TokenUsage = {
      input_tokens: 12,
      output_tokens: 18,
      total_tokens: 30,
    };

    const responsesClient = new StubResponsesClient([
      { items: [toolCall], responseId: "resp-initial" },
      { items: [assistant], usage, responseId: "resp-final" },
    ]);

    const toolRegistry = {
      echo_tool: async (input: unknown) => ({ echoed: input }),
    };

    const events: any[] = [];
    for await (const event of runTurnStream("stream-session", "please stream", {
      responsesClient: responsesClient as any,
      toolRegistry,
      promptBuilder: (items) => ({
        model: "stream-model",
        messages: items.map(() => ({ role: "user", content: [] })),
      }),
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual(toolCall);
    expect(events[1]).toEqual({
      type: "tool_result",
      call_id: "call-2",
      output: { echoed: { value: 7 } },
    });
    expect(events[2]).toEqual(assistant);
    expect(events[3]).toEqual({ type: "usage", usage });

    const session = await loadSession("stream-session");
    expect(session.items.slice(-3)).toEqual(events.slice(0, 3));

    expect(responsesClient.requests).toHaveLength(2);
    const followUp = responsesClient.requests[1] as any;
    expect(followUp.input).toEqual([
      {
        type: "function_call",
        name: "echo_tool",
        arguments: JSON.stringify({ value: 7 }),
        call_id: "call-2",
      },
      {
        type: "function_call_output",
        call_id: "call-2",
        output: JSON.stringify({ echoed: { value: 7 } }),
      },
    ]);

    const history = await loadHistory(dataDir);
    expect(history).toHaveLength(1);
  });
});
