import { loadAuthInfo, type AuthInfo } from "./auth";
import {
  AssistantMessageItem,
  ResponsesRequest,
  StreamItem,
  TokenUsage,
  ToolUseItem,
} from "./types";

interface UsageRef {
  current: TokenUsage | null;
}

export interface ResponsesClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  tokenProvider?: () => Promise<string>;
  authProvider?: () => Promise<AuthInfo>;
  timeoutMs?: number;
}

const CHATGPT_BASE_URL = "https://chatgpt.com/backend-api/codex";
const OPENAI_ENDPOINT_PATH = "/v1/responses";
const DEFAULT_TIMEOUT_MS = 60_000;
const OPENAI_BETA_HEADER_VALUE = "responses=experimental";

interface ResponseStateRef {
  responseId: string | null;
}

class ResponsesStream implements AsyncIterable<StreamItem> {
  constructor(
    private iterator: AsyncGenerator<StreamItem, void, undefined>,
    private usageRef: UsageRef,
    private stateRef: ResponseStateRef,
  ) {}

  get usage(): TokenUsage | null {
    return this.usageRef.current;
  }

  get responseId(): string | null {
    return this.stateRef.responseId;
  }

  [Symbol.asyncIterator](): AsyncIterator<StreamItem> {
    return this.iterator;
  }
}

export class ResponsesClient {
  private readonly explicitBaseUrl: string | null;
  private readonly fetchImpl: typeof fetch;
  private readonly authProvider: () => Promise<AuthInfo>;
  private readonly timeoutMs: number;
  private lastInstructions: string | null = null;

