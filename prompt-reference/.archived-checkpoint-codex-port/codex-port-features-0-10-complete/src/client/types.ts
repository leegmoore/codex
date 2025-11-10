export interface ResponsesContentPart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface ResponsesMessage {
  id?: string;
  role: string;
  content: ResponsesContentPart[];
  tool_call_id?: string;
}

export interface ResponsesFunctionTool {
  type: "function";
  name: string;
  description?: string;
  strict?: boolean;
  parameters: Record<string, unknown>;
}

export type ResponsesTool = ResponsesFunctionTool;

export interface ResponsesRequest {
  model: string;
  instructions?: string;
  previous_response_id?: string;
  input?: Array<Record<string, unknown>>;
  messages: ResponsesMessage[];
  tools?: ResponsesTool[];
  parallel_tool_calls?: boolean;
  max_output_tokens?: number;
  store?: boolean;
  stream?: boolean;
  tool_choice?: string | Record<string, unknown>;
  // Additional fields used by CLI payloads
  include?: string[];
  reasoning?: Record<string, unknown>;
  prompt_cache_key?: string;
  [key: string]: unknown;
}

export interface AssistantMessageItem {
  id?: string;
  role: "assistant";
  content: Array<{ type: "text"; text: string }>;
}

export interface ToolUseItem {
  type: "tool_use";
  call_id: string;
  name: string;
  input: unknown;
}

export type StreamItem = AssistantMessageItem | ToolUseItem;

export interface TokenUsage {
  input_tokens: number;
  input_tokens_details?: unknown;
  output_tokens: number;
  output_tokens_details?: unknown;
  total_tokens: number;
}
