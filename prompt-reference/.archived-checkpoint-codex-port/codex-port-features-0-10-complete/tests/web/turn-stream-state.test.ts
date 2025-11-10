import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

import { createTurnStreamState } from "../../web/turn-stream-state.js";
import type { ResponseItem, TokenUsage } from "../../src/protocol/types";
import type { TurnStreamV2Item } from "../../src/agent-v2/turn";

describe("createTurnStreamState", () => {
  it("emits user messages from session items", () => {
    const state = createTurnStreamState();
    const item: ResponseItem = {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "user hello" }],
    };

    const actions = state.handleSessionItem(item);
    expect(actions).toEqual([{ type: "user_message", text: "user hello" }]);
  });

  it("emits assistant messages from session items", () => {
    const state = createTurnStreamState();
    const item: ResponseItem = {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "assistant hi" }],
    };

    const actions = state.handleSessionItem(item);
    expect(actions).toEqual([{ type: "assistant_message", text: "assistant hi", final: true }]);
  });

  it("accumulates assistant deltas and finalizes on completion", () => {
    const state = createTurnStreamState();

    const firstDelta = state.handleEvent({ type: "output_text.delta", delta: "Hel" });
    expect(firstDelta).toEqual([{ type: "assistant_delta", text: "Hel" }]);

    const secondDelta = state.handleEvent({ type: "output_text.delta", delta: "lo" });
    expect(secondDelta).toEqual([{ type: "assistant_delta", text: "Hello" }]);

    const final = state.handleEvent({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Hello world" }],
    } satisfies ResponseItem);
    expect(final).toEqual([
      { type: "assistant_message", text: "Hello world", final: true },
    ]);

    const nextDelta = state.handleEvent({ type: "output_text.delta", delta: "Next" });
    expect(nextDelta).toEqual([{ type: "assistant_delta", text: "Next" }]);
  });

  it("emits tool calls and results", () => {
    const state = createTurnStreamState();

    const call = state.handleEvent({
      type: "function_call",
      name: "list_dir",
      arguments: '{"path":"."}',
      call_id: "call-1",
    } satisfies ResponseItem);

    expect(call).toEqual([
      {
        type: "tool_call",
        tool: "list_dir",
        callId: "call-1",
        arguments: { path: "." },
        rawArguments: '{"path":"."}',
        sourceType: "function_call",
      },
    ]);

    const result = state.handleEvent({
      type: "function_call_output",
      call_id: "call-1",
      output: {
        content: "ok",
        success: true,
        structured_content: { files: ["a.txt"] },
      },
    } satisfies ResponseItem);

    expect(result).toEqual([
      {
        type: "tool_result",
        callId: "call-1",
        output: {
          content: "ok",
          success: true,
          structured_content: { files: ["a.txt"] },
        },
        sourceType: "function_call_output",
      },
    ]);
  });

  it("emits usage and error events", () => {
    const state = createTurnStreamState();

    const usage: TokenUsage = {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    };

    const usageActions = state.handleEvent({ type: "usage", usage } as TurnStreamV2Item);
    expect(usageActions).toEqual([{ type: "usage", usage }]);

    const errorActions = state.handleEvent({ type: "error", error: "boom" });
    expect(errorActions).toEqual([{ type: "error", message: "boom" }]);
  });

  it("emits reasoning deltas and web search events", () => {
    const state = createTurnStreamState();

    const reasoningDelta = state.handleEvent({ type: "reasoning_summary.delta", delta: "step" });
    expect(reasoningDelta).toEqual([
      { type: "reasoning_delta", kind: "summary", text: "step" },
    ]);

    const reasoningContent = state.handleEvent({
      type: "reasoning_content.delta",
      delta: "explain",
    });
    expect(reasoningContent).toEqual([
      { type: "reasoning_delta", kind: "content", text: "explain" },
    ]);

    const reasoningPart = state.handleEvent({ type: "reasoning_summary.part_added" });
    expect(reasoningPart).toEqual([{ type: "reasoning_part" }]);

    const webSearch = state.handleEvent({ type: "web_search_call.begin", callId: "search-1" });
    expect(webSearch).toEqual([
      { type: "web_search_begin", callId: "search-1" },
    ]);

    const rateLimits = state.handleEvent({ type: "rate_limits", snapshot: { limit: 1 } });
    expect(rateLimits).toEqual([{ type: "rate_limits", snapshot: { limit: 1 } }]);
  });
});

it("references the v2 turns endpoint in the web UI", async () => {
  const source = await readFile(new URL("../../web/app.js", import.meta.url), "utf-8");
  expect(source).toContain('"/api/turns/v2"');
});
