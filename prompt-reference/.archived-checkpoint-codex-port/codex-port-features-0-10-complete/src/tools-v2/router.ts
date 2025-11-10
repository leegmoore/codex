import type {
  ResponseCustomToolCallItem,
  ResponseCustomToolCallOutputItem,
  ResponseFunctionCallItem,
  ResponseFunctionCallOutputItem,
  ResponseItem,
  ResponseLocalShellCallItem,
} from "../protocol/types";

export type ToolPayload =
  | { type: "function"; arguments: string }
  | { type: "unified_exec"; arguments: string }
  | { type: "custom"; input: string }
  | {
      type: "local_shell";
      params: {
        command: string[];
        workdir: string | null;
        timeoutMs: number | null;
        withEscalatedPermissions: boolean | null;
        justification: string | null;
      };
    }
  | {
      type: "mcp";
      server: string;
      tool: string;
      rawArguments: string;
    };

export interface ToolCall {
  toolName: string;
  callId: string;
  payload: ToolPayload;
}

export class FunctionCallError extends Error {
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.name = "FunctionCallError";
    this.kind = kind;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface ToolInvocation {
  session: unknown;
  turn: unknown;
  tracker: unknown;
  subId: string;
  callId: string;
  toolName: string;
  payload: ToolPayload;
}

export interface ToolRegistryAdapter {
  dispatch(invocation: ToolInvocation): Promise<ResponseItem>;
  toolSupportsParallel(toolName: string): boolean;
}

export interface ToolRouterOptions {
  registry: ToolRegistryAdapter;
  specs: unknown[];
}

interface SessionLike {
  parseMcpToolName?(name: string): { server: string; tool: string } | null;
}

class ToolRouterImpl {
  constructor(private readonly options: ToolRouterOptions) {}

  specs(): unknown[] {
    return [...this.options.specs];
  }

  toolSupportsParallel(toolName: string): boolean {
    return this.options.registry.toolSupportsParallel(toolName);
  }

  async dispatchToolCall(
    session: unknown,
    turn: unknown,
    tracker: unknown,
    subId: string,
    call: ToolCall,
  ): Promise<ResponseItem> {
    const invocation: ToolInvocation = {
      session,
      turn,
      tracker,
      subId,
      callId: call.callId,
      toolName: call.toolName,
      payload: call.payload,
    };

    try {
      return await this.options.registry.dispatch(invocation);
    } catch (error) {
      if (!(error instanceof FunctionCallError)) {
        throw error;
      }
      if (error.kind === "Fatal") {
        throw error;
      }
      return ToolRouterImpl.failureResponse(call.callId, call.payload.type === "custom", error);
    }
  }

  private static failureResponse(
    callId: string,
    payloadOutputsCustom: boolean,
    error: FunctionCallError,
  ): ResponseItem {
    const message = error.message;
    if (payloadOutputsCustom) {
      return {
        type: "custom_tool_call_output",
        call_id: callId,
        output: message,
      } satisfies ResponseCustomToolCallOutputItem;
    }

    return {
      type: "function_call_output",
      call_id: callId,
      output: {
        content: message,
        success: false,
      },
    } satisfies ResponseFunctionCallOutputItem;
  }
}

export function createToolRouter(options: ToolRouterOptions) {
  const router = new ToolRouterImpl(options);
  return {
    specs: () => router.specs(),
    toolSupportsParallel: (toolName: string) => router.toolSupportsParallel(toolName),
    dispatchToolCall: (
      session: unknown,
      turn: unknown,
      tracker: unknown,
      subId: string,
      call: ToolCall,
    ) => router.dispatchToolCall(session, turn, tracker, subId, call),
  };
}

export function buildToolCall(session: SessionLike, item: ResponseItem): ToolCall | null {
  switch (item.type) {
    case "function_call": {
      return buildFunctionCall(session, item);
    }
    case "custom_tool_call": {
      return buildCustomToolCall(item);
    }
    case "local_shell_call": {
      return buildLocalShellCall(item);
    }
    default:
      return null;
  }
}

function buildFunctionCall(
  session: SessionLike,
  item: ResponseFunctionCallItem,
): ToolCall {
  const mcp = session.parseMcpToolName?.(item.name) ?? null;
  if (mcp) {
    return {
      toolName: item.name,
      callId: item.call_id,
      payload: {
        type: "mcp",
        server: mcp.server,
        tool: mcp.tool,
        rawArguments: item.arguments,
      },
    };
  }

  const payloadType: ToolPayload["type"] =
    item.name === "unified_exec" ? "unified_exec" : "function";

  return {
    toolName: item.name,
    callId: item.call_id,
    payload: {
      type: payloadType,
      arguments: item.arguments,
    } as Extract<ToolPayload, { type: "function" | "unified_exec" }>,
  };
}

function buildCustomToolCall(item: ResponseCustomToolCallItem): ToolCall {
  return {
    toolName: item.name,
    callId: item.call_id,
    payload: {
      type: "custom",
      input: item.input,
    },
  };
}

function buildLocalShellCall(item: ResponseLocalShellCallItem): ToolCall {
  const callId = item.call_id ?? item.id ?? null;
  if (!callId) {
    throw new FunctionCallError(
      "MissingLocalShellCallId",
      "LocalShellCall without call_id or id",
    );
  }

  const action = item.action;
  if (!isExecAction(action)) {
    return {
      toolName: "local_shell",
      callId,
      payload: {
        type: "local_shell",
        params: {
          command: [],
          workdir: null,
          timeoutMs: null,
          withEscalatedPermissions: null,
          justification: null,
        },
      },
    };
  }

  const command = Array.isArray(action.command) ? [...action.command] : [];
  const workdir =
    typeof action.working_directory === "string" ? action.working_directory : null;
  const timeoutMs =
    typeof action.timeout_ms === "number" ? action.timeout_ms : null;
  const withEscalatedPermissions =
    typeof action.with_escalated_permissions === "boolean"
      ? action.with_escalated_permissions
      : null;
  const justification =
    typeof action.justification === "string" ? action.justification : null;

  return {
    toolName: "local_shell",
    callId,
    payload: {
      type: "local_shell",
      params: {
        command,
        workdir,
        timeoutMs,
        withEscalatedPermissions,
        justification,
      },
    },
  };
}

function isExecAction(
  action: ResponseLocalShellCallItem["action"],
): action is ResponseLocalShellCallItem["action"] & { type: "exec" } {
  return Boolean(action && typeof action === "object" && action.type === "exec");
}
