import { appendHistory, loadSession, saveSession } from "./session";
import { constructPromptV2, type PromptV2Request } from "./prompt";
import {
  ContextWindowExceededError,
  ResponsesClientV2,
  ResponsesStreamError,
  type ResponsesEventStream,
} from "../client-v2/responses";
import type { ResponseEvent, ResponseItem, TokenUsage } from "../protocol/types";
import { createCoreToolRegistry } from "../tools-v2/registry";
import { buildToolCall, createToolRouter } from "../tools-v2/router";
import { buildEnvironmentContextText, formatUserInstructionsBlock } from "../agent/prompt_shared";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [200, 400];

export interface ResponsesClientV2Like {
  create(request: PromptV2Request): Promise<ResponsesEventStream>;
}

export interface ToolRouterLike {
  specs(): unknown[];
  toolSupportsParallel(toolName: string): boolean;
  dispatchToolCall(
    session: unknown,
    turn: unknown,
    tracker: unknown,
    subId: string,
    call: {
      toolName: string;
      callId: string;
      payload: unknown;
    },
  ): Promise<ResponseItem>;
}

export interface RunTurnV2Options {
  responsesClient?: ResponsesClientV2Like;
  promptBuilder?: (items: ResponseItem[], options?: { promptCacheKey?: string }) => PromptV2Request;
  toolRouter?: ToolRouterLike;
}

export interface TurnV2Result {
  items: ResponseItem[];
  usage: TokenUsage | null;
}

export type TurnStreamV2Item =
  | ResponseItem
  | { type: "output_text.delta"; delta: string }
  | { type: "reasoning_summary.delta"; delta: string }
  | { type: "reasoning_content.delta"; delta: string }
  | { type: "reasoning_summary.part_added" }
  | { type: "web_search_call.begin"; callId: string }
  | { type: "rate_limits"; snapshot: unknown }
  | { type: "usage"; usage: TokenUsage | null };

interface ToolDispatchContext {
  session: unknown;
  turn: unknown;
  tracker: unknown;
}

export async function runTurnV2(
  sessionId: string,
  message: string,
  options: RunTurnV2Options = {},
): Promise<TurnV2Result> {
  const session = await loadSession(sessionId);

  const userItem = buildUserMessage(message);
  session.items.push(userItem);

  const promptBuilder = options.promptBuilder ?? constructPromptV2;
  const responsesClient = ensureResponsesClient(options.responsesClient);
  const toolRouter = options.toolRouter ?? createDefaultToolRouter();

  const toolContext: ToolDispatchContext = {
    session: { parseMcpToolName: () => null },
    turn: {},
    tracker: {},
  };

  let usage: TokenUsage | null = null;
  let lastError: unknown = null;
  let toolSubIdCounter = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const attemptStartIndex = session.items.length;
    try {
      while (true) {
        const promptItems = withSessionInstructions(
          [...session.items],
          session.session.instructions,
        );
        const request = promptBuilder(promptItems, { promptCacheKey: sessionId });

        const stream = await responsesClient.create(request);
        const processingResult = await processResponseStream(stream, session, toolRouter, {
          toolContext,
          nextSubId: () => `sub-${toolSubIdCounter++}`,
        });

        session.items.push(...processingResult.producedItems);

        if (processingResult.usage) {
          usage = processingResult.usage;
        }

        if (!processingResult.hasPendingToolCalls) {
          await saveSession(session);
          await appendHistory(sessionId, message);
          return {
            items: session.items,
            usage,
          };
        }
      }
    } catch (error) {
      lastError = error;
      session.items.splice(attemptStartIndex);

      const delay = computeRetryDelay(error, attempt);
      if (delay === null) {
        throw normalizeError(error);
      }
      if (delay > 0) {
        await sleep(delay);
      }
      continue;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError));
}

