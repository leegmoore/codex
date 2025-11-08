/**
 * Type validation tests for Anthropic Messages API types.
 *
 * Tests ensure type definitions are correct and cover all expected shapes.
 * Phase 4.2 - Stage 1: Foundation & Types (10 tests)
 */

import { describe, it, expect } from "vitest";
import type {
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTool,
  MessagesApiRequest,
  AnthropicSseEvent,
  AnthropicToolChoice,
  AnthropicProviderConfig,
  UsageInfo,
} from "./types.js";
import { ANTHROPIC_DEFAULTS, ANTHROPIC_RATE_LIMIT_HEADERS } from "./types.js";

describe("Messages API Types - Stage 1", () => {
  describe("AnthropicMessage", () => {
    it("should accept valid user message with text content", () => {
      const message: AnthropicMessage = {
        role: "user",
        content: "Hello, Claude!",
      };
      expect(message.role).toBe("user");
      expect(message.content).toBe("Hello, Claude!");
    });

    it("should accept valid assistant message with content blocks", () => {
      const message: AnthropicMessage = {
        role: "assistant",
        content: [
          { type: "text", text: "Hello!" },
          { type: "thinking", thinking: "Let me think..." },
        ],
      };
      expect(message.role).toBe("assistant");
      expect(Array.isArray(message.content)).toBe(true);
      expect((message.content as AnthropicContentBlock[]).length).toBe(2);
    });
  });

  describe("AnthropicContentBlock", () => {
    it("should accept text content block", () => {
      const block: AnthropicContentBlock = {
        type: "text",
        text: "Sample text",
      };
      expect(block.type).toBe("text");
      if (block.type === "text") {
        expect(block.text).toBe("Sample text");
      }
    });

    it("should accept thinking content block", () => {
      const block: AnthropicContentBlock = {
        type: "thinking",
        thinking: "Reasoning content",
      };
      expect(block.type).toBe("thinking");
      if (block.type === "thinking") {
        expect(block.thinking).toBe("Reasoning content");
      }
    });

    it("should accept tool_use content block", () => {
      const block: AnthropicContentBlock = {
        type: "tool_use",
        id: "toolu_123",
        name: "get_weather",
        input: { location: "SF" },
      };
      expect(block.type).toBe("tool_use");
      if (block.type === "tool_use") {
        expect(block.id).toBe("toolu_123");
        expect(block.name).toBe("get_weather");
        expect(block.input).toEqual({ location: "SF" });
      }
    });

    it("should accept tool_result content block", () => {
      const block: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: "toolu_123",
        content: "Weather: sunny, 72°F",
        is_error: false,
      };
      expect(block.type).toBe("tool_result");
      if (block.type === "tool_result") {
        expect(block.tool_use_id).toBe("toolu_123");
        expect(block.content).toBe("Weather: sunny, 72°F");
        expect(block.is_error).toBe(false);
      }
    });
  });

  describe("AnthropicTool", () => {
    it("should accept valid tool schema with required fields", () => {
      const tool: AnthropicTool = {
        name: "get_weather",
        description: "Get weather for a location",
        input_schema: {
          type: "object",
          properties: {
            location: { type: "string" },
            units: { type: "string", enum: ["celsius", "fahrenheit"] },
          },
          required: ["location"],
        },
      };
      expect(tool.name).toBe("get_weather");
      expect(tool.description).toBe("Get weather for a location");
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema.required).toEqual(["location"]);
    });

    it("should accept tool schema with additionalProperties constraint", () => {
      const tool: AnthropicTool = {
        name: "strict_tool",
        input_schema: {
          type: "object",
          properties: {
            param: { type: "string" },
          },
          required: ["param"],
          additionalProperties: false, // Strict mode
        },
      };
      expect(tool.input_schema.additionalProperties).toBe(false);
    });
  });

  describe("MessagesApiRequest", () => {
    it("should accept minimal valid request", () => {
      const request: MessagesApiRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
        stream: true,
      };
      expect(request.model).toBe("claude-3-5-sonnet-20241022");
      expect(request.messages.length).toBe(1);
      expect(request.stream).toBe(true);
    });

    it("should accept complete request with all optional fields", () => {
      const request: MessagesApiRequest = {
        model: "claude-3-5-sonnet-20241022",
        messages: [
          { role: "user", content: "Hello" },
          {
            role: "assistant",
            content: [{ type: "text", text: "Hi there!" }],
          },
        ],
        max_output_tokens: 2048,
        system: "You are a helpful assistant",
        metadata: {
          user_id: "user-123",
          trace_id: "trace-456",
        },
        stop_sequences: ["STOP", "END"],
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        tools: [
          {
            name: "calculator",
            description: "Perform calculations",
            input_schema: {
              type: "object",
              properties: {
                expression: { type: "string" },
              },
              required: ["expression"],
            },
          },
        ],
        tool_choice: "auto",
        thinking: {
          budget_tokens: 1000,
        },
      };
      expect(request.max_output_tokens).toBe(2048);
      expect(request.system).toBe("You are a helpful assistant");
      expect(request.metadata?.trace_id).toBe("trace-456");
      expect(request.temperature).toBe(0.7);
      expect(request.tools?.length).toBe(1);
      expect(request.thinking?.budget_tokens).toBe(1000);
    });
  });

  describe("AnthropicToolChoice", () => {
    it("should accept string literal tool choice values", () => {
      const autoChoice: AnthropicToolChoice = "auto";
      const anyChoice: AnthropicToolChoice = "any";
      const noneChoice: AnthropicToolChoice = "none";

      expect(autoChoice).toBe("auto");
      expect(anyChoice).toBe("any");
      expect(noneChoice).toBe("none");
    });

    it("should accept specific tool choice object", () => {
      const specificChoice: AnthropicToolChoice = {
        type: "tool",
        name: "get_weather",
      };
      expect(specificChoice.type).toBe("tool");
      if (typeof specificChoice !== "string") {
        expect(specificChoice.name).toBe("get_weather");
      }
    });
  });

  describe("AnthropicSseEvent", () => {
    it("should accept message_start event", () => {
      const event: AnthropicSseEvent = {
        type: "message_start",
        message: {
          type: "message",
          id: "msg_123",
          role: "assistant",
          content: [],
          model: "claude-3-5-sonnet-20241022",
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 0,
          },
        },
      };
      expect(event.type).toBe("message_start");
      if (event.type === "message_start") {
        expect(event.message.id).toBe("msg_123");
      }
    });

    it("should accept content_block_delta event with text", () => {
      const event: AnthropicSseEvent = {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: "Hello",
        },
      };
      expect(event.type).toBe("content_block_delta");
      if (event.type === "content_block_delta") {
        expect(event.index).toBe(0);
        expect(event.delta.type).toBe("text_delta");
      }
    });

    it("should accept content_block_delta event with thinking", () => {
      const event: AnthropicSseEvent = {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "thinking_delta",
          thinking: "Let me analyze...",
        },
      };
      expect(event.type).toBe("content_block_delta");
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "thinking_delta"
      ) {
        expect(event.delta.thinking).toBe("Let me analyze...");
      }
    });

    it("should accept message_delta with usage", () => {
      const event: AnthropicSseEvent = {
        type: "message_delta",
        delta: {
          stop_reason: "end_turn",
        },
        usage: {
          output_tokens: 50,
        },
      };
      expect(event.type).toBe("message_delta");
      if (event.type === "message_delta") {
        expect(event.delta.stop_reason).toBe("end_turn");
        expect(event.usage?.output_tokens).toBe(50);
      }
    });

    it("should accept error event", () => {
      const event: AnthropicSseEvent = {
        type: "error",
        error: {
          type: "rate_limit_error",
          message: "Rate limit exceeded",
        },
      };
      expect(event.type).toBe("error");
      if (event.type === "error") {
        expect(event.error.type).toBe("rate_limit_error");
        expect(event.error.message).toBe("Rate limit exceeded");
      }
    });
  });

  describe("UsageInfo", () => {
    it("should accept complete usage info with all token types", () => {
      const usage: UsageInfo = {
        input_tokens: 100,
        output_tokens: 50,
        reasoning_tokens: 25,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 20,
      };
      expect(usage.input_tokens).toBe(100);
      expect(usage.output_tokens).toBe(50);
      expect(usage.reasoning_tokens).toBe(25);
      expect(usage.cache_creation_input_tokens).toBe(10);
      expect(usage.cache_read_input_tokens).toBe(20);
    });
  });

  describe("AnthropicProviderConfig", () => {
    it("should accept provider config with all fields", () => {
      const config: AnthropicProviderConfig = {
        baseUrl: "https://api.anthropic.com",
        anthropicVersion: "2023-06-01",
        apiKey: "sk-ant-test",
        reasoningEmission: "readable",
        maxOutputTokens: 4096,
        beta: ["prompt-caching-2024-07-31"],
      };
      expect(config.baseUrl).toBe("https://api.anthropic.com");
      expect(config.anthropicVersion).toBe("2023-06-01");
      expect(config.reasoningEmission).toBe("readable");
      expect(config.maxOutputTokens).toBe(4096);
      expect(config.beta?.length).toBe(1);
    });
  });

  describe("Constants", () => {
    it("should have correct default values", () => {
      expect(ANTHROPIC_DEFAULTS.BASE_URL).toBe("https://api.anthropic.com");
      expect(ANTHROPIC_DEFAULTS.API_VERSION).toBe("2023-06-01");
      expect(ANTHROPIC_DEFAULTS.MAX_OUTPUT_TOKENS).toBe(4096);
      expect(ANTHROPIC_DEFAULTS.TEMPERATURE).toBe(1.0);
    });

    it("should have correct rate limit header names", () => {
      expect(ANTHROPIC_RATE_LIMIT_HEADERS.REQUESTS_LIMIT).toBe(
        "anthropic-ratelimit-requests-limit",
      );
      expect(ANTHROPIC_RATE_LIMIT_HEADERS.TOKENS_REMAINING).toBe(
        "anthropic-ratelimit-tokens-remaining",
      );
      expect(ANTHROPIC_RATE_LIMIT_HEADERS.RETRY_AFTER).toBe("retry-after");
    });
  });
});
