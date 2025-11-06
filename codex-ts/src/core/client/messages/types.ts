/**
 * Anthropic Messages API type definitions.
 *
 * This module defines the core types for the Anthropic Messages API integration,
 * including request payloads, content blocks, SSE events, and tool schemas.
 *
 * Reference: MESSAGES_API_INTEGRATION_DESIGN_CODEX.md
 * Phase: 4.2 - Stage 1 (Foundation & Types)
 *
 * Design Document Sections:
 * - Section 2.1: Messages API Request Model
 * - Section 2.2: Content Block Normalization
 * - Section 2.3: Streaming Adapter
 * - Section 3.1: Tool Format Specification
 */

// ============================================================================
// Messages API Request Types
// ============================================================================

/**
 * Tool choice strategy for Anthropic Messages API.
 *
 * - 'auto': Model decides whether to use tools
 * - 'any': Model must use at least one tool
 * - 'none': Model must not use tools (2025 beta feature)
 * - {type: 'tool', name: string}: Model must use the specified tool
 */
export type AnthropicToolChoice =
  | 'auto'
  | 'any'
  | 'none'
  | { type: 'tool'; name: string }

/**
 * Thinking configuration for extended reasoning.
 */
export interface AnthropicThinkingConfig {
  /** Budget for reasoning tokens */
  budget_tokens?: number
}

/**
 * Complete request payload for Anthropic Messages API.
 *
 * Reference: Design Section 2.1
 */
export interface MessagesApiRequest {
  /** Model identifier (e.g., 'claude-3-5-sonnet-20241022') */
  model: string

  /** Conversation messages */
  messages: AnthropicMessage[]

  /** Maximum tokens to generate */
  max_output_tokens?: number

  /** System instructions (separate from messages array) */
  system?: string

  /** Request metadata for tracing */
  metadata?: Record<string, unknown>

  /** Tool choice strategy */
  tool_choice?: AnthropicToolChoice

  /** Available tools */
  tools?: AnthropicTool[]

  /** Enable streaming */
  stream: boolean

  /** Sampling temperature (0.0 - 1.0) */
  temperature?: number

  /** Top-K sampling */
  top_k?: number

  /** Top-P (nucleus) sampling */
  top_p?: number

  /** Stop sequences */
  stop_sequences?: string[]

  /** Thinking/reasoning configuration */
  thinking?: AnthropicThinkingConfig
}

/**
 * Message role in Anthropic Messages API.
 */
export type AnthropicRole = 'user' | 'assistant'

/**
 * A message in the Messages API format.
 */
export interface AnthropicMessage {
  /** Role of the message sender */
  role: AnthropicRole

  /** Content blocks (text, thinking, tool_use, tool_result, etc.) */
  content: AnthropicContentBlock[]
}

// ============================================================================
// Content Block Types
// ============================================================================

/**
 * Union of all content block types.
 *
 * Reference: Design Section 2.2 (Content Block Normalization)
 */
export type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock
  | AnthropicImageBlock
  | AnthropicDocumentBlock

/**
 * Text content block.
 */
export interface AnthropicTextBlock {
  type: 'text'
  text: string
}

/**
 * Thinking (reasoning) content block.
 *
 * Extended reasoning from models that support thinking.
 */
export interface AnthropicThinkingBlock {
  type: 'thinking'
  thinking: string
}

/**
 * Tool use block (model calling a tool).
 */
export interface AnthropicToolUseBlock {
  type: 'tool_use'
  /** Unique ID for this tool call */
  id: string
  /** Tool name */
  name: string
  /** Tool input (JSON object) */
  input: Record<string, unknown>
}

/**
 * Tool result block (response to a tool_use).
 */
export interface AnthropicToolResultBlock {
  type: 'tool_result'
  /** ID of the tool_use block this responds to */
  tool_use_id: string
  /** Result content (text or structured) */
  content: string | AnthropicContentBlock[]
  /** Whether the tool execution failed */
  is_error?: boolean
}

/**
 * Image content block.
 */
export interface AnthropicImageBlock {
  type: 'image'
  source: {
    type: 'base64' | 'url'
    media_type: string
    data?: string
    url?: string
  }
}

/**
 * Document content block.
 */
export interface AnthropicDocumentBlock {
  type: 'document'
  source: {
    type: 'base64' | 'url'
    media_type: string
    data?: string
    url?: string
  }
}