export async function* runTurnStreamV2(
  sessionId: string,
  message: string,
  options: RunTurnV2Options = {},
): AsyncGenerator<TurnStreamV2Item, void, undefined> {
  const session = await loadSession(sessionId);

  const userItem = buildUserMessage(message);
  session.items.push(userItem);

  const promptBuilder = options.promptBuilder ?? constructPromptV2;
  const responsesClient = ensureResponsesClient(options.responsesClient);
  const toolRouter = options.toolRouter ?? createDefaultToolRouter();

  const toolContext: ToolDispatchContext = {
    session: { parseMcpToolName: () => null },
    turn: {},
    tracker: {},
  };

  let lastUsage: TokenUsage | null = null;
  let lastError: unknown = null;
  let toolSubIdCounter = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const attemptStartIndex = session.items.length;
    try {
      while (true) {
        const promptItems = withSessionInstructions(
          [...session.items],
          session.session.instructions,
        );
        const request = promptBuilder(promptItems, { promptCacheKey: sessionId });

        const stream = await responsesClient.create(request);
        const producedItems: ResponseItem[] = [];
        let hasPendingToolCalls = false;

        for await (const event of stream) {
          switch (event.type) {
            case "created":
              break;
            case "output_text.delta":
            case "reasoning_summary.delta":
            case "reasoning_content.delta":
              yield event;
              break;
            case "reasoning_summary.part_added":
              yield event;
              break;
            case "web_search_call.begin":
              yield event;
              break;
            case "rate_limits":
              yield event;
              break;
            case "output_item.done": {
              const item = event.item;
              producedItems.push(item);
              yield item;

              const toolCall = buildToolCall(toolContext.session as any, item);
              if (toolCall) {
                hasPendingToolCalls = true;
                const subId = `sub-${toolSubIdCounter++}`;
                const toolResult = await toolRouter.dispatchToolCall(
                  toolContext.session,
                  toolContext.turn,
                  toolContext.tracker,
                  subId,
                  toolCall,
                );
                producedItems.push(toolResult);
                yield toolResult;
              }
              break;
            }
            case "completed":
              lastUsage = event.tokenUsage;
              break;
          }
        }

        session.items.push(...producedItems);

        if (hasPendingToolCalls) {
          continue;
        }

        await saveSession(session);
        await appendHistory(sessionId, message);
        yield { type: "usage", usage: lastUsage };
        return;
      }
    } catch (error) {
      lastError = error;
      session.items.splice(attemptStartIndex);

      const delay = computeRetryDelay(error, attempt);
      if (delay === null) {
        throw normalizeError(error);
      }
      if (delay > 0) {
        await sleep(delay);
      }
      continue;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError));
}

interface ProcessStreamResult {
  producedItems: ResponseItem[];
  hasPendingToolCalls: boolean;
  usage: TokenUsage | null;
}

async function processResponseStream(
  stream: ResponsesEventStream,
  session: { items: ResponseItem[] },
  toolRouter: ToolRouterLike,
  options: {
    toolContext: ToolDispatchContext;
    nextSubId: () => string;
  },
): Promise<ProcessStreamResult> {
  const producedItems: ResponseItem[] = [];
  let hasPendingToolCalls = false;
  let usage: TokenUsage | null = null;

  for await (const event of stream) {
    switch (event.type) {
      case "created":
      case "rate_limits":
      case "output_text.delta":
      case "reasoning_summary.delta":
      case "reasoning_content.delta":
      case "reasoning_summary.part_added":
      case "web_search_call.begin":
        // Deltas and metadata are handled by the streaming path.
        break;
      case "output_item.done": {
        const item = event.item;
        producedItems.push(item);

        const toolCall = buildToolCall(options.toolContext.session as any, item);
        if (toolCall) {
          hasPendingToolCalls = true;
          const subId = options.nextSubId();
          const toolResult = await toolRouter.dispatchToolCall(
            options.toolContext.session,
            options.toolContext.turn,
            options.toolContext.tracker,
            subId,
            toolCall,
          );
          producedItems.push(toolResult);
        }
        break;
      }
      case "completed": {
        usage = event.tokenUsage;
        break;
      }
    }
  }

  return {
    producedItems,
    hasPendingToolCalls,
    usage,
  };
}

function withSessionInstructions(items: ResponseItem[], instructions: string): ResponseItem[] {
  const hasInstructions = instructions.trim().length > 0;
  const base = withEnvironmentContext(items);

  if (!hasInstructions) {
    return base;
  }

  const instructionMessage: ResponseItem = {
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text: formatUserInstructionsBlock(instructions),
      },
    ],
  };

  return [instructionMessage, ...base];
}

function withEnvironmentContext(items: ResponseItem[]): ResponseItem[] {
  const contextMessage: ResponseItem = {
    type: "message",
    role: "user",
    content: [
      {
        type: "input_text",
        text: buildEnvironmentContextText(),
      },
    ],
  };

  return [contextMessage, ...items];
}

function buildUserMessage(text: string): ResponseItem {
  return {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
  };
}

function ensureResponsesClient(client: ResponsesClientV2Like | undefined): ResponsesClientV2Like {
  if (client) {
    return client;
  }
  return new ResponsesClientV2();
}

function createDefaultToolRouter(): ToolRouterLike {
  const core = createCoreToolRegistry();
  return createToolRouter({
    registry: core.registry,
    specs: core.specs.map((entry) => entry.spec),
  });
}

function computeRetryDelay(error: unknown, attempt: number): number | null {
  if (error instanceof ContextWindowExceededError) {
    return null;
  }

  if (attempt >= MAX_ATTEMPTS - 1) {
    return null;
  }

  if (error instanceof ResponsesStreamError) {
    const retryAfter = error.retryAfterMs;
    if (typeof retryAfter === "number" && Number.isFinite(retryAfter) && retryAfter >= 0) {
      return retryAfter;
    }
  }

  const index = Math.min(attempt, RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index] ?? null;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
