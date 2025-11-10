import { describe, expect, it } from "bun:test";

import { createTurnStreamUiApplier } from "../../web/turn-stream-ui.js";

describe("createTurnStreamUiApplier", () => {
  it("routes conversation actions to configured handlers", () => {
    const calls: Array<Record<string, unknown>> = [];
    const applyActions = createTurnStreamUiApplier({
      onUserMessage(text) {
        calls.push({ type: "user_message", text });
      },
      onAssistantDelta(text) {
        calls.push({ type: "assistant_delta", text });
      },
      onAssistantMessage(text, final) {
        calls.push({ type: "assistant_message", text, final });
      },
      onToolCall(payload) {
        calls.push({ type: "tool_call", payload });
      },
      onToolResult(payload) {
        calls.push({ type: "tool_result", payload });
      },
      onAssistantInfo(text) {
        calls.push({ type: "assistant_info", text });
      },
      onUsage(usage) {
        calls.push({ type: "usage", usage });
      },
      onReasoning(kind, text) {
        calls.push({ type: "reasoning", kind, text });
      },
      onReasoningPart() {
        calls.push({ type: "reasoning_part" });
      },
      onWebSearch(callId) {
        calls.push({ type: "web_search", callId });
      },
      onRateLimits(snapshot) {
        calls.push({ type: "rate_limits", snapshot });
      },
      onUnknownAction(action) {
        calls.push({ type: "unknown", action });
      },
    });

    applyActions([
      { type: "user_message", text: "hi" },
      { type: "assistant_delta", text: "He" },
      { type: "assistant_message", text: "Hello there", final: true },
      {
        type: "tool_call",
        tool: "list_dir",
        arguments: { path: "." },
        callId: "call-1",
      },
      {
        type: "tool_result",
        callId: "call-1",
        output: { structured_content: { files: ["a.txt"] } },
      },
      {
        type: "usage",
        usage: { input_tokens: 3, output_tokens: 5, total_tokens: 8 },
      },
      {
        type: "reasoning_delta",
        kind: "summary",
        text: "thinking",
      },
      { type: "reasoning_part" },
      { type: "web_search_begin", callId: "search-1" },
      { type: "rate_limits", snapshot: { limit: 10 } },
      { type: "error", message: "boom" },
      { type: "something_else", value: 42 },
    ]);

    expect(calls).toEqual([
      { type: "user_message", text: "hi" },
      { type: "assistant_delta", text: "He" },
      { type: "assistant_message", text: "Hello there", final: true },
      {
        type: "tool_call",
        payload: expect.objectContaining({
          type: "tool_call",
          tool: "list_dir",
          arguments: { path: "." },
          callId: "call-1",
        }),
      },
      {
        type: "tool_result",
        payload: expect.objectContaining({
          type: "tool_result",
          callId: "call-1",
          output: { structured_content: { files: ["a.txt"] } },
        }),
      },
      {
        type: "usage",
        usage: { input_tokens: 3, output_tokens: 5, total_tokens: 8 },
      },
      { type: "reasoning", kind: "summary", text: "thinking" },
      { type: "reasoning_part" },
      { type: "web_search", callId: "search-1" },
      { type: "rate_limits", snapshot: { limit: 10 } },
      { type: "assistant_info", text: "Error: boom" },
      { type: "unknown", action: { type: "something_else", value: 42 } },
    ]);
  });

  it("emits assistant info messages for failed tool outputs", () => {
    const calls: Array<Record<string, unknown>> = [];
    const applyActions = createTurnStreamUiApplier({
      onToolResult(payload) {
        calls.push({ type: "tool_result", payload });
      },
      onAssistantInfo(text) {
        calls.push({ type: "assistant_info", text });
      },
    });

    applyActions([
      {
        type: "tool_result",
        callId: "call-2",
        output: { success: false, content: "failure" },
      },
      {
        type: "tool_result",
        callId: "call-3",
        output: { structured_content: { ok: true } },
      },
    ]);

    expect(calls).toEqual([
      {
        type: "tool_result",
        payload: expect.objectContaining({
          type: "tool_result",
          callId: "call-2",
          output: { success: false, content: "failure" },
        }),
      },
      { type: "assistant_info", text: "Tool error: failure" },
      {
        type: "tool_result",
        payload: expect.objectContaining({
          type: "tool_result",
          callId: "call-3",
          output: { structured_content: { ok: true } },
        }),
      },
    ]);
  });
});
