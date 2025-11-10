import { loadAuthInfo, type AuthInfo } from "../client/auth";
import type { PromptV2Request } from "../agent-v2/prompt";
import type {
  ResponseEvent,
  ResponseFunctionCallOutputItem,
  ResponseItem,
  TokenUsage,
} from "../protocol/types";

export class ResponsesStreamError extends Error {
  readonly retryAfterMs: number | null;

  constructor(message: string, options?: { retryAfterMs?: number | null }) {
    super(message);
    this.name = "ResponsesStreamError";
    this.retryAfterMs = options?.retryAfterMs ?? null;
  }
}

export class ContextWindowExceededError extends ResponsesStreamError {
  constructor(message = "context window exceeded") {
    super(message);
    this.name = "ContextWindowExceededError";
  }
}

export interface ResponsesEventStream extends AsyncIterable<ResponseEvent> {
  responseId: string | null;
}

export interface ResponsesClientV2Options {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  authProvider?: () => Promise<AuthInfo>;
  timeoutMs?: number;
}

const CHATGPT_BASE_URL = "https://chatgpt.com/backend-api/codex";
const OPENAI_ENDPOINT_PATH = "/v1/responses";
const OPENAI_BETA_HEADER_VALUE = "responses=experimental";
const DEFAULT_TIMEOUT_MS = 60_000;

const RETRY_AFTER_RE = /Please try again in (\d+(?:\.\d+)?)(ms|s)/i;

interface ParserState {
  completed: CompletedInfo | null;
  responseId: string | null;
}

interface CompletedInfo {
  responseId: string;
  tokenUsage: TokenUsage | null;
}

interface HandlerOutcome {
  events: ResponseEvent[];
  stop: boolean;
}

export function parseResponsesStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ResponseEvent, void, unknown> {
  return (async function* (): AsyncGenerator<ResponseEvent, void, unknown> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const state: ParserState = { completed: null, responseId: null };
    let buffer = "";
    let finished = false;

    try {
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          finished = true;
        } else if (value) {
          buffer += decoder.decode(value, { stream: true });
        }

        while (true) {
          const boundary = buffer.indexOf("\n\n");

          if (boundary === -1) {
            if (finished) {
              const chunk = buffer.trim().length > 0 ? buffer : "";
              buffer = "";
              if (chunk) {
                const outcome = handleChunk(chunk, state);
                for (const event of outcome.events) {
                  yield event;
                }
                if (outcome.stop) {
                  finished = true;
                }
              }
            }
            break;
          }

          const chunk = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          if (!chunk.trim().length) {
            continue;
          }

          const outcome = handleChunk(chunk, state);
          for (const event of outcome.events) {
            yield event;
          }

          if (outcome.stop) {
            finished = true;
            buffer = "";
            break;
          }
        }
      }
    } finally {
      reader.releaseLock?.();
    }

    if (!state.completed) {
      throw new Error("stream closed before response.completed");
    }

    yield {
      type: "completed",
      responseId: state.completed.responseId,
      tokenUsage: state.completed.tokenUsage,
    };
  })();
}

