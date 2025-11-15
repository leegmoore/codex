/**
 * Tests for client module (ModelClient + Responses API)
 *
 * Ported from: codex-rs/core/src/client.rs
 *
 * Phase 4.1 Note: This is a simplified implementation focusing on
 * core structure and types. Full HTTP streaming will be implemented
 * in Phase 4.5+ when HTTP infrastructure is ready.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ModelClient, type ResponsesApiOptions } from "./client.js";
import { WireApi, type ModelProviderInfo } from "./model-provider-info.js";
import { AuthMode, CodexAuth } from "../auth/stub-auth.js";
import * as MessagesModule from "./messages/index.js";

let originalFetch: typeof global.fetch;

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("client", () => {
  describe("ModelClient", () => {
    const createTestProvider = (): ModelProviderInfo => ({
      name: "Test Provider",
      wireApi: WireApi.Responses,
      requiresOpenaiAuth: false,
    });

    it("should create a ModelClient instance", () => {
      const provider = createTestProvider();
      const client = new ModelClient({
        provider,
        modelSlug: "gpt-4",
      });

      expect(client).toBeDefined();
      expect(client.getModelSlug()).toBe("gpt-4");
    });

    it("should get provider info", () => {
      const provider = createTestProvider();
      const client = new ModelClient({
        provider,
        modelSlug: "gpt-4",
      });

      expect(client.getProvider()).toEqual(provider);
    });

    it("should get wire API type", () => {
      const provider = createTestProvider();
      const client = new ModelClient({
        provider,
        modelSlug: "gpt-4",
      });

      expect(client.getWireApi()).toBe(WireApi.Responses);
    });

    it("should support Chat API provider", () => {
      const provider: ModelProviderInfo = {
        name: "Chat Provider",
        wireApi: WireApi.Chat,
        requiresOpenaiAuth: false,
      };

      const client = new ModelClient({
        provider,
        modelSlug: "gpt-3.5-turbo",
      });

      expect(client.getWireApi()).toBe(WireApi.Chat);
    });

    it("should store auth if provided", () => {
      const provider = createTestProvider();
      const auth = CodexAuth.fromApiKey("sk-test");

      const client = new ModelClient({
        provider,
        modelSlug: "gpt-4",
        auth,
      });

      expect(client.getAuth()).toBeDefined();
      expect(client.getAuth()?.mode).toBe(AuthMode.ApiKey);
    });

    it("should work without auth", () => {
      const provider = createTestProvider();

      const client = new ModelClient({
        provider,
        modelSlug: "gpt-4",
      });

      expect(client.getAuth()).toBeUndefined();
    });

    it("should support reasoning effort", () => {
      const provider = createTestProvider();

      const client = new ModelClient({
        provider,
        modelSlug: "gpt-4",
        reasoningEffort: "high",
      });

      expect(client.getReasoningEffort()).toBe("high");
    });

    it("should support reasoning summary", () => {
      const provider = createTestProvider();

      const client = new ModelClient({
        provider,
        modelSlug: "gpt-4",
        reasoningSummary: "detailed",
      });

      expect(client.getReasoningSummary()).toBe("detailed");
    });

    it("should default reasoning summary to auto", () => {
      const provider = createTestProvider();

      const client = new ModelClient({
        provider,
        modelSlug: "gpt-4",
      });

      expect(client.getReasoningSummary()).toBe("auto");
    });
  });

  describe("ResponsesApiOptions", () => {
    it("should create minimal options", () => {
      const options: ResponsesApiOptions = {
        provider: {
          name: "OpenAI",
          wireApi: WireApi.Responses,
          requiresOpenaiAuth: true,
        },
        modelSlug: "gpt-4",
      };

      expect(options.modelSlug).toBe("gpt-4");
      expect(options.provider.wireApi).toBe(WireApi.Responses);
    });

    it("should support all optional fields", () => {
      const auth = CodexAuth.fromApiKey("sk-test");

      const options: ResponsesApiOptions = {
        provider: {
          name: "OpenAI",
          wireApi: WireApi.Responses,
          requiresOpenaiAuth: true,
        },
        modelSlug: "gpt-4",
        auth,
        reasoningEffort: "medium",
        reasoningSummary: "concise",
      };

      expect(options.auth).toBeDefined();
      expect(options.reasoningEffort).toBe("medium");
      expect(options.reasoningSummary).toBe("concise");
    });
  });

  describe("sendMessage behavior", () => {
    it("sends chat completion request and maps response", async () => {
      const provider: ModelProviderInfo = {
        name: "OpenAI",
        wireApi: WireApi.Chat,
        requiresOpenaiAuth: true,
        baseUrl: "https://api.openai.com/v1",
      };

      const client = new ModelClient({
        provider,
        modelSlug: "gpt-4o-mini",
        auth: CodexAuth.fromApiKey("sk-test"),
      });

      const payload = {
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "Hello world",
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "do_something",
                    arguments: '{"value":1}',
                  },
                },
              ],
            },
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;

      const prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Say hello" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const items = await client.sendMessage(prompt);
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        type: "message",
        content: [{ text: "Hello world" }],
      });
      expect(items[1]).toMatchObject({
        type: "function_call",
        name: "do_something",
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("collects response items from messages API stream", async () => {
      const provider: ModelProviderInfo = {
        name: "Anthropic",
        wireApi: WireApi.Messages,
        requiresOpenaiAuth: false,
        baseUrl: "https://api.anthropic.com/v1",
      };

      const client = new ModelClient({
        provider,
        modelSlug: "claude-3-haiku",
        auth: CodexAuth.fromApiKey("sk-ant"),
      });

      const streamMock = vi
        .spyOn(MessagesModule, "streamMessages")
        .mockImplementation(async function* () {
          yield {
            type: "output_item_added",
            item: {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "Hi there" }],
            },
          };
          yield {
            type: "output_item_added",
            item: {
              type: "custom_tool_call",
              call_id: "tool-123",
              name: "lookup",
              input: "{}",
            },
          };
        });

      const prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Ping" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const items = await client.sendMessage(prompt);
      expect(items).toHaveLength(2);
      expect(streamMock).toHaveBeenCalledTimes(1);
    });
  });
});
