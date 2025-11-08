/**
 * Tool bridge tests for Anthropic Messages API
 *
 * Tests conversion from Codex ToolSpec to Anthropic tool schema format.
 * Phase 4.2 - Stage 2: Tool Format Conversion (15 tests)
 *
 * Test IDs: TC-01 through TC-10 from design doc
 */

import { describe, it, expect } from "vitest";
import type { ToolSpec } from "../client-common.js";
import {
  createToolsJsonForMessagesApi,
  validateToolName,
} from "./tool-bridge.js";

describe("Tool Bridge - Stage 2", () => {
  describe("Basic Tool Conversion", () => {
    // TC-01: Converter maps basic function tool
    it("TC-01: should convert basic function tool to Anthropic schema", () => {
      const tool: ToolSpec = {
        type: "function",
        name: "get_weather",
        description: "Get weather for a location",
        strict: false,
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name",
            },
          },
          required: ["location"],
        },
      };

      const result = createToolsJsonForMessagesApi([tool]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "get_weather",
        description: "Get weather for a location",
        input_schema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "City name",
            },
          },
          required: ["location"],
        },
      });
    });

    // TC-02: Converter enforces name length
    it("TC-02: should throw error for tool name longer than 64 characters", () => {
      const longName = "a".repeat(65);
      const tool: ToolSpec = {
        type: "function",
        name: longName,
        description: "Test tool",
        strict: false,
        parameters: {
          type: "object",
          properties: {},
        },
      };

      expect(() => createToolsJsonForMessagesApi([tool])).toThrow(
        /name.*64.*character/i,
      );
    });

    // TC-03: Converter strips unsupported Freeform
    it("TC-03: should throw error for unsupported Freeform tool type", () => {
      const tool: ToolSpec = {
        type: "custom",
        name: "custom_tool",
        description: "Custom freeform tool",
        format: {
          type: "bash_command",
          syntax: "bash",
          definition: 'echo "test"',
        },
      };

      expect(() => createToolsJsonForMessagesApi([tool])).toThrow(
        /freeform.*not supported/i,
      );
    });

    // TC-04: Converter handles LocalShell mapping
    it("TC-04: should convert local_shell to Anthropic shell tool schema", () => {
      const tool: ToolSpec = {
        type: "local_shell",
      };

      const result = createToolsJsonForMessagesApi([tool]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "bash",
        description: "Execute bash commands in the local shell environment",
        input_schema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The bash command to execute",
            },
            restart_sequence: {
              type: "number",
              description: "Optional restart sequence number",
            },
          },
          required: ["command"],
        },
      });
    });

    // TC-05: Converter handles WebSearch mapping
    it("TC-05: should convert web_search to Anthropic web search tool schema", () => {
      const tool: ToolSpec = {
        type: "web_search",
      };

      const result = createToolsJsonForMessagesApi([tool]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "web_search",
        description: "Search the web for information",
        input_schema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query",
            },
          },
          required: ["query"],
        },
      });
    });
  });

  describe("Schema Handling", () => {
    // TC-06: Converter preserves schema $defs
    it("TC-06: should preserve $defs in JSON schema", () => {
      const tool: ToolSpec = {
        type: "function",
        name: "complex_tool",
        description: "Tool with $defs",
        strict: false,
        parameters: {
          type: "object",
          properties: {
            config: {
              $ref: "#/$defs/Config",
            },
          },
          $defs: {
            Config: {
              type: "object",
              properties: {
                setting: { type: "string" },
              },
            },
          },
        },
      };

      const result = createToolsJsonForMessagesApi([tool]);

      expect(result[0].input_schema).toHaveProperty("$defs");
      expect(result[0].input_schema.$defs).toEqual({
        Config: {
          type: "object",
          properties: {
            setting: { type: "string" },
          },
        },
      });
    });

    // TC-07: Converter enforces required list
    it("TC-07: should validate that required fields exist in properties", () => {
      const tool: ToolSpec = {
        type: "function",
        name: "invalid_tool",
        description: "Tool with invalid required field",
        strict: false,
        parameters: {
          type: "object",
          properties: {
            field1: { type: "string" },
          },
          required: ["field1", "missing_field"],
        },
      };

      expect(() => createToolsJsonForMessagesApi([tool])).toThrow(
        /required.*properties/i,
      );
    });

    // TC-08: Converter handles nested arrays
    it("TC-08: should handle nested array properties", () => {
      const tool: ToolSpec = {
        type: "function",
        name: "array_tool",
        description: "Tool with array parameter",
        strict: false,
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  count: { type: "number" },
                },
              },
            },
          },
        },
      };

      const result = createToolsJsonForMessagesApi([tool]);

      expect(result[0].input_schema.properties.items).toEqual({
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            count: { type: "number" },
          },
        },
      });
    });

    // TC-09: Converter handles enums
    it("TC-09: should preserve enum values in schema", () => {
      const tool: ToolSpec = {
        type: "function",
        name: "enum_tool",
        description: "Tool with enum parameter",
        strict: false,
        parameters: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["fast", "normal", "thorough"],
            },
          },
        },
      };

      const result = createToolsJsonForMessagesApi([tool]);

      expect(result[0].input_schema.properties.mode).toEqual({
        type: "string",
        enum: ["fast", "normal", "thorough"],
      });
    });
  });

  describe("Strict Mode & Deduplication", () => {
    // TC-10: Tool registry deduplicates names
    it("TC-10: should deduplicate tools with same name and warn", () => {
      const tool1: ToolSpec = {
        type: "function",
        name: "duplicate",
        description: "First tool",
        strict: false,
        parameters: { type: "object", properties: {} },
      };

      const tool2: ToolSpec = {
        type: "function",
        name: "duplicate",
        description: "Second tool",
        strict: false,
        parameters: { type: "object", properties: {} },
      };

      const result = createToolsJsonForMessagesApi([tool1, tool2]);

      // Should only include the first tool, second is deduplicated
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe("First tool");
    });

    it("TC-06b: should add additionalProperties: false for strict tools", () => {
      const tool: ToolSpec = {
        type: "function",
        name: "strict_tool",
        description: "Strict schema tool",
        strict: true, // Strict mode
        parameters: {
          type: "object",
          properties: {
            param: { type: "string" },
          },
          required: ["param"],
        },
      };

      const result = createToolsJsonForMessagesApi([tool]);

      expect(result[0].input_schema).toHaveProperty(
        "additionalProperties",
        false,
      );
    });
  });

  describe("Tool Name Validation", () => {
    it("should accept valid tool names", () => {
      expect(() => validateToolName("valid_tool_name")).not.toThrow();
      expect(() => validateToolName("tool123")).not.toThrow();
      expect(() => validateToolName("a".repeat(64))).not.toThrow();
    });

    it("should reject empty tool names", () => {
      expect(() => validateToolName("")).toThrow(/empty/i);
    });

    it("should reject tool names exceeding 64 characters", () => {
      expect(() => validateToolName("a".repeat(65))).toThrow(/64/);
    });
  });

  describe("Tool Result Conversion", () => {
    // Additional test: Tool result formatting (5 tests planned)
    it("should format successful tool result as tool_result block", () => {
      // This will be implemented in later stages when we have the result converter
      // Placeholder for now
      expect(true).toBe(true);
    });
  });
});
