import {
  attachFunctionCallOutputSerializer,
  type FunctionCallOutputPayload,
  type ResponseItem,
} from "../../protocol/models.js";
import type { ToolApprovalCallback } from "../../tools/types.js";
import { toolRegistry, type ToolRegistry } from "../../tools/registry.js";

type FunctionCallItem = Extract<ResponseItem, { type: "function_call" }>;

interface ToolRouterOptions {
  registry?: ToolRegistry;
  approvalCallback?: ToolApprovalCallback;
}

interface ExecuteFunctionCallsOptions {
  /**
   * When true, tools that normally require approval will execute without
   * invoking the approval callback.
   */
  skipApproval?: boolean;
}

export class ToolRouter {
  private readonly registry: ToolRegistry;
  private readonly approvalCallback?: ToolApprovalCallback;

  constructor(options: ToolRouterOptions = {}) {
    this.registry = options.registry ?? toolRegistry;
    this.approvalCallback = options.approvalCallback;
  }

  async executeFunctionCalls(
    items: ResponseItem[],
    options: ExecuteFunctionCallsOptions = {},
  ): Promise<ResponseItem[]> {
    const outputs: ResponseItem[] = [];
    const skipApproval = options.skipApproval === true;
    for (const item of items) {
      if (item.type !== "function_call") {
        continue;
      }
      outputs.push(await this.handleFunctionCall(item, skipApproval));
    }
    return outputs;
  }

  private async handleFunctionCall(
    call: FunctionCallItem,
    skipApproval: boolean,
  ): Promise<ResponseItem> {
    const callId = call.call_id ?? call.id ?? crypto.randomUUID();
    let args: unknown;
    try {
      args = this.parseFunctionCallArguments(call);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to parse tool arguments";
      return this.createErrorOutput(callId, message);
    }

    const tool = this.registry.get(call.name);
    if (!tool) {
      return this.createErrorOutput(callId, `Tool ${call.name} not found`);
    }

    const approved =
      skipApproval && tool.metadata.requiresApproval
        ? true
        : await this.ensureApproval(
            tool.metadata.name,
            tool.metadata.requiresApproval,
            args,
          );
    if (!approved) {
      return this.createErrorOutput(
        callId,
        tool.metadata.requiresApproval && !this.approvalCallback
          ? "Tool requires approval but no approval callback is configured"
          : "User denied approval",
      );
    }

    try {
      const result = await tool.execute(args);
      return this.createSuccessOutput(callId, result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tool execution failed";
      return this.createErrorOutput(callId, message);
    }
  }

  private parseFunctionCallArguments(call: FunctionCallItem): unknown {
    if (!call.arguments) {
      return {};
    }

    return JSON.parse(call.arguments);
  }

  private async ensureApproval(
    toolName: string,
    requiresApproval: boolean,
    args: unknown,
  ): Promise<boolean> {
    if (!requiresApproval) {
      return true;
    }
    if (!this.approvalCallback) {
      return false;
    }
    try {
      return await this.approvalCallback(toolName, args);
    } catch (error) {
      console.error("Approval callback failed", error);
      return false;
    }
  }

  private createSuccessOutput(callId: string, result: unknown): ResponseItem {
    return {
      type: "function_call_output",
      call_id: callId,
      output: this.buildOutputPayload(result, true),
    };
  }

  private createErrorOutput(callId: string, message: string): ResponseItem {
    return {
      type: "function_call_output",
      call_id: callId,
      output: this.buildOutputPayload({ error: message }, false),
    };
  }

  private buildOutputPayload(
    result: unknown,
    success: boolean,
  ): FunctionCallOutputPayload {
    if (
      typeof result === "object" &&
      result !== null &&
      "content" in result &&
      typeof (result as { content: unknown }).content === "string"
    ) {
      const payload = result as FunctionCallOutputPayload;
      return attachFunctionCallOutputSerializer({
        ...payload,
        success: payload.success ?? success,
      });
    }

    return attachFunctionCallOutputSerializer({
      content: this.formatResult(result),
      success,
    });
  }

  private formatResult(result: unknown): string {
    if (typeof result === "string") {
      return result;
    }
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
}