function handleChunk(chunk: string, state: ParserState): HandlerOutcome {
  const { event, data } = parseChunk(chunk);

  if (data === "[DONE]") {
    return { events: [], stop: true };
  }

  if (!event) {
    return { events: [], stop: false };
  }

  const parsed = data !== null ? safeJsonParse(data) : null;

  switch (event) {
    case "response.created": {
      if (isRecord(parsed) && "response" in parsed) {
        const response = parsed.response;
        if (isRecord(response)) {
          const responseId =
            getString(response.id) ?? getString(parsed.id) ?? state.responseId;
          if (responseId) {
            state.responseId = responseId;
          }
        }
        return { events: [{ type: "created" }], stop: false };
      }
      return { events: [], stop: false };
    }
    case "response.output_item.done": {
      if (!isRecord(parsed) || !("item" in parsed)) {
        return { events: [], stop: false };
      }
      const item = toResponseItem((parsed as { item: unknown }).item);
      if (!item) {
        return { events: [], stop: false };
      }
      if (isRecord(item) && !state.responseId && "id" in item) {
        const responseId = getString(item.id);
        if (responseId) {
          state.responseId = responseId;
        }
      }
      return { events: [{ type: "output_item.done", item }], stop: false };
    }
    case "response.output_text.delta": {
      const delta = isRecord(parsed) ? getString(parsed.delta) : null;
      if (delta !== null) {
        return { events: [{ type: "output_text.delta", delta }], stop: false };
      }
      return { events: [], stop: false };
    }
    case "response.reasoning_summary_text.delta": {
      const delta = isRecord(parsed) ? getString(parsed.delta) : null;
      if (delta !== null) {
        return {
          events: [{ type: "reasoning_summary.delta", delta }],
          stop: false,
        };
      }
      return { events: [], stop: false };
    }
    case "response.reasoning_text.delta": {
      const delta = isRecord(parsed) ? getString(parsed.delta) : null;
      if (delta !== null) {
        return {
          events: [{ type: "reasoning_content.delta", delta }],
          stop: false,
        };
      }
      return { events: [], stop: false };
    }
    case "response.reasoning_summary_part.added": {
      return { events: [{ type: "reasoning_summary.part_added" }], stop: false };
    }
    case "response.output_item.added": {
      if (!isRecord(parsed) || !("item" in parsed)) {
        return { events: [], stop: false };
      }
      const item = parsed.item;
      if (isRecord(item) && item.type === "web_search_call") {
        const callId =
          getString(item.id) ?? getString(item.call_id) ?? getString(item.callId) ?? "";
        return {
          events: [{ type: "web_search_call.begin", callId }],
          stop: false,
        };
      }
      return { events: [], stop: false };
    }
    case "response.rate_limits.updated": {
      if (parsed !== null) {
        return { events: [{ type: "rate_limits", snapshot: parsed }], stop: false };
      }
      return { events: [], stop: false };
    }
    case "response.completed": {
      if (!isRecord(parsed)) {
        return { events: [], stop: false };
      }
      const response = isRecord(parsed.response) ? parsed.response : null;
      const responseId =
        (response && getString(response.id)) ??
        getString(parsed.id) ??
        state.responseId ??
        "";
      const usage =
        response && "usage" in response ? normalizeTokenUsage(response.usage) : null;

      state.responseId = responseId || state.responseId;
      state.completed = {
        responseId,
        tokenUsage: usage,
      };
      return { events: [], stop: false };
    }
    case "response.failed": {
      throw buildStreamError(parsed);
    }
    default:
      return { events: [], stop: false };
  }
}

function parseChunk(chunk: string): { event: string | null; data: string | null } {
  let event: string | null = null;
  const dataLines: string[] = [];

  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  return {
    event,
    data: dataLines.length > 0 ? dataLines.join("\n") : null,
  };
}

function safeJsonParse(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function toResponseItem(value: unknown): ResponseItem | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.type !== "string") {
    return null;
  }
  return value as ResponseItem;
}

function normalizeTokenUsage(value: unknown): TokenUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const inputTokens = value.input_tokens;
  const outputTokens = value.output_tokens;
  const totalTokens = value.total_tokens;

  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    typeof totalTokens !== "number"
  ) {
    return null;
  }

  return {
    input_tokens: inputTokens,
    input_tokens_details: value.input_tokens_details,
    output_tokens: outputTokens,
    output_tokens_details: value.output_tokens_details,
    total_tokens: totalTokens,
  };
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseRetryAfterMs(message?: string | null): number | null {
  if (!message) {
    return null;
  }

  const match = RETRY_AFTER_RE.exec(message);
  if (!match) {
    return null;
  }

  const rawValue = Number(match[1]);
  if (!Number.isFinite(rawValue)) {
    return null;
  }

  const unit = match[2];
  if (unit === "ms") {
    return Math.round(rawValue);
  }
  if (unit === "s") {
    return Math.round(rawValue * 1000);
  }
  return null;
}

function buildStreamError(parsed: unknown): ResponsesStreamError {
  const response = isRecord(parsed) && isRecord(parsed.response) ? parsed.response : null;
  const errorInfo =
    response && isRecord(response.error)
      ? response.error
      : isRecord(parsed) && isRecord(parsed.error)
        ? parsed.error
        : null;

  const message =
    (errorInfo && getString(errorInfo.message)) ?? "response.failed event received";
  const code = errorInfo ? getString(errorInfo.code) : null;

  if (code === "context_length_exceeded") {
    return new ContextWindowExceededError(message);
  }

  const retryAfterMs = parseRetryAfterMs(message);
  return new ResponsesStreamError(message, { retryAfterMs });
}

