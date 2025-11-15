import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConversationManager } from "../../src/core/conversation-manager.js";
import { SessionSource } from "../../src/core/rollout.js";
import {
  AuthManager,
  CodexAuth,
} from "../../src/core/auth/index.js";
import type { Config } from "../../src/core/config.js";
import { createMockConfig } from "../mocks/config.js";
import {
  createMockClient,
  createMockClientWithToolCall,
} from "../mocks/model-client.js";
import { toolRegistry } from "../../src/tools/registry.js";
import type { ResponseItem } from "../../src/protocol/models.js";
import type { EventMsg } from "../../src/protocol/protocol.js";
import { createMockToolHandler } from "../mocks/tool-handlers.js";
import * as display from "../../src/cli/display.js";
import type { ToolApprovalCallback } from "../../src/tools/types.js";

function createAuthManager(): AuthManager {
  const auth = CodexAuth.fromApiKey("sk-test-123");
  return AuthManager.fromAuthForTesting(auth);
}

function assistantMessage(text: string): ResponseItem {
  return {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };
}

function collectToolEvent(
  events: EventMsg[],
  itemType: ResponseItem["type"],
) {
  return events.find(
    (event): event is Extract<EventMsg, { type: "raw_response_item" }> =>
      event.type === "raw_response_item" && event.item.type === itemType,
  );
}

async function collectEvents(conversation: {
  nextEvent(): Promise<{ msg: EventMsg }>;
}) {
  const events: EventMsg[] = [];
  let done = false;
  while (!done) {
    const event = await conversation.nextEvent();
    events.push(event.msg);
    if (event.msg.type === "task_complete" || event.msg.type === "turn_aborted") {
      done = true;
    }
  }
  return events;
}

