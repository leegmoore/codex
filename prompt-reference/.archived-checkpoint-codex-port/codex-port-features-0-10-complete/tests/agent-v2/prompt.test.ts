import { describe, expect, it } from "bun:test";

import { constructPromptV2 } from "../../src/agent-v2/prompt";
import { getModelInstructions } from "../../src/agent/instructions";
import type { ResponseItem } from "../../src/protocol/types";

function sampleItems(): ResponseItem[] {
  return [
    {
      type: "message",
      id: "msg_user",
      role: "user",
      content: [{ type: "input_text", text: "List the files." }],
    },
    {
      type: "reasoning",
      id: "rs_thought",
      summary: [{ type: "summary_text", text: "thinking" }],
    },
    {
      type: "message",
      id: "msg_assistant",
      role: "assistant",
      content: [{ type: "output_text", text: "Sure, let me check." }],
    },
    {
      type: "function_call",
      name: "list_dir",
      arguments: JSON.stringify({ dir_path: "/repo" }),
      call_id: "call-123",
    },
    {
      type: "function_call_output",
      call_id: "call-123",
      output: {
        content: JSON.stringify({ content: "Absolute path: /repo/file.txt", success: true }),
        success: true,
      },
    },
  ];
}

describe("constructPromptV2", () => {
  it("builds a responses-native request with sanitized input items", () => {
    const prompt = constructPromptV2(sampleItems(), {
      model: "gpt-5-codex",
      promptCacheKey: "session-123",
    });

    expect(prompt.model).toBe("gpt-5-codex");
    expect(prompt.input).toEqual([
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "List the files." }],
      },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Sure, let me check." }],
      },
      {
        type: "function_call",
        name: "list_dir",
        arguments: JSON.stringify({ dir_path: "/repo" }),
        call_id: "call-123",
      },
      {
        type: "function_call_output",
        call_id: "call-123",
        output: {
          content: JSON.stringify({ content: "Absolute path: /repo/file.txt", success: true }),
          success: true,
        },
      },
    ]);
    expect(prompt.input.find((item) => item.type === "reasoning")).toBeUndefined();
    expect(prompt.instructions).toEqual(
      getModelInstructions("gpt-5-codex", { includeApplyPatchTool: true }),
    );
    expect(prompt.parallel_tool_calls).toBe(false);
    expect(prompt.store).toBe(false);
    expect(prompt.stream).toBe(true);
    expect(prompt.tool_choice).toBe("auto");
    expect(prompt.prompt_cache_key).toBe("session-123");
  });

  it("exposes the core tool catalog with JSON schemas", () => {
    const prompt = constructPromptV2(sampleItems());
    const tools = prompt.tools ?? [];

    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "apply_patch",
      "grep_files",
      "list_dir",
      "read_file",
      "shell",
    ]);

    const grepFiles = tools.find((tool) => tool.name === "grep_files");
    expect(grepFiles).toBeDefined();
    expect(grepFiles?.type).toBe("function");
    expect(grepFiles?.parameters).toMatchObject({
      type: "object",
      required: ["pattern"],
    });

    const shellTool = tools.find((tool) => tool.name === "shell");
    expect(shellTool?.description).toContain("Run shell commands");
    expect(shellTool?.parameters).toMatchObject({
      properties: expect.objectContaining({
        timeout_ms: expect.any(Object),
        with_escalated_permissions: expect.any(Object),
      }),
    });
  });

  it("defaults to pretty-printing tool outputs for model submission", () => {
    const items: ResponseItem[] = [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Run shell" }],
      },
      {
        type: "function_call",
        name: "shell",
        arguments: JSON.stringify({ command: ["ls"], workdir: "/repo" }),
        call_id: "call-shell",
      },
      {
        type: "function_call_output",
        call_id: "call-shell",
        output: {
          content: JSON.stringify({ content: "README.md", success: true }),
          success: true,
        },
      },
    ];

    const prompt = constructPromptV2(items);
    const toolResult = prompt.input.find(
      (item) => item.type === "function_call_output" && item.call_id === "call-shell",
    );
    expect(toolResult).toBeDefined();
    expect(toolResult).toMatchObject({
      output: {
        content: JSON.stringify({ content: "README.md", success: true }),
        success: true,
      },
    });
  });
});
