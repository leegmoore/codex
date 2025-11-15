import { createToolsJsonForResponsesApi } from "../tool-converters.js";
import {
  createTextParamForRequest,
  type Prompt,
  type ResponsesApiRequest,
  type SerializedResponseItem,
} from "../client-common.js";
import {
  getFullUrl,
  isAzureResponsesEndpoint,
  type ModelProviderInfo,
} from "../model-provider-info.js";
import type {
  ReasoningEffort,
  ReasoningSummary,
} from "../../../protocol/config-types.js";
import {
  attachFunctionCallOutputSerializer,
  serializeFunctionCallOutputPayload,
  type ContentItem,
  type FunctionCallOutputContentItem,
  type FunctionCallOutputPayload,
  type ReasoningItemContent,
  type ReasoningItemReasoningSummary,
  type ResponseItem,
} from "../../../protocol/models.js";

interface ResponsesClientOptions {
  provider: ModelProviderInfo;
  model: string;
  apiKey: string;
  reasoningEffort?: ReasoningEffort;
  reasoningSummary: ReasoningSummary;
  instructions?: string;
}

interface ResponsesContentBlock {
  type: string;
  text?: string;
  image_url?: string;
}

interface ResponsesReasoningSummaryBlock {
  type?: string;
  text?: string;
}

interface ResponsesReasoningContentBlock {
  type?: string;
  text?: string;
}

interface ResponsesMessageOutput {
  type: "message";
  id?: string;
  role?: string;
  content?: ResponsesContentBlock[];
}

interface ResponsesReasoningOutput {
  type: "reasoning";
  id?: string;
  summary?: ResponsesReasoningSummaryBlock[];
  content?: ResponsesReasoningContentBlock[];
  encrypted_content?: string;
}

interface ResponsesFunctionCallRequest {
  type: "function_call";
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: unknown;
}

type ResponsesFunctionCallOutputPayload =
  | string
  | ResponsesFunctionCallOutputObject
  | ResponsesFunctionCallOutputContentBlock[];

interface ResponsesFunctionCallOutputObject {
  content?: unknown;
  success?: unknown;
  content_items?: unknown;
}

interface ResponsesFunctionCallOutputContentBlock {
  type?: string;
  text?: string;
  image_url?: string;
}

interface ResponsesFunctionCallResult {
  type: "function_call_output";
  call_id?: string;
  output?: ResponsesFunctionCallOutputPayload;
}

type ResponsesOutputItem =
  | ResponsesMessageOutput
  | ResponsesReasoningOutput
  | ResponsesFunctionCallRequest
  | ResponsesFunctionCallResult;

interface ResponsesApiResponse {
  output?: ResponsesOutputItem[];
  response?: {
    output?: ResponsesOutputItem[];
  };
  error?: {
    message?: string;
  };
}

export const DEFAULT_RESPONSES_INSTRUCTIONS = `You are Cody, a helpful AI assistant with access to tools.

When you need information from the current workspace or system (inspect files, gather command output, etc.), call the appropriate tools. You will see the tool results and should incorporate them into your response before continuing the conversation.

Available tools:
- readFile: Read file contents with slice or structural modes
- writeFile: Write buffered File Cabinet content to disk
- exec: Run shell commands (use for gathering info or modifying files when needed)
- applyPatch: Apply unified diff patches
- fileSearch: Perform fuzzy file searches
- grepFiles: Search for patterns within files
- listDir: Inspect directory structures
- viewImage: Attach local images after validation

Always prefer using tools instead of guessing or relying on stale knowledge when you need up-to-date information.`;

export async function sendResponsesRequest(
  prompt: Prompt,
  options: ResponsesClientOptions,
): Promise<ResponseItem[]> {
  const endpoint = getFullUrl(options.provider);
  const headers = buildHeaders(options.provider, options.apiKey);
  const requestBody = buildRequestBody(prompt, options);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  const rawBody = await response.text();
  if (!response.ok) {
    const message = extractErrorMessage(rawBody);
    throw new Error(
      `Responses API request failed (${response.status}): ${message}`,
    );
  }

  const payload = parseJson(rawBody);
  const output = payload.output ?? payload.response?.output ?? [];
  const mapped = mapOutputToResponseItems(output);
  return mapped;
}

