/**
 * Request builder tests for Anthropic Messages API
 *
 * Tests conversion from Codex Prompt to Anthropic MessagesApiRequest.
 * Phase 4.2 - Stage 3: Request Builder (15 tests)
 *
 * Test IDs: RF-01 through RF-15 from design doc
 */

import { describe, it, expect } from "vitest";
import type { Prompt, ResponseItem, ToolSpec } from "../client-common.js";
import { buildMessagesRequest } from "./request-builder.js";
import type { AnthropicProviderConfig } from "./types.js";

describe("Request Builder - Stage 3", () => {
  describe("Basic Request Building", () => {
    // RF-01: Minimal prompt produces base request
    it("RF-01: should build minimal request from simple prompt", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hello, Claude!" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const config: AnthropicProviderConfig = {};
      const model = "claude-3-5-sonnet-20241022";

      const request = buildMessagesRequest(prompt, config, model);

      expect(request.model).toBe("claude-3-5-sonnet-20241022");
      expect(request.stream).toBe(true);
      expect(request.messages).toHaveLength(1);
      expect(request.messages[0].role).toBe("user");
      expect(request.messages[0].content).toBe("Hello, Claude!");
    });

    // RF-02: Custom instructions render as system message
    it("RF-02: should use baseInstructionsOverride as system prompt", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hello" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
        baseInstructionsOverride: "You are a helpful coding assistant.",
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
      );

      expect(request.system).toBe("You are a helpful coding assistant.");
    });

    // RF-03: Multiple turns preserve role ordering
    it("RF-03: should preserve message order from prompt history", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "First user message" }],
          },
          {
            type: "message",
            role: "assistant",
            content: [
              { type: "output_text", text: "First assistant response" },
            ],
          },
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Second user message" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
      );

      expect(request.messages).toHaveLength(3);
      expect(request.messages[0].role).toBe("user");
      expect(request.messages[1].role).toBe("assistant");
      expect(request.messages[2].role).toBe("user");
    });

    // RF-04: Output schema handling
    it("RF-04: should include metadata when output schema is present", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Generate JSON" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
        outputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
      );

      expect(request.metadata).toBeDefined();
      // Output schema is stored in metadata for reference
      expect(request.metadata).toHaveProperty("output_schema_present", true);
    });
  });

  describe("Tool Handling", () => {
    // RF-05: Tool list converts to Anthropic schema
    it("RF-05: should convert tools to Anthropic format", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Use tools" }],
          },
        ],
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get weather",
            strict: false,
            parameters: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
              required: ["location"],
            },
          },
          {
            type: "function",
            name: "calculate",
            description: "Do math",
            strict: false,
            parameters: {
              type: "object",
              properties: {
                expr: { type: "string" },
              },
              required: ["expr"],
            },
          },
        ],
        parallelToolCalls: false,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
      );

      expect(request.tools).toHaveLength(2);
      expect(request.tools?.[0].name).toBe("get_weather");
      expect(request.tools?.[1].name).toBe("calculate");
    });

    // RF-06: Strict tool disables additionalProperties
    it("RF-06: should set additionalProperties: false for strict tools", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [
          {
            type: "function",
            name: "strict_tool",
            description: "Strict",
            strict: true,
            parameters: {
              type: "object",
              properties: {
                param: { type: "string" },
              },
              required: ["param"],
            },
          },
        ],
        parallelToolCalls: false,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
      );

      expect(request.tools?.[0].input_schema.additionalProperties).toBe(false);
    });

    // RF-07: Parallel tool calls disabled maps to 'auto'
    it("RF-07: should set tool_choice to auto when parallel disabled", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [
          {
            type: "function",
            name: "tool1",
            description: "Tool",
            strict: false,
            parameters: { type: "object", properties: {} },
          },
        ],
        parallelToolCalls: false,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
      );

      expect(request.tool_choice).toBe("auto");
    });

    // RF-08: Parallel tool calls enabled maps to 'any'
    it("RF-08: should set tool_choice to any when parallel enabled", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [
          {
            type: "function",
            name: "tool1",
            description: "Tool",
            strict: false,
            parameters: { type: "object", properties: {} },
          },
        ],
        parallelToolCalls: true,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
      );

      expect(request.tool_choice).toBe("any");
    });

    // RF-14: Tool omission when none provided
    it("RF-14: should omit tools field when no tools provided", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
      );

      expect(request.tools).toBeUndefined();
      expect(request.tool_choice).toBeUndefined();
    });

    // RF-15: Freeform tool rejected early
    it("RF-15: should throw error for unsupported freeform tools", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [
          {
            type: "custom",
            name: "freeform_tool",
            description: "Custom",
            format: {
              type: "bash",
              syntax: "bash",
              definition: "echo test",
            },
          },
        ],
        parallelToolCalls: false,
      };

      expect(() =>
        buildMessagesRequest(prompt, {}, "claude-3-5-sonnet-20241022"),
      ).toThrow(/freeform.*not supported/i);
    });
  });

  describe("Parameter Configuration", () => {
    // RF-09: Max output tokens default applied
    it("RF-09: should apply max_output_tokens from provider config", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const config: AnthropicProviderConfig = {
        maxOutputTokens: 2048,
      };

      const request = buildMessagesRequest(
        prompt,
        config,
        "claude-3-5-sonnet-20241022",
      );

      expect(request.max_output_tokens).toBe(2048);
    });

    // RF-10: Max output tokens override respected
    it("RF-10: should use default when no config provided", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
      );

      // Should use default from ANTHROPIC_DEFAULTS (4096)
      expect(request.max_output_tokens).toBe(4096);
    });

    // RF-11: Temperature/top_p propagate
    it("RF-11: should include temperature and top_p from config", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
        {
          temperature: 0.7,
          topP: 0.9,
        },
      );

      expect(request.temperature).toBe(0.7);
      expect(request.top_p).toBe(0.9);
    });

    // RF-12: Stop sequences forwarded
    it("RF-12: should forward stop sequences when provided", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
        {
          stopSequences: ["STOP", "END"],
        },
      );

      expect(request.stop_sequences).toEqual(["STOP", "END"]);
    });

    // RF-13: Metadata includes trace identifiers
    it("RF-13: should include trace_id in metadata when provided", () => {
      const prompt: Prompt = {
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Test" }],
          },
        ],
        tools: [],
        parallelToolCalls: false,
      };

      const request = buildMessagesRequest(
        prompt,
        {},
        "claude-3-5-sonnet-20241022",
        {
          traceId: "trace-12345",
        },
      );

      expect(request.metadata?.trace_id).toBe("trace-12345");
    });
  });
});
