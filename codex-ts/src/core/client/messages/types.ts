/**
 * Anthropic Messages API type definitions for Codex.
 *
 * Type definitions for Anthropic's Messages API integration including
 * request/response models, SSE events, and content blocks.
 *
 * Design: MESSAGES_API_INTEGRATION_DESIGN_CODEX.md
 */

/**
 * Anthropic message role types.
 */
export type AnthropicRole = "user" | "assistant";

/**
 * Anthropic content block types.
 *
 * Represents the various content block types supported by the Messages API.
 */
export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string | AnthropicContentBlock[];
      is_error?: boolean;
    }
  | {
      type: "image";
      source: {
        type: "base64" | "url";
        media_type: string;
        data?: string;
        url?: string;
      };
    }
  | {
      type: "document";
      source: {
        type: "base64";
        media_type: string;
        data: string;
      };
    };

/**
 * Anthropic message structure.
 */
export interface AnthropicMessage {
  role: AnthropicRole;
  content: string | AnthropicContentBlock[];
}

/**
 * Tool choice configuration for Anthropic.
 */
export type AnthropicToolChoice =
  | "auto"
  | "any"
  | "none"
  | { type: "tool"; name: string };

/**
 * Anthropic tool schema definition.
 */
export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    [key: string]: unknown; // Allow for $defs and other JSON Schema extensions
  };
}

/**
 * Thinking configuration for extended thinking mode.
 */
export interface ThinkingConfig {
  /** Optional token budget for thinking */
  budget_tokens?: number;
  /** Optional type (e.g., 'enabled') */
  type?: string;
}

/**
 * Messages API request structure.
 */
export interface MessagesApiRequest {
  /** Model identifier (e.g., 'claude-3-5-sonnet-20241022') */
  model: string;
  /** Array of messages in the conversation */
  messages: AnthropicMessage[];
  /** Maximum tokens to generate */
  max_output_tokens?: number;
  /** Optional system prompt */
  system?: string | AnthropicContentBlock[];
  /** Optional metadata for tracking */
  metadata?: {
    user_id?: string;
    trace_id?: string;
    [key: string]: unknown;
  };
  /** Optional array of stop sequences */
  stop_sequences?: string[];
  /** Enable streaming responses */
  stream: boolean;
  /** Optional temperature (0.0-1.0) */
  temperature?: number;
  /** Optional top_p sampling (0.0-1.0) */
  top_p?: number;
  /** Optional top_k sampling */
  top_k?: number;
  /** Optional tools array */
  tools?: AnthropicTool[];
  /** Optional tool choice strategy */
  tool_choice?: AnthropicToolChoice;
  /** Optional thinking configuration */
  thinking?: ThinkingConfig;
}

/**
 * SSE event types from Anthropic streaming.
 */
export type AnthropicSseEventType =
  | "message_start"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "message_delta"
  | "message_stop"
  | "ping"
  | "error";

/**
 * Message start event data.
 */
export interface MessageStartData {
  type: "message";
  id: string;
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Content block start event data.
 */
export type ContentBlockStartData =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    };

/**
 * Content block delta data.
 */
export type ContentBlockDelta =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; thinking: string }
  | { type: "input_json_delta"; partial_json: string };

/**
 * Usage information structure.
 */
export interface UsageInfo {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * Message delta event data.
 */
export interface MessageDeltaData {
  stop_reason?: string | null;
  stop_sequence?: string | null;
  usage?: UsageInfo;
}

/**
 * Anthropic SSE event structure.
 */
export type AnthropicSseEvent =
  | {
      type: "message_start";
      message: MessageStartData;
    }
  | {
      type: "content_block_start";
      index: number;
      content_block: ContentBlockStartData;
    }
  | {
      type: "content_block_delta";
      index: number;
      delta: ContentBlockDelta;
    }
  | {
      type: "content_block_stop";
      index: number;
    }
  | {
      type: "message_delta";
      delta: MessageDeltaData;
      usage?: UsageInfo;
    }
  | {
      type: "message_stop";
    }
  | {
      type: "ping";
    }
  | {
      type: "error";
      error: {
        type: string;
        message: string;
      };
    };

/**
 * Anthropic error response structure.
 */
export interface AnthropicError {
  type: "error";
  error: {
    type: string;
    message: string;
  };
}

/**
 * Rate limit header names from Anthropic.
 */
export const ANTHROPIC_RATE_LIMIT_HEADERS = {
  REQUESTS_LIMIT: "anthropic-ratelimit-requests-limit",
  REQUESTS_REMAINING: "anthropic-ratelimit-requests-remaining",
  REQUESTS_RESET: "anthropic-ratelimit-requests-reset",
  TOKENS_LIMIT: "anthropic-ratelimit-tokens-limit",
  TOKENS_REMAINING: "anthropic-ratelimit-tokens-remaining",
  TOKENS_RESET: "anthropic-ratelimit-tokens-reset",
  RETRY_AFTER: "retry-after",
} as const;

/**
 * Default Anthropic API configuration.
 */
export const ANTHROPIC_DEFAULTS = {
  BASE_URL: "https://api.anthropic.com",
  API_VERSION: "2023-06-01",
  MAX_OUTPUT_TOKENS: 4096,
  TEMPERATURE: 1.0,
} as const;

/**
 * Anthropic provider-specific configuration.
 */
export interface AnthropicProviderConfig {
  /** Base URL for API (default: https://api.anthropic.com) */
  baseUrl?: string;
  /** Anthropic API version header (default: 2023-06-01) */
  anthropicVersion?: string;
  /** API key (falls back to ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Reasoning emission mode */
  reasoningEmission?: "none" | "readable" | "raw";
  /** Max output tokens default */
  maxOutputTokens?: number;
  /** Optional beta features */
  beta?: string[];
}