function buildRequestBody(
  prompt: Prompt,
  options: ResponsesClientOptions,
): ResponsesApiRequest {
  const instructions =
    prompt.baseInstructionsOverride ??
    options.instructions ??
    DEFAULT_RESPONSES_INSTRUCTIONS;

  const request: ResponsesApiRequest = {
    model: options.model,
    instructions,
    input: serializeInputItems(prompt.input),
    tools: createToolsJsonForResponsesApi(prompt.tools),
    tool_choice: "auto",
    parallel_tool_calls: prompt.parallelToolCalls,
    reasoning: buildReasoning(options),
    store: false,
    stream: false,
    include: [],
  };

  if (prompt.outputSchema) {
    request.text = createTextParamForRequest(undefined, prompt.outputSchema);
  }

  return request;
}

function serializeInputItems(items: ResponseItem[]): SerializedResponseItem[] {
  return items.map((item) => {
    const base: Record<string, unknown> = { ...item };
    delete base.id;
    if (item.type !== "function_call_output") {
      return base as SerializedResponseItem;
    }
    return {
      ...base,
      output: serializeFunctionCallOutputPayload(item.output),
    } as SerializedResponseItem;
  });
}

function buildReasoning({
  reasoningEffort,
  reasoningSummary,
}: ResponsesClientOptions): ResponsesApiRequest["reasoning"] {
  if (!reasoningEffort && !reasoningSummary) {
    return undefined;
  }

  return {
    effort: reasoningEffort,
    summary: reasoningSummary,
  };
}

