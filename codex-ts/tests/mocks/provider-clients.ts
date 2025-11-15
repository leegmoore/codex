import { vi } from "vitest";
import type { ResponseItem } from "../../src/protocol/models.js";
import type { Prompt } from "../../src/core/client/client-common.js";
import type { ModelClient } from "../../src/core/client/client.js";
import { WireApi } from "../../src/core/client/model-provider-info.js";

export interface MockProviderClient {
  client: ModelClient;
  sendMessage: ReturnType<typeof vi.fn>;
}

function createMockProviderClient(
  wireApi: WireApi,
  providerName: string,
  responses: ResponseItem[][] = [],
): MockProviderClient {
  let callIndex = 0;

  const sendMessage = vi.fn(async (_prompt: Prompt) => {
    if (callIndex >= responses.length) {
      throw new Error(
        `Mock ${providerName} client exhausted (wireApi=${wireApi})`,
      );
    }
    return responses[callIndex++];
  });

  const client = {
    sendMessage,
    getProvider: () => ({
      name: providerName,
      wireApi,
      requiresOpenaiAuth: providerName === "openai",
    }),
    getWireApi: () => wireApi,
    getModelSlug: () => `${providerName}-model`,
    getReasoningEffort: () => undefined,
    getReasoningSummary: () => undefined,
    getAuth: () => undefined,
  } as unknown as ModelClient;

  return { client, sendMessage };
}

export function createMockResponsesClient(
  responses: ResponseItem[][] = [],
): MockProviderClient {
  return createMockProviderClient(WireApi.Responses, "openai", responses);
}

export function createMockChatClient(
  responses: ResponseItem[][] = [],
): MockProviderClient {
  return createMockProviderClient(WireApi.Chat, "openai", responses);
}

export function createMockMessagesClient(
  responses: ResponseItem[][] = [],
): MockProviderClient {
  return createMockProviderClient(WireApi.Messages, "anthropic", responses);
}

