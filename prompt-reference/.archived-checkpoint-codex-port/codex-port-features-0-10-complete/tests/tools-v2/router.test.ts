import { describe, it, expect, mock } from "bun:test";

import {
  FunctionCallError,
  buildToolCall,
  createToolRouter,
  type ToolCall,
  type ToolInvocation,
  type ToolPayload,
} from "../../src/tools-v2/router";
import type {
  ResponseItem,
  ResponseLocalShellCallItem,
  ResponseMessageItem,
} from "../../src/protocol/types";

function makeFunctionCallItem({
  name,
  arguments: args,
  callId,
}: {
  name: string;
  arguments: Record<string, unknown> | string;
  callId: string;
}): ResponseItem {
  return {
    type: "function_call",
    name,
    arguments: typeof args === "string" ? args : JSON.stringify(args),
    call_id: callId,
  };
}

function makeCustomToolCall({
  name,
  input,
  callId,
}: {
  name: string;
  input: unknown;
  callId: string;
}): ResponseItem {
  return {
    type: "custom_tool_call",
    name,
    input: JSON.stringify(input),
    call_id: callId,
  };
}

function makeLocalShellCall({
  callId,
  id,
  command,
  workdir,
  timeoutMs,
}: {
  callId?: string;
  id?: string;
  command: string[];
  workdir?: string | null;
  timeoutMs?: number | null;
}): ResponseLocalShellCallItem {
  return {
    type: "local_shell_call",
    status: "completed",
    call_id: callId,
    id,
    action: {
      type: "exec",
      command,
      working_directory: workdir ?? null,
      timeout_ms: timeoutMs ?? null,
      env: null,
      user: null,
    },
  };
}

const dummySession = {
  parseMcpToolName: () => null as { server: string; tool: string } | null,
};

const dummyTurn = {};
const dummyTracker = {};

describe("buildToolCall", () => {
  it("returns null for non-tool items", () => {
    const item: ResponseMessageItem = {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "hi" }],
    };

    const result = buildToolCall(dummySession, item);
    expect(result).toBeNull();
  });

  it("extracts function call payloads", () => {
    const item = makeFunctionCallItem({
      name: "list_dir",
      arguments: { dir_path: "/repo" },
      callId: "call-1",
    });

    const call = buildToolCall(dummySession, item);
    expect(call).not.toBeNull();
    expect(call).toMatchObject({
      toolName: "list_dir",
      callId: "call-1",
      payload: { type: "function", arguments: JSON.stringify({ dir_path: "/repo" }) },
    });
  });

  it("normalizes local shell call payloads", () => {
    const item = makeLocalShellCall({
      callId: undefined,
      id: "shell-1",
      command: ["/bin/echo", "hello"],
      workdir: "/repo",
      timeoutMs: 2_000,
    });

    const call = buildToolCall(dummySession, item);
    expect(call).not.toBeNull();
    expect(call).toMatchObject({
      toolName: "local_shell",
      callId: "shell-1",
      payload: {
        type: "local_shell",
        params: {
          command: ["/bin/echo", "hello"],
          workdir: "/repo",
          timeoutMs: 2_000,
          withEscalatedPermissions: null,
          justification: null,
        },
      },
    });
  });

  it("throws for local shell calls without id or call_id", () => {
    const item = makeLocalShellCall({
      callId: undefined,
      id: undefined,
      command: ["ls"],
    });

    expect(() => buildToolCall(dummySession, item)).toThrow(
      new FunctionCallError("MissingLocalShellCallId", "LocalShellCall without call_id or id"),
    );
  });
});

describe("dispatchToolCall", () => {
  function createRouter(overrides?: {
    dispatch?: (invocation: ToolInvocation) => Promise<ResponseItem>;
  }) {
    const dispatch = overrides?.dispatch ?? mock(async (invocation: ToolInvocation) => {
      return {
        type: "function_call_output",
        call_id: invocation.callId,
        output: {
          content: JSON.stringify({ stdout: "ok" }),
          success: true,
        },
      } as ResponseItem;
    });

    const router = createToolRouter({
      specs: [],
      registry: {
        dispatch,
        toolSupportsParallel: () => false,
      },
    });

    return { router, dispatch };
  }

  function buildInvocation(): ToolCall {
    return {
      toolName: "list_dir",
      callId: "call-123",
      payload: { type: "function", arguments: "{}" } satisfies ToolPayload,
    };
  }

  it("returns successful tool outputs from registry", async () => {
    const { router } = createRouter();
    const response = await router.dispatchToolCall(
      dummySession as any,
      dummyTurn as any,
      dummyTracker as any,
      "sub-1",
      buildInvocation(),
    );

    expect(response).toMatchObject({
      type: "function_call_output",
      call_id: "call-123",
      output: {
        content: JSON.stringify({ stdout: "ok" }),
        success: true,
      },
    });
  });

  it("wraps non-fatal errors from functions into function_call_output", async () => {
    const error = new FunctionCallError(
      "RespondToModel",
      "Tool \"list_dir\" execution failed: permission denied",
    );

    const { router } = createRouter({
      dispatch: mock(async () => {
        throw error;
      }),
    });

    const response = await router.dispatchToolCall(
      dummySession as any,
      dummyTurn as any,
      dummyTracker as any,
      "sub-2",
      buildInvocation(),
    );

    expect(response).toEqual({
      type: "function_call_output",
      call_id: "call-123",
      output: {
        content: "Tool \"list_dir\" execution failed: permission denied",
        success: false,
      },
    });
  });

  it("propagates fatal tool errors without wrapping", async () => {
    const fatal = new FunctionCallError("Fatal", "Fatal error: disk failure");

    const { router } = createRouter({
      dispatch: mock(async () => {
        throw fatal;
      }),
    });

    await expect(
      router.dispatchToolCall(
        dummySession as any,
        dummyTurn as any,
        dummyTracker as any,
        "sub-3",
        buildInvocation(),
      ),
    ).rejects.toThrow(fatal);
  });

  it("wraps custom tool errors as custom_tool_call_output", async () => {
    const customError = new FunctionCallError(
      "RespondToModel",
      "unsupported custom tool call: external_tool",
    );

    const { router } = createRouter({
      dispatch: mock(async () => {
        throw customError;
      }),
    });

    const response = await router.dispatchToolCall(
      dummySession as any,
      dummyTurn as any,
      dummyTracker as any,
      "sub-4",
      {
        toolName: "external_tool",
        callId: "custom-1",
        payload: { type: "custom", input: "\"payload\"" },
      },
    );

    expect(response).toEqual({
      type: "custom_tool_call_output",
      call_id: "custom-1",
      output: "unsupported custom tool call: external_tool",
    });
  });
});