  constructor(options: ResponsesClientOptions = {}) {
    this.explicitBaseUrl = options.baseUrl ?? null;
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (options.authProvider) {
      this.authProvider = options.authProvider;
    } else if (options.tokenProvider) {
      const tokenProvider = options.tokenProvider;
      this.authProvider = async () => ({
        token: await tokenProvider(),
      });
    } else {
      this.authProvider = loadAuthInfo;
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async create(request: ResponsesRequest): Promise<ResponsesStream> {
    const auth = await this.authProvider();
    const token = auth.token;
    const url = this.resolveUrl(auth);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    const payload = this.buildPayload(request, auth);
    const outgoing = this.ensureInstructions(
      this.filterPayloadForTarget(payload, this.resolveUrl(auth)),
      request,
    );

    try {
      try {
        // Lightweight visibility into payload shape in logs
        const keys = Object.keys(outgoing);
        const hasInstr = typeof (outgoing as any).instructions === "string" && ((outgoing as any).instructions as string).trim().length > 0;
        let inputTypes: string[] = [];
        let inputSummary: Array<Record<string, unknown>> = [];
        const inp = (outgoing as any).input;
        if (Array.isArray(inp)) {
          inputTypes = inp
            .map((it) =>
              it && typeof it === "object" && "type" in it
                ? String((it as any).type)
                : typeof it,
            )
            .slice(0, 8);

          inputSummary = inp.slice(0, 6).map((item: unknown) => {
            if (!item || typeof item !== "object") {
              return { kind: typeof item };
            }
            const record = item as Record<string, unknown>;
            const summary: Record<string, unknown> = {};
            if (typeof record.type === "string") {
              summary.type = record.type;
            }
            if (typeof record.role === "string") {
              summary.role = record.role;
            }
            if (typeof record.name === "string") {
              summary.name = record.name;
            }
            if (typeof record.call_id === "string") {
              summary.call_id = record.call_id;
            }
            if (record.content && Array.isArray(record.content)) {
              const first = record.content[0];
              if (first && typeof first === "object" && "type" in first) {
                summary.first_content_type = (first as Record<string, unknown>).type;
              }
            }
            return summary;
          });
        }
        console.error("[responses] debug payload", {
          keys: keys.slice(0, 12),
          has_instructions: hasInstr,
          input_types: inputTypes,
          input_length: Array.isArray(inp) ? inp.length : undefined,
          input_summary: inputSummary,
        });
      } catch {}
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
      try {
        console.error(
          "[responses] request failed",
          response.status,
          detail,
          "payload:",
          JSON.stringify(outgoing),
        );
      } catch {
        console.error("[responses] request failed", response.status, detail);
      }
      throw new Error(`Request failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error("Response body is missing");
    }

    const usageRef: UsageRef = { current: null };
    const stateRef: ResponseStateRef = { responseId: null };
    const iterator = this.parseStream(response.body.getReader(), usageRef, stateRef);

    return new ResponsesStream(iterator, usageRef, stateRef);
  }

  private filterPayloadForTarget(
    payload: Record<string, unknown>,
    targetUrl: string,
  ): Record<string, unknown> {
    // Clone to avoid mutating the original
    const copy: Record<string, unknown> = JSON.parse(JSON.stringify(payload));

    // The ChatGPT Codex backend rejects some fields that OpenAI /v1/responses accepts.
    // Drop those when targeting the ChatGPT endpoint.
    if (targetUrl.startsWith(CHATGPT_BASE_URL)) {
      delete (copy as any).max_output_tokens;
      delete (copy as any).previous_response_id;
    }

    return copy;
  }

  private ensureInstructions(
    payload: Record<string, unknown>,
    request: ResponsesRequest,
  ): Record<string, unknown> {
    // Track the most recent non-empty instructions we've seen
    if (typeof request.instructions === "string" && request.instructions.trim().length > 0) {
      this.lastInstructions = request.instructions;
    }

    const hasTopLevel =
      typeof (payload as any).instructions === "string" &&
      ((payload as any).instructions as string).trim().length > 0;

    if (!hasTopLevel && this.lastInstructions) {
      (payload as any).instructions = this.lastInstructions;
    }

    return payload;
  }

  private resolveUrl(auth: AuthInfo): string {
    if (this.explicitBaseUrl) {
      return new URL(OPENAI_ENDPOINT_PATH, this.explicitBaseUrl).toString();
    }

    return `${CHATGPT_BASE_URL}/responses`;
  }

  private buildPayload(
    request: ResponsesRequest,
    auth: AuthInfo,
  ): Record<string, unknown> {
    const explicitInput = Array.isArray(
      (request as Record<string, unknown>).input,
    )
      ? ((request as Record<string, unknown>).input as Array<Record<string, unknown>>)
      : null;

    let payloadInput: unknown;

    // Helper to convert messages -> input messages (ChatGPT format)
    const toInputMessages = (
      messages: ResponsesMessage[],
      systemText?: string | null,
    ): { messages: ResponsesMessage[]; toolEvents: Array<Record<string, unknown>> } => {
      const toolEvents: Array<Record<string, unknown>> = [];
      const allowedTypes = new Set([
        "input_text",
        "input_image",
        "output_text",
        "refusal",
        "input_file",
        "computer_screenshot",
        "summary_text",
      ]);
      const cleaned = messages
        .map((message) => {
          if (message.role === "tool") {
            if (process.env.CODEX_DEBUG_HTTP === "1") {
              console.error("[responses] capturing tool output for call", (message as any).tool_call_id);
            }
            if (Array.isArray(message.content) && typeof (message as any).tool_call_id === "string") {
              const combinedOutput = message.content
                .map((part) => {
                  if (part && typeof part === "object" && "text" in part && typeof (part as any).text === "string") {
                    return (part as any).text as string;
                  }
                  try {
                    return JSON.stringify(part);
                  } catch {
                    return part === undefined || part === null ? "" : String(part);
                  }
                })
                .filter((segment) => segment.length > 0)
                .join("\n");

              toolEvents.push({
                type: "function_call_output",
                call_id: (message as any).tool_call_id,
                output: combinedOutput,
              });
            }
            return null;
          }
          if (
            message.role === "assistant" &&
            Array.isArray(message.content) &&
            message.content.some((part) => part && typeof part === "object" && (part as any).type === "tool_call")
          ) {
            if (process.env.CODEX_DEBUG_HTTP === "1") {
              console.error("[responses] capturing tool call entries");
            }
            message.content.forEach((part) => {
              if (part && typeof part === "object" && (part as any).type === "tool_call") {
                const callId = typeof (part as any).id === "string" ? (part as any).id : null;
                const name = typeof (part as any).name === "string" ? (part as any).name : null;
                const inputPayload = (part as any).input ?? {};
                if (callId && name) {
                  toolEvents.push({
                    type: "function_call",
                    name,
                    call_id: callId,
                    arguments: JSON.stringify(inputPayload ?? {}),
                  });
                }
              }
            });
            return null;
          }
          if (!Array.isArray(message.content)) {
            return message;
          }
          const converted = message.content.map((part) => {
            if (part && typeof part === "object" && "type" in part) {
              if (part.type === "text") {
                const type = message.role === "assistant" ? "output_text" : "input_text";
                return { ...part, type };
              }
            }
            return part;
          });
          const filtered = converted.filter((part) => allowedTypes.has(part.type as string));
          if (filtered.length === 0) {
            return null;
          }
          return {
            ...message,
            content: filtered as ResponsesMessage["content"],
          };
        })
        .filter(
          (message): message is ResponsesMessage =>
            Boolean(message) && Array.isArray(message.content) && message.content.length > 0,
        );

      let inputMessages = [...cleaned].filter((message) => message.role !== "system");
      if (typeof systemText === "string" && systemText.trim().length > 0) {
        inputMessages.unshift({
          role: "system",
          content: [
            {
              type: "input_text",
              text: systemText,
            },
          ],
        } as ResponsesMessage);
      }
      return { messages: inputMessages, toolEvents };
    };

    const { messages = [] } = request;

    if (explicitInput) {
      // Merge full conversation context (converted messages) before explicit tool events
      const converted = toInputMessages(messages, request.instructions ?? null);
      if (process.env.CODEX_DEBUG_HTTP === "1" && converted.messages.some((msg) => msg.role === "tool")) {
        console.error("[responses] unexpected tool message in converted history", converted.messages);
      }
      const explicitCallIds = new Set(
        explicitInput
          .filter((item) => item && typeof item === "object" && "call_id" in item)
          .map((item) => String((item as Record<string, unknown>).call_id)),
      );
      const historicalEvents = converted.toolEvents.filter(
        (event) =>
          !("call_id" in event) ||
          !explicitCallIds.has(String((event as Record<string, unknown>).call_id)),
      );
      payloadInput = [...converted.messages, ...historicalEvents, ...explicitInput];
    } else {
      const converted = toInputMessages(messages, request.instructions ?? null);
      if (process.env.CODEX_DEBUG_HTTP === "1" && converted.messages.some((msg) => msg.role === "tool")) {
        console.error("[responses] unexpected tool message in converted history", converted.messages);
      }
      payloadInput = [...converted.messages, ...converted.toolEvents];
    }

    const payload: Record<string, unknown> = {
      model: request.model,
      input: payloadInput,
    };

    // Preserve top-level instructions for ChatGPT Codex endpoint compatibility
    if (typeof request.instructions === "string" && request.instructions.trim().length > 0) {
      (payload as any).instructions = request.instructions;
    }

    if (typeof request.previous_response_id === "string" && request.previous_response_id.trim().length > 0) {
      payload.previous_response_id = request.previous_response_id;
    }
    if (request.tools !== undefined) {
      payload.tools = request.tools;
    }
    if (request.tool_choice !== undefined) {
      payload.tool_choice = request.tool_choice;
    }
    if (request.parallel_tool_calls !== undefined) {
      payload.parallel_tool_calls = request.parallel_tool_calls;
    }
    if (request.max_output_tokens !== undefined) {
      payload.max_output_tokens = request.max_output_tokens;
    }
    if (request.store !== undefined) {
      payload.store = request.store;
    }
    if ((request as any).include !== undefined) {
      payload.include = (request as any).include;
    }
    if ((request as any).reasoning !== undefined) {
      payload.reasoning = (request as any).reasoning;
    }
    if ((request as any).prompt_cache_key !== undefined) {
      payload.prompt_cache_key = (request as any).prompt_cache_key;
    }
    if (request.stream !== undefined) {
      payload.stream = request.stream;
    }
    if ((request as Record<string, unknown>).metadata !== undefined) {
      payload.metadata = (request as Record<string, unknown>).metadata;
    }

    return payload;
  }

  private async *parseStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    usageRef: UsageRef,
    stateRef: ResponseStateRef,
  ): AsyncGenerator<StreamItem, void, undefined> {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = yield* this.consumeBuffer(buffer, usageRef, stateRef);
    }

    if (buffer.length > 0) {
      yield* this.consumeRemainder(buffer, usageRef, stateRef);
    }
  }

  private *consumeRemainder(
    buffer: string,
    usageRef: UsageRef,
    stateRef: ResponseStateRef,
  ): Generator<StreamItem, void, undefined> {
    const remainder = buffer.trimEnd();
    if (!remainder) {
      return;
    }
    const { event, data } = parseChunk(remainder);
    if (data === "[DONE]") {
      return;
    }
    if (!data) {
      return;
    }
    const parsed = safeJsonParse(data);
    if (!parsed) {
      return;
    }
    updateResponseState(event, parsed, stateRef);
    const yielded = normalizeEvent(event, parsed, usageRef);
    if (yielded) {
      yield yielded;
    }
  }

  private *consumeBuffer(
    buffer: string,
    usageRef: UsageRef,
    stateRef: ResponseStateRef,
  ): Generator<StreamItem, string, undefined> {
    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary === -1) {
        return buffer;
      }

      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (chunk.trim().length === 0) {
        continue;
      }

      const { event, data } = parseChunk(chunk);

      if (data === "[DONE]") {
        return "";
      }

      if (!data) {
        continue;
      }

      const parsed = safeJsonParse(data);
      if (!parsed) {
        continue;
      }

      updateResponseState(event, parsed, stateRef);

      const yielded = normalizeEvent(event, parsed, usageRef);
      if (yielded) {
        yield yielded;
      }
    }
  }

}

function updateResponseState(event: string | null, parsed: any, stateRef: ResponseStateRef): void {
  if (!event) {
    return;
  }

  if (parsed && typeof parsed === "object") {
    const response = parsed.response;
    if (response && typeof response === "object" && typeof response.id === "string") {
      stateRef.responseId = response.id;
      return;
    }

    if (event === "response.created" && typeof parsed.id === "string") {
      stateRef.responseId = parsed.id;
      return;
    }
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

function safeJsonParse(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeEvent(
  event: string | null,
  parsed: any,
  usageRef: UsageRef,
): StreamItem | null {
  if (event === "response.output_item.done" && parsed && typeof parsed === "object") {
    return normalizeOutputItem(parsed.item);
  }

  if (event === "response.completed" && parsed && typeof parsed === "object") {
    const usage = parsed.response?.usage;
    if (usage) {
      usageRef.current = usage;
    }
  }

  return null;
}

function normalizeOutputItem(item: any): StreamItem | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  switch (item.type) {
    case "message":
      return normalizeAssistantMessage(item);
    case "function_call":
      return normalizeFunctionCall(item);
    default:
      return null;
  }
}

function normalizeAssistantMessage(item: any): AssistantMessageItem | null {
  if (item.role !== "assistant" || !Array.isArray(item.content)) {
    return null;
  }

  const content = item.content
    .map((part: any) => {
      if (part && typeof part === "object" && typeof part.text === "string") {
        if (part.type === "output_text" || part.type === "text") {
          return { type: "text" as const, text: part.text };
        }
      }
      return null;
    })
    .filter((part): part is { type: "text"; text: string } => part !== null);

  if (content.length === 0) {
    return null;
  }

  const message: AssistantMessageItem = {
    role: "assistant",
    content,
  };

  if (typeof item.id === "string") {
    message.id = item.id;
  }

  return message;
}

function normalizeFunctionCall(item: any): ToolUseItem | null {
  if (typeof item.call_id !== "string" || typeof item.name !== "string") {
    return null;
  }

  let input: unknown = item.arguments;
  if (typeof item.arguments === "string") {
    const parsed = safeJsonParse(item.arguments);
    input = parsed ?? item.arguments;
  }

  return {
    type: "tool_use",
    call_id: item.call_id,
    name: item.name,
    input,
  };
}