function serializeFunctionCallOutputs(request: PromptV2Request): PromptV2Request {
  if (!Array.isArray(request.input) || request.input.length === 0) {
    return request;
  }

  let mutated = false;

  const input = request.input.map((item) => {
    if (item.type !== "function_call_output") {
      return item;
    }

    const serialized = toSerializableFunctionOutputValue(item.output);
    if (serialized === null) {
      return item;
    }

    mutated = true;
    return {
      ...item,
      output: serialized,
    } as unknown as ResponseItem;
  }) as ResponseItem[];

  if (!mutated) {
    return request;
  }

  return {
    ...request,
    input,
  };
}

function toSerializableFunctionOutputValue(
  output: ResponseFunctionCallOutputItem["output"],
): string | null {
  if (typeof output === "string") {
    return null;
  }

  if (!output || typeof output !== "object") {
    return null;
  }

  const content = getString((output as Record<string, unknown>).content);
  if (content !== null) {
    return content;
  }

  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

class ResponsesEventStreamImpl implements ResponsesEventStream {
  private readonly iterator: AsyncGenerator<ResponseEvent, void, unknown>;
  private consumed = false;
  private internalResponseId: string | null = null;

  constructor(iterator: AsyncGenerator<ResponseEvent, void, unknown>) {
    this.iterator = iterator;
  }

  get responseId(): string | null {
    return this.internalResponseId;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ResponseEvent> {
    if (this.consumed) {
      throw new Error("ResponsesEventStream can only be iterated once");
    }
    this.consumed = true;
    for await (const event of this.iterator) {
      if (event.type === "completed") {
        this.internalResponseId = event.responseId;
      }
      yield event;
    }
  }
}

export class ResponsesClientV2 {
  private readonly explicitBaseUrl: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly authProvider: () => Promise<AuthInfo>;
  private readonly timeoutMs: number;
  private lastInstructions: string | null = null;

  constructor(options: ResponsesClientV2Options = {}) {
    this.explicitBaseUrl = options.baseUrl ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (options.authProvider) {
      this.authProvider = options.authProvider;
    } else {
      this.authProvider = loadAuthInfo;
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async create(request: PromptV2Request): Promise<ResponsesEventStream> {
    const auth = await this.authProvider();
    const token = auth.token;
    const url = this.resolveUrl(auth);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const payload = this.ensureInstructions(request);
    const serialized = serializeFunctionCallOutputs(payload);
    const outgoing = this.filterPayloadForTarget(serialized, url);

    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "OpenAI-Beta": OPENAI_BETA_HEADER_VALUE,
          "Codex-Task-Type": "agent",
          ...(auth.accountId ? { "chatgpt-account-id": auth.accountId } : {}),
        },
        body: JSON.stringify(outgoing),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        detail = "";
      }
      throw new Error(
        detail ? `Request failed with status ${response.status}: ${detail}` : `Request failed with status ${response.status}`,
      );
    }

    if (!response.body) {
      throw new Error("Response body is missing");
    }

    const iterator = parseResponsesStream(response.body);
    return new ResponsesEventStreamImpl(iterator);
  }

  private resolveUrl(auth: AuthInfo): string {
    if (this.explicitBaseUrl) {
      return new URL(OPENAI_ENDPOINT_PATH, this.explicitBaseUrl).toString();
    }
    return `${CHATGPT_BASE_URL}/responses`;
  }

  private ensureInstructions(request: PromptV2Request): PromptV2Request {
    if (typeof request.instructions === "string" && request.instructions.trim().length > 0) {
      this.lastInstructions = request.instructions;
      return request;
    }

    if (!this.lastInstructions) {
      return request;
    }

    return {
      ...request,
      instructions: this.lastInstructions,
    };
  }

  private filterPayloadForTarget(
    request: PromptV2Request,
    targetUrl: string,
  ): PromptV2Request {
    if (!targetUrl.startsWith(CHATGPT_BASE_URL)) {
      return request;
    }

    const clone: PromptV2Request = structuredClone(request);
    delete (clone as any).max_output_tokens;
    delete (clone as any).previous_response_id;
    return clone;
  }
}