function buildHeaders(
  provider: ModelProviderInfo,
  apiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  if (isAzureResponsesEndpoint(provider)) {
    headers["api-key"] = apiKey;
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  headers["OpenAI-Beta"] = headers["OpenAI-Beta"] ?? "assistants=v2";

  if (provider.httpHeaders) {
    for (const [key, value] of Object.entries(provider.httpHeaders)) {
      headers[key] = value;
    }
  }

  if (provider.envHttpHeaders) {
    for (const [key, envVar] of Object.entries(provider.envHttpHeaders)) {
      const value = process.env[envVar];
      if (value) {
        headers[key] = value;
      }
    }
  }

  return headers;
}

function parseJson(body: string): ResponsesApiResponse {
  try {
    return JSON.parse(body) as ResponsesApiResponse;
  } catch (error) {
    throw new Error(`Failed to parse Responses API payload: ${String(error)}`);
  }
}

function extractErrorMessage(body: string): string {
  try {
    const payload = JSON.parse(body) as ResponsesApiResponse;
    return payload.error?.message ?? body;
  } catch {
    return body;
  }
}

function mapOutputToResponseItems(
  output: ResponsesOutputItem[],
): ResponseItem[] {
  const items: ResponseItem[] = [];

  for (const entry of output) {
    switch (entry.type) {
      case "message":
        if (entry.role && entry.content) {
          const content = entry.content
            .map(mapContentBlock)
            .filter((block): block is ContentItem => Boolean(block));
          if (content.length > 0) {
            items.push({
              type: "message",
              id: entry.id,
              role: entry.role,
              content,
            });
          }
        }
        break;
      case "reasoning": {
        const summary = (entry.summary ?? [])
          .map(mapReasoningSummaryBlock)
          .filter((block): block is ReasoningItemReasoningSummary =>
            Boolean(block),
          );

        if (summary.length === 0) {
          break;
        }

        const reasoningItem: Extract<ResponseItem, { type: "reasoning" }> = {
          type: "reasoning",
          id: entry.id,
          summary,
        };

        const content = entry.content
          ?.map(mapReasoningContentBlock)
          .filter((block): block is ReasoningItemContent => Boolean(block));
        if (content && content.length > 0) {
          reasoningItem.content = content;
        }
        if (entry.encrypted_content) {
          reasoningItem.encrypted_content = entry.encrypted_content;
        }
        items.push(reasoningItem);
        break;
      }
      case "function_call": {
        const callId = entry.call_id;
        const name = entry.name;
        const args = normalizeArguments(entry.arguments);
        if (!callId || !name || !args) {
          break;
        }

        items.push({
          type: "function_call",
          id: entry.id,
          call_id: callId,
          name,
          arguments: args,
        });
        break;
      }
      case "function_call_output": {
        if (!entry.call_id) {
          break;
        }
        const outputPayload = mapFunctionCallOutputPayload(entry.output);
        if (!outputPayload) {
          break;
        }
        items.push({
          type: "function_call_output",
          call_id: entry.call_id,
          output: outputPayload,
        });
        break;
      }
      default:
        break;
    }
  }

  return items;
}

function mapContentBlock(
  block: ResponsesContentBlock,
): ContentItem | undefined {
  if (
    (block.type === "output_text" || block.type === "input_text") &&
    typeof block.text === "string"
  ) {
    return {
      type: block.type,
      text: block.text,
    } as ContentItem;
  }

  if (block.type === "input_image" && typeof block.image_url === "string") {
    return {
      type: "input_image",
      image_url: block.image_url,
    } as ContentItem;
  }

  return undefined;
}

function mapReasoningSummaryBlock(
  block: ResponsesReasoningSummaryBlock,
): ReasoningItemReasoningSummary | undefined {
  if (block.type === "summary_text" && typeof block.text === "string") {
    return { type: "summary_text", text: block.text };
  }
  return undefined;
}

function mapReasoningContentBlock(
  block: ResponsesReasoningContentBlock,
): ReasoningItemContent | undefined {
  if (
    (block.type === "reasoning_text" || block.type === "text") &&
    typeof block.text === "string"
  ) {
    return { type: block.type, text: block.text } as ReasoningItemContent;
  }
  return undefined;
}

function normalizeArguments(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  return safeStringify(value);
}

function mapFunctionCallOutputPayload(
  payload: ResponsesFunctionCallOutputPayload | undefined,
): FunctionCallOutputPayload | undefined {
  if (payload === undefined || payload === null) {
    return undefined;
  }

  if (typeof payload === "string") {
    return attachFunctionCallOutputSerializer({ content: payload });
  }

  if (Array.isArray(payload)) {
    const items = payload
      .map(mapFunctionCallOutputContentItem)
      .filter((item): item is FunctionCallOutputContentItem => Boolean(item));
    if (items.length === 0) {
      return undefined;
    }
    return attachFunctionCallOutputSerializer({
      content: safeStringify(items) ?? JSON.stringify(items),
      content_items: items,
    });
  }

  const objectPayload = payload as ResponsesFunctionCallOutputObject;
  const contentItemsRaw = Array.isArray(objectPayload.content_items)
    ? objectPayload.content_items
    : undefined;

  const contentItems = contentItemsRaw
    ?.map(mapFunctionCallOutputContentItem)
    .filter((item): item is FunctionCallOutputContentItem => Boolean(item));

  let content: string | undefined;
  if (typeof objectPayload.content === "string") {
    content = objectPayload.content;
  } else if (objectPayload.content !== undefined) {
    content = safeStringify(objectPayload.content);
  } else if (contentItems && contentItems.length > 0) {
    content = safeStringify(contentItems);
  }

  if (!content) {
    return undefined;
  }

  const result: FunctionCallOutputPayload = {
    content,
  };

  if (contentItems && contentItems.length > 0) {
    result.content_items = contentItems;
  }

  if (typeof objectPayload.success === "boolean") {
    result.success = objectPayload.success;
  }

  return attachFunctionCallOutputSerializer(result);
}

function mapFunctionCallOutputContentItem(
  item: ResponsesFunctionCallOutputContentBlock,
): FunctionCallOutputContentItem | undefined {
  if (item.type === "input_text" && typeof item.text === "string") {
    return { type: "input_text", text: item.text };
  }
  if (item.type === "input_image" && typeof item.image_url === "string") {
    return { type: "input_image", image_url: item.image_url };
  }
  return undefined;
}

function safeStringify(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