// ============================================================================
// Tool Definition Types
// ============================================================================

/**
 * Anthropic tool schema.
 *
 * Reference: Design Section 3.1 (Tool Format Specification)
 */
export interface AnthropicTool {
  /** Tool name (max 64 characters) */
  name: string

  /** Tool description */
  description?: string

  /** JSON Schema for tool input parameters */
  input_schema: AnthropicToolInputSchema
}

/**
 * JSON Schema for tool input.
 */
export interface AnthropicToolInputSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
  $defs?: Record<string, unknown>
}

// ============================================================================
// SSE Event Types
// ============================================================================

/**
 * Union of all Anthropic SSE event types.
 *
 * Reference: Design Section 2.3 (Streaming Adapter)
 */
export type AnthropicSseEvent =
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | PingEvent
  | ErrorEvent

/**
 * Message start event (beginning of response).
 */
export interface MessageStartEvent {
  type: 'message_start'
  message: {
    id: string
    type: 'message'
    role: 'assistant'
    content: []
    model: string
    stop_reason: null
    stop_sequence: null
    usage: {
      input_tokens: number
      output_tokens: number
    }
  }
}

/**
 * Message delta event (usage updates, stop reason).
 */
export interface MessageDeltaEvent {
  type: 'message_delta'
  delta: {
    stop_reason?: string
    stop_sequence?: string | null
  }
  usage?: {
    output_tokens?: number
    reasoning_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

/**
 * Message stop event (end of response).
 */
export interface MessageStopEvent {
  type: 'message_stop'
}

/**
 * Content block start event.
 */
export interface ContentBlockStartEvent {
  type: 'content_block_start'
  index: number
  content_block:
    | { type: 'text'; text: string }
    | { type: 'thinking'; thinking: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
}

/**
 * Content block delta event (incremental content).
 */
export interface ContentBlockDeltaEvent {
  type: 'content_block_delta'
  index: number
  delta:
    | { type: 'text_delta'; text: string }
    | { type: 'thinking_delta'; thinking: string }
    | { type: 'input_json_delta'; partial_json: string }
}

/**
 * Content block stop event (end of block).
 */
export interface ContentBlockStopEvent {
  type: 'content_block_stop'
  index: number
}

/**
 * Ping event (keep-alive).
 */
export interface PingEvent {
  type: 'ping'
}

/**
 * Error event.
 */
export interface ErrorEvent {
  type: 'error'
  error: {
    type: string
    message: string
  }
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Token usage information.
 */
export interface AnthropicUsage {
  input_tokens?: number
  output_tokens?: number
  reasoning_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

/**
 * Complete (non-streaming) response from Messages API.
 */
export interface MessagesApiResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: AnthropicContentBlock[]
  model: string
  stop_reason: string | null
  stop_sequence: string | null
  usage: AnthropicUsage
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Anthropic error response.
 *
 * Reference: Design Section 2.10 (Error Handling)
 */
export interface AnthropicError {
  type: 'error'
  error: {
    type:
      | 'invalid_request_error'
      | 'authentication_error'
      | 'permission_error'
      | 'not_found_error'
      | 'rate_limit_error'
      | 'overloaded_error'
      | 'api_error'
    message: string
  }
}

/**
 * Rate limit information from response headers.
 *
 * Reference: Design Section 2.5 (Rate Limit & Usage Tracking)
 */
export interface AnthropicRateLimitInfo {
  requests?: {
    limit?: number
    remaining?: number
    reset?: string
  }
  tokens?: {
    limit?: number
    remaining?: number
    reset?: string
  }
}

// ============================================================================
// Provider Configuration Types
// ============================================================================

/**
 * Anthropic-specific provider configuration.
 *
 * Reference: Design Section 2.12 (Authentication & Configuration)
 */
export interface AnthropicProviderConfig {
  /** Base URL (default: 'https://api.anthropic.com') */
  baseUrl?: string

  /** API version (default: '2023-06-01') */
  anthropicVersion?: string

  /** API key (if omitted, reads from ANTHROPIC_API_KEY env var) */
  apiKey?: string

  /** How to emit reasoning content */
  reasoningEmission?: 'none' | 'readable' | 'raw'

  /** Default max output tokens */
  maxOutputTokens?: number

  /** Connect timeout in milliseconds */
  connectTimeoutMs?: number
}
