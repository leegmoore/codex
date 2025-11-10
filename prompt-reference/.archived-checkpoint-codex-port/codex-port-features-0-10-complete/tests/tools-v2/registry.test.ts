import { describe, expect, it } from "bun:test";

import { createCoreToolRegistry } from "../../src/tools-v2/registry";
import {
  FunctionCallError,
  type ToolInvocation,
  type ToolPayload,
} from "../../src/tools-v2/router";

function makeInvocation({
  toolName,
  callId,
  payload,
}: {
  toolName: string;
  callId: string;
  payload: ToolPayload;
}): ToolInvocation {
  return {
    session: {} as any,
    turn: {} as any,
    tracker: {} as any,
    subId: "sub-1",
    callId,
    toolName,
    payload,
  };
}

describe("tools-v2 registry", () => {
  it("exposes configured core tool specs", () => {
    const { specs } = createCoreToolRegistry();
    const names = specs.map((spec) => spec.spec.name).sort();

    expect(names).toEqual([
      "apply_patch",
      "grep_files",
      "list_dir",
      "read_file",
      "shell",
    ]);
  });

  it("rejects unknown function tools with RespondToModel error", async () => {
    const { registry } = createCoreToolRegistry();

    await expect(
      registry.dispatch(
        makeInvocation({
          toolName: "not_a_tool",
          callId: "call-unknown",
          payload: { type: "function", arguments: "{}" },
        }),
      ),
    ).rejects.toThrow(
      new FunctionCallError("RespondToModel", "unsupported call: not_a_tool"),
    );
  });

  it("rejects unknown custom tool calls with custom error", async () => {
    const { registry } = createCoreToolRegistry();

    await expect(
      registry.dispatch(
        makeInvocation({
          toolName: "external_tool",
          callId: "call-custom",
          payload: { type: "custom", input: "\"payload\"" },
        }),
      ),
    ).rejects.toThrow(
      new FunctionCallError(
        "RespondToModel",
        "unsupported custom tool call: external_tool",
      ),
    );
  });

  it("validates shell arguments via schema", async () => {
    const { registry } = createCoreToolRegistry();

    await expect(
      registry.dispatch(
        makeInvocation({
          toolName: "shell",
          callId: "call-shell-invalid",
          payload: { type: "function", arguments: "{}" },
        }),
      ),
    ).rejects.toThrow(
      new FunctionCallError(
        "RespondToModel",
        'Tool "shell" execution failed: command must not be empty',
      ),
    );
  });

  it("executes shell tool and returns function_call_output", async () => {
    const { registry } = createCoreToolRegistry();

    const result = await registry.dispatch(
      makeInvocation({
        toolName: "shell",
        callId: "call-shell-ok",
        payload: {
          type: "function",
          arguments: JSON.stringify({ command: ["/bin/echo", "ok"], timeout_ms: 1_000 }),
        },
      }),
    );

    expect(result).toMatchObject({
      type: "function_call_output",
      call_id: "call-shell-ok",
      output: {
        content: expect.stringContaining("ok"),
        success: true,
      },
    });
  });
});