describe("Phase 2 tool execution", () => {
  let authManager: AuthManager;
  let config: Config;

  beforeEach(() => {
    authManager = createAuthManager();
    config = createMockConfig({ approvalPolicy: "on-request" });
  });

  it("executes approved tool requests", async () => {
    const toolName = "mockExec";
    const mockTool = createMockToolHandler(toolName, {
      result: { stdout: "tests passed", success: true },
    });
    toolRegistry.register(mockTool);

    const callId = "call-approved";
    const mockClient = createMockClientWithToolCall(
      toolName,
      { command: ["npm", "test"] },
      {
        callId,
        leadingItems: [assistantMessage("Running tests")],
        followUpResponses: [[assistantMessage("Done!")]],
      },
    );

    const approvalCallback: ToolApprovalCallback = vi.fn().mockResolvedValue(true);

    const manager = new ConversationManager(
      authManager,
      SessionSource.CLI,
      async () => mockClient.client,
      { approvalCallback },
    );

    const { conversation } = await manager.newConversation(config);
    await conversation.sendMessage("run tests");
    const events = await collectEvents(conversation);

    expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
    const firstPrompt = mockClient.sendMessage.mock.calls[0][0] as {
      tools: Array<{ type: string; name: string }>;
    };
    expect(firstPrompt.tools.some((tool) => tool.name === toolName)).toBe(true);
    expect((approvalCallback as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      toolName,
      { command: ["npm", "test"] },
    );
    expect(mockTool.execute).toHaveBeenCalledTimes(1);

    const callEvent = collectToolEvent(events, "function_call");
    expect(callEvent).toBeDefined();
    const outputEvent = collectToolEvent(events, "function_call_output");
    expect(outputEvent).toBeDefined();
  });

  it("blocks tool when approval denied", async () => {
    const toolName = "mockDeny";
    const mockTool = createMockToolHandler(toolName, {
      result: { stdout: "should not run" },
    });
    toolRegistry.register(mockTool);

    const mockClient = createMockClient([
      [
        {
          type: "function_call",
          id: "call-deny",
          call_id: "call-deny",
          name: toolName,
          arguments: JSON.stringify({ path: "./secret" }),
        },
      ],
      [assistantMessage("Denied")],
    ]);

    const approvalCallback: ToolApprovalCallback = vi.fn().mockResolvedValue(false);

    const manager = new ConversationManager(
      authManager,
      SessionSource.CLI,
      async () => mockClient.client,
      { approvalCallback },
    );

    const { conversation } = await manager.newConversation(config);
    await conversation.sendMessage("read secret");
    const events = await collectEvents(conversation);

    expect(mockTool.execute).not.toHaveBeenCalled();
    const outputEvent = collectToolEvent(events, "function_call_output");
    expect(outputEvent).toBeDefined();
  });

  it("handles multiple sequential tool calls", async () => {
    const readTool = createMockToolHandler("mockRead", {
      result: { content: "file contents" },
    });
    const execTool = createMockToolHandler("mockRun", {
      result: { stdout: "ok" },
    });
    toolRegistry.register(readTool);
    toolRegistry.register(execTool);

    const mockClient = createMockClient([
      [
        {
          type: "function_call",
          id: "call-read",
          call_id: "call-read",
          name: "mockRead",
          arguments: JSON.stringify({ path: "file.txt" }),
        },
      ],
      [
        {
          type: "function_call",
          id: "call-run",
          call_id: "call-run",
          name: "mockRun",
          arguments: JSON.stringify({ command: ["npm", "test"] }),
        },
      ],
      [assistantMessage("All done")],
    ]);

    const approvals = [true, true];
    const approvalCallback: ToolApprovalCallback = vi.fn(async () => {
      return approvals.shift() ?? false;
    });

    const manager = new ConversationManager(
      authManager,
      SessionSource.CLI,
      async () => mockClient.client,
      { approvalCallback },
    );

    const { conversation } = await manager.newConversation(config);
    await conversation.sendMessage("multi");
    await collectEvents(conversation);

    expect(mockClient.sendMessage).toHaveBeenCalledTimes(3);
    expect(readTool.execute).toHaveBeenCalledTimes(1);
    expect(execTool.execute).toHaveBeenCalledTimes(1);
  });

  it("returns error when tool not found", async () => {
    const mockClient = createMockClient([
      [
        {
          type: "function_call",
          id: "call-missing",
          call_id: "call-missing",
          name: "missingTool",
          arguments: JSON.stringify({ any: true }),
        },
      ],
      [assistantMessage("Handled")],
    ]);

    const approvalCallback: ToolApprovalCallback = vi.fn().mockResolvedValue(true);

    const manager = new ConversationManager(
      authManager,
      SessionSource.CLI,
      async () => mockClient.client,
      { approvalCallback },
    );

    const { conversation } = await manager.newConversation(config);
    await conversation.sendMessage("missing");
    const events = await collectEvents(conversation);

    const outputEvent = collectToolEvent(events, "function_call_output");
    expect(outputEvent?.item.output.content).toMatch(/not found/i);
  });

  it("surfaces tool execution failures", async () => {
    const toolName = "failingTool";
    const failingExecute = vi
      .fn()
      .mockRejectedValue(new Error("execution exploded"));
    const failingTool = createMockToolHandler(toolName, {
      implementation: failingExecute,
    });
    toolRegistry.register(failingTool);

    const mockClient = createMockClient([
      [
        {
          type: "function_call",
          id: "call-fail",
          call_id: "call-fail",
          name: toolName,
          arguments: JSON.stringify({ command: ["npm", "lint"] }),
        },
      ],
      [assistantMessage("error handled")],
    ]);

    const approvalCallback: ToolApprovalCallback = vi.fn().mockResolvedValue(true);

    const manager = new ConversationManager(
      authManager,
      SessionSource.CLI,
      async () => mockClient.client,
      { approvalCallback },
    );

    const { conversation } = await manager.newConversation(config);
    await conversation.sendMessage("run lint");
    const events = await collectEvents(conversation);

    const outputEvent = collectToolEvent(events, "function_call_output");
    expect(outputEvent?.item.output.content).toMatch(/execution exploded/i);
  });

  it("renders tool events in conversation display", async () => {
    const callEvent: EventMsg = {
      type: "raw_response_item",
      item: {
        type: "function_call",
        id: "render-call",
        call_id: "render-call",
        name: "mockRender",
        arguments: JSON.stringify({ text: "hello" }),
      },
    };

    const outputEvent: EventMsg = {
      type: "raw_response_item",
      item: {
        type: "function_call_output",
        call_id: "render-call",
        output: { content: "done" },
      },
    };

    const doneEvent: EventMsg = { type: "task_complete" };

    class FakeConversation {
      private idx = 0;
      constructor(private readonly events: EventMsg[]) {}
      async nextEvent() {
        const msg = this.events[this.idx++] ?? doneEvent;
        return { msg };
      }
    }

    const fakeConversation = new FakeConversation([
      callEvent,
      outputEvent,
      doneEvent,
    ]);

    const callSpy = vi.spyOn(display.toolRenderers, "renderToolCall");
    const resultSpy = vi.spyOn(display.toolRenderers, "renderToolResult");

    await display.renderConversationUntilComplete(
      fakeConversation as unknown as never,
    );

    expect(callSpy).toHaveBeenCalled();
    expect(resultSpy).toHaveBeenCalled();
  });

  it("denies approval when callback is unavailable", async () => {
    const toolName = "mockNoCallback";
    const mockTool = createMockToolHandler(toolName, {
      result: { content: "should never run" },
    });
    toolRegistry.register(mockTool);

    const mockClient = createMockClientWithToolCall(toolName, {
      some: "args",
    });

    const manager = new ConversationManager(
      authManager,
      SessionSource.CLI,
      async () => mockClient.client,
    );

    const { conversation } = await manager.newConversation(config);
    await conversation.sendMessage("fire tool");
    const events = await collectEvents(conversation);

    expect(mockTool.execute).not.toHaveBeenCalled();
    const outputEvent = collectToolEvent(events, "function_call_output");
    expect(outputEvent?.item.output.content).toMatch(/approval callback/i);
  });

  it("requires approval for the built-in applyPatch tool", async () => {
    const applyPatchTool = toolRegistry.get("applyPatch");
    expect(applyPatchTool).toBeDefined();
    if (!applyPatchTool) {
      return;
    }
    const execSpy = vi.spyOn(applyPatchTool, "execute");

    const mockClient = createMockClient([
      [
        {
          type: "function_call",
          id: "call-apply-patch",
          call_id: "call-apply-patch",
          name: "applyPatch",
          arguments: JSON.stringify({ patch: "--- a\n+++ b" }),
        },
      ],
    ]);

    const approvalCallback: ToolApprovalCallback = vi.fn().mockResolvedValue(false);

    const manager = new ConversationManager(
      authManager,
      SessionSource.CLI,
      async () => mockClient.client,
      { approvalCallback },
    );

    try {
      const { conversation } = await manager.newConversation(config);
      await conversation.sendMessage("apply patch");
      const events = await collectEvents(conversation);

      expect(approvalCallback).toHaveBeenCalledWith(
        "applyPatch",
        expect.anything(),
      );
      expect(execSpy).not.toHaveBeenCalled();
      const outputEvent = collectToolEvent(events, "function_call_output");
      expect(outputEvent?.item.output.content).toMatch(/denied/iu);
    } finally {
      execSpy.mockRestore();
    }
  });

  it("auto-approves applyPatch when approval_policy='never'", async () => {
    const applyPatchTool = toolRegistry.get("applyPatch");
    expect(applyPatchTool).toBeDefined();
    if (!applyPatchTool) {
      return;
    }

    const execSpy = vi
      .spyOn(applyPatchTool, "execute")
      .mockResolvedValue({ content: "patched", success: true });

    try {
      const mockClient = createMockClient([
        [
          {
            type: "function_call",
            id: "call-auto-patch",
            call_id: "call-auto-patch",
            name: "applyPatch",
            arguments: JSON.stringify({
              patch: "--- a/foo\n+++ b/foo\n@@\n-content\n+content\n",
            }),
          },
        ],
        [assistantMessage("finished")],
      ]);

      const approvalCallback: ToolApprovalCallback = vi
        .fn()
        .mockResolvedValue(true);

      const manager = new ConversationManager(
        authManager,
        SessionSource.CLI,
        async () => mockClient.client,
        { approvalCallback },
      );

      const { conversation } = await manager.newConversation(
        createMockConfig({ approvalPolicy: "never" }),
      );
      await conversation.sendMessage("apply patch automatically");
      await collectEvents(conversation);

      expect(approvalCallback).not.toHaveBeenCalled();
      expect(execSpy).toHaveBeenCalledTimes(1);
    } finally {
      execSpy.mockRestore();
    }
  });

  it("auto-approves exec when approval_policy='never'", async () => {
    const execTool = toolRegistry.get("exec");
    expect(execTool).toBeDefined();
    if (!execTool) {
      return;
    }

    const execSpy = vi
      .spyOn(execTool, "execute")
      .mockResolvedValue({ stdout: "ok", success: true });

    try {
      const mockClient = createMockClient([
        [
          {
            type: "function_call",
            id: "call-auto-exec",
            call_id: "call-auto-exec",
            name: "exec",
            arguments: JSON.stringify({
              command: ["echo", "auto"],
            }),
          },
        ],
        [assistantMessage("done")],
      ]);

      const approvalCallback: ToolApprovalCallback = vi
        .fn()
        .mockResolvedValue(true);

      const manager = new ConversationManager(
        authManager,
        SessionSource.CLI,
        async () => mockClient.client,
        { approvalCallback },
      );

      const { conversation } = await manager.newConversation(
        createMockConfig({ approvalPolicy: "never" }),
      );
      await conversation.sendMessage("run exec automatically");
      await collectEvents(conversation);

      expect(approvalCallback).not.toHaveBeenCalled();
      expect(execSpy).toHaveBeenCalledTimes(1);
    } finally {
      execSpy.mockRestore();
    }
  });

  it("escalates approval after tool failure when approval_policy='on-failure'", async () => {
    const failingTool = createMockToolHandler("autoFail", {
      requiresApproval: true,
      implementation: vi.fn().mockRejectedValue(new Error("fail-fast")),
    });
    const followupTool = createMockToolHandler("needsApprovalAfterFailure", {
      requiresApproval: true,
      result: { stdout: "ok", success: true },
    });
    toolRegistry.register(failingTool);
    toolRegistry.register(followupTool);

    const responses: ResponseItem[][] = [
      [
        {
          type: "function_call",
          id: "call-auto-fail",
          call_id: "call-auto-fail",
          name: "autoFail",
          arguments: JSON.stringify({ command: ["sh", "-c", "exit 1"] }),
        },
      ],
      [
        {
          type: "function_call",
          id: "call-followup-1",
          call_id: "call-followup-1",
          name: "needsApprovalAfterFailure",
          arguments: JSON.stringify({ command: ["npm", "test"] }),
        },
      ],
      [assistantMessage("first turn done")],
      [
        {
          type: "function_call",
          id: "call-followup-2",
          call_id: "call-followup-2",
          name: "needsApprovalAfterFailure",
          arguments: JSON.stringify({ command: ["npm", "run", "lint"] }),
        },
      ],
      [assistantMessage("second turn done")],
    ];

    const mockClient = createMockClient(responses);

    const approvalCallback: ToolApprovalCallback = vi.fn().mockResolvedValue(true);

    const manager = new ConversationManager(
      authManager,
      SessionSource.CLI,
      async () => mockClient.client,
      { approvalCallback },
    );

    const { conversation } = await manager.newConversation(
      createMockConfig({ approvalPolicy: "on-failure" }),
    );

    await conversation.sendMessage("first turn");
    await collectEvents(conversation);

    await conversation.sendMessage("second turn");
    await collectEvents(conversation);

    expect(approvalCallback).toHaveBeenCalledTimes(1);
    expect(failingTool.execute).toHaveBeenCalledTimes(1);
    expect(followupTool.execute).toHaveBeenCalledTimes(2);
  });
});
