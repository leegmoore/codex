import { vi } from "vitest";
import type { ResponseItem } from "../../src/protocol/models.js";
import type { Prompt } from "../../src/core/client/client-common.js";
import type { ModelClient } from "../../src/core/client/client.js";
import { WireApi } from "../../src/core/client/model-provider-info.js";

export interface MockModelClient {
  /** Instance passed into Codex. */
  client: ModelClient;
  /** Spy for assertions. */
  sendMessage: ReturnType<typeof vi.fn>;
}

export function createMockClient(responses: ResponseItem[][]): MockModelClient {
  let callIndex = 0;

  const sendMessage = vi.fn(async (_prompt: Prompt) => {
    if (callIndex >= responses.length) {
      throw new Error("Mock exhausted - no response configured for this call");
    }
    return responses[callIndex++];
  });

  const client = {
    sendMessage,
    getProvider: () => ({
      name: "mock-provider",
      wireApi: WireApi.Responses,
      requiresOpenaiAuth: false,
    }),
    getWireApi: () => WireApi.Responses,
    getModelSlug: () => "mock-model",
    getModelContextWindow: () => 128_000,
    getAuth: () => undefined,
    getReasoningEffort: () => undefined,
    getReasoningSummary: () => undefined,
  } as unknown as ModelClient;

  return { client, sendMessage };
}

export interface ToolCallMockOptions {
  callId?: string;
  leadingItems?: ResponseItem[];
  followUpResponses?: ResponseItem[][];
}

export function createMockClientWithToolCall(
  toolName: string,
  args: unknown,
  options: ToolCallMockOptions = {},
): MockModelClient {
  const callId = options.callId ?? `call-${Math.random().toString(36).slice(2, 8)}`;
  const toolCall: ResponseItem = {
    type: "function_call",
    id: callId,
    call_id: callId,
    name: toolName,
    arguments: JSON.stringify(args),
  };

  const firstResponse: ResponseItem[] = [
    ...(options.leadingItems ?? []),
    toolCall,
  ];

  return createMockClient([
    firstResponse,
    ...((options.followUpResponses ?? []) as ResponseItem[][]),
  ]);
}
