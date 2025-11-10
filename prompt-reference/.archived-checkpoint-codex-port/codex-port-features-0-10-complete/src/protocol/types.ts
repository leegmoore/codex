export interface TokenUsage {
  input_tokens: number;
  input_tokens_details?: unknown;
  output_tokens: number;
  output_tokens_details?: unknown;
  total_tokens: number;
}

export interface OutputTextContent {
  type: "output_text" | "text";
  text: string;
}

export interface InputTextContent {
  type: "input_text";
  text: string;
}

export interface OutputImageContent {
  type: "output_image";
  image_url: string;
  alt_text?: string | null;
}

export interface InputImageContent {
  type: "input_image";
  image_url: string;
}

export interface ReasoningTextContent {
  type: "reasoning_text";
  text: string;
}

export interface ReasoningSummaryTextContent {
  type: "summary_text";
  text: string;
}

export type ResponseContentItem =
  | OutputTextContent
  | InputTextContent
  | OutputImageContent
  | InputImageContent
  | ReasoningTextContent
  | ReasoningSummaryTextContent
  | { type: string; [key: string]: unknown };

export interface ResponseMessageItem {
  type: "message";
  role: string;
  content: ResponseContentItem[];
  id?: string;
  name?: string;
  call_id?: string;
}

export interface ReasoningSummary {
  type: "summary_text";
  text: string;
}

export interface ReasoningContent {
  type: "reasoning_text" | "text";
  text: string;
}

export interface ResponseReasoningItem {
  type: "reasoning";
  id?: string;
  summary: ReasoningSummary[];
  content?: ReasoningContent[];
  encrypted_content?: string | null;
}

export interface LocalShellStatusBase {
  type: "local_shell_call";
  id?: string;
  call_id?: string;
  status: "completed" | "in_progress" | "incomplete";
}

export interface LocalShellExecAction {
  type: "exec";
  command: string[];
  timeout_ms?: number | null;
  working_directory?: string | null;
  env?: Record<string, string>;
  user?: string | null;
}

export interface ResponseLocalShellCallItem extends LocalShellStatusBase {
  action: LocalShellExecAction | { type: string; [key: string]: unknown };
}

export interface ResponseFunctionCallItem {
  type: "function_call";
  id?: string;
  name: string;
  arguments: string;
  call_id: string;
}

export interface FunctionCallOutputPayload {
  content: string;
  success?: boolean;
  structured_content?: unknown;
}

export interface ResponseFunctionCallOutputItem {
  type: "function_call_output";
  call_id: string;
  output: FunctionCallOutputPayload;
}

export interface ResponseCustomToolCallItem {
  type: "custom_tool_call";
  id?: string;
  status?: string;
  call_id: string;
  name: string;
  input: string;
}

export interface ResponseCustomToolCallOutputItem {
  type: "custom_tool_call_output";
  call_id: string;
  output: string;
}

export interface ResponseWebSearchCallItem {
  type: "web_search_call";
  id?: string;
  status?: string;
  action: {
    type: string;
    query?: string;
    [key: string]: unknown;
  };
}

export interface ResponseOtherItem {
  type: string;
  [key: string]: unknown;
}

export type ResponseItem =
  | ResponseMessageItem
  | ResponseReasoningItem
  | ResponseLocalShellCallItem
  | ResponseFunctionCallItem
  | ResponseFunctionCallOutputItem
  | ResponseCustomToolCallItem
  | ResponseCustomToolCallOutputItem
  | ResponseWebSearchCallItem
  | ResponseOtherItem;

export type ResponseEvent =
  | { type: "created" }
  | { type: "output_item.done"; item: ResponseItem }
  | { type: "completed"; responseId: string; tokenUsage: TokenUsage | null }
  | { type: "output_text.delta"; delta: string }
  | { type: "reasoning_summary.delta"; delta: string }
  | { type: "reasoning_content.delta"; delta: string }
  | { type: "reasoning_summary.part_added" }
  | { type: "web_search_call.begin"; callId: string }
  | { type: "rate_limits"; snapshot: unknown };
