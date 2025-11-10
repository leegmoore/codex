import { describe, expect, it } from "bun:test";

import type { SessionItem } from "../../src/agent/session";
import { getModelInstructions } from "../../src/agent/instructions";
import { constructPrompt } from "../../src/agent/prompt";

describe("constructPrompt", () => {
  function sampleItems(): SessionItem[] {
    return [
      {
        role: "user",
        content: [{ type: "input_text", text: "List the files." }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Sure, let me check." }],
      },
      {
        type: "tool_use",
        name: "list_dir",
        call_id: "call-123",
        input: { dir_path: "/repo" },
      },
      {
        type: "tool_result",
        call_id: "call-123",
        output: { content: "Absolute path: /repo\nfile.txt", success: true },
      },
    ];
  }

  it("builds a responses request with system message first", () => {
    const request = constructPrompt(sampleItems(), { model: "gpt-5-codex" });

    expect(request.model).toBe("gpt-5-codex");
    expect(request.max_output_tokens).toBeGreaterThan(0);
    expect(request.parallel_tool_calls).toBe(false);
    expect(request.store).toBe(false);
    expect(request.stream).toBe(true);
    expect(request.tool_choice).toBe("auto");
    expect(request.instructions).toEqual(
      expect.stringContaining("You are Codex"),
    );

    const messages = request.messages;
    expect(messages.length).toBe(5);

    const [system, user, assistant, toolCall, toolResult] = messages;
    expect(system.role).toBe("system");
    expect(system.content).toEqual([
      { type: "text", text: expect.stringContaining("You are Codex") },
    ]);

    expect(user).toEqual({
      role: "user",
      content: [{ type: "input_text", text: "List the files." }],
    });

    expect(assistant).toEqual({
      role: "assistant",
      content: [{ type: "output_text", text: "Sure, let me check." }],
    });

    expect(toolCall).toEqual({
      role: "assistant",
      content: [
        {
          type: "tool_call",
          id: "call-123",
          name: "list_dir",
          input: { dir_path: "/repo" },
        },
      ],
    });

    expect(toolResult).toEqual({
      role: "tool",
      tool_call_id: "call-123",
      content: [
        {
          type: "output_text",
          text: expect.stringContaining("Absolute path: /repo"),
        },
      ],
    });
  });

  it("includes schemas for all core tools", () => {
    const request = constructPrompt(sampleItems(), { model: "gpt-5-codex" });
    const tools = request.tools ?? [];
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

  it("serializes tool results as JSON when necessary", () => {
    const items: SessionItem[] = [
      {
        role: "user",
        content: [{ type: "input_text", text: "Run shell" }],
      },
      {
        type: "tool_use",
        name: "shell",
        call_id: "call-shell",
        input: { command: ["ls"], workdir: "/repo" },
      },
      {
        type: "tool_result",
        call_id: "call-shell",
        output: { content: "README.md", success: true },
      },
    ];

    const request = constructPrompt(items);
    const toolMessage = request.messages.find((msg) => msg.role === "tool");
    expect(toolMessage?.content[0]).toEqual({
      type: "output_text",
      text: JSON.stringify({ content: "README.md", success: true }, null, 2),
    });
  });
});

describe("getModelInstructions", () => {
  it("appends apply_patch helper when model requires it and tool missing", () => {
    const instructions = getModelInstructions("gpt-5", {
      includeApplyPatchTool: false,
    });
    expect(instructions).toContain("Use the `apply_patch` shell command to edit files.");
  });

  it("does not duplicate helper when tool provided", () => {
    const instructionsWithTool = getModelInstructions("gpt-5", {
      includeApplyPatchTool: true,
    });

    const instructionsWithoutTool = getModelInstructions("gpt-5", {
      includeApplyPatchTool: false,
    });

    expect(instructionsWithoutTool.length).toBeGreaterThan(instructionsWithTool.length);
  });
});
