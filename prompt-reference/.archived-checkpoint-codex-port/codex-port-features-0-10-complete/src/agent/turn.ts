import { ResponsesClient } from "../client/responses";
import type { ResponsesRequest, StreamItem, TokenUsage } from "../client/types";
import { TOOL_REGISTRY } from "../tools/registry";
import { appendHistory, loadSession, saveSession, type SessionItem } from "./session";
import { constructPrompt } from "./prompt";
import { buildEnvironmentContextText, formatUserInstructionsBlock } from "./prompt_shared";

export interface TurnResult {
  items: SessionItem[];
  usage: TokenUsage | null;
}

export interface RunTurnOptions {
  responsesClient?: ResponsesClient;
  promptBuilder?: (items: SessionItem[], opts?: { promptCacheKey?: string }) => ResponsesRequest;
  toolRegistry?: Record<string, (input: unknown) => Promise<unknown>>;
}

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [200, 400];

type ResponsesStream = AsyncIterable<StreamItem> & {
  usage: TokenUsage | null;
  responseId: string | null;
};

interface UsageStreamItem {
  type: "usage";
  usage: TokenUsage | null;
}

export type TurnStreamItem = SessionItem | UsageStreamItem;

class ToolExecutionError extends Error {
  public readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ToolExecutionError";
    this.cause = cause;
  }
}

export async function runTurn(
  sessionId: string,
  message: string,
  options: RunTurnOptions = {},
): Promise<TurnResult> {
  const session = await loadSession(sessionId);

  const userItem: SessionItem = {
    role: "user",
    content: [{ type: "input_text", text: message }],
  };
  session.items.push(userItem);

  const promptBuilder = options.promptBuilder ?? constructPrompt;
  const responsesClient = options.responsesClient ?? new ResponsesClient();
  const toolRegistry = options.toolRegistry ?? TOOL_REGISTRY;

  let usage: TokenUsage | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const attemptStartIndex = session.items.length;
    try {
      let responseId: string | null = null;
      let pendingToolSubmissions: Array<{ callId: string; name: string; input: unknown; output: unknown }> | null = null;

      while (true) {
        const promptItems = withSessionInstructions(
          [...session.items],
          session.session.instructions,
        );
        const basePrompt = promptBuilder(promptItems, { promptCacheKey: sessionId });

        let request: ResponsesRequest = { ...basePrompt };
        
        if (pendingToolSubmissions && pendingToolSubmissions.length > 0) {
          // For ChatGPT Codex, include both the function_call and its function_call_output
          // in the same request. Do not rely on previous_response_id.
          const toolInputs = pendingToolSubmissions.flatMap((submission) => [
            {
              type: "function_call",
              name: submission.name,
              arguments: JSON.stringify(submission.input ?? {}),
              call_id: submission.callId,
            },
            {
              type: "function_call_output",
              call_id: submission.callId,
              output: formatToolOutputForModel(submission.output),
            },
          ]);
          // Keep the full conversation context (messages) and append the
          // function_call + function_call_output pair as explicit input so the
          // model can ground its final reply in the user question.
          request = {
            ...request,
            input: toolInputs,
          };
        } else if (responseId) {
          request = { ...request, previous_response_id: responseId };
        }

        const stream = (await responsesClient.create(request)) as ResponsesStream;
        const {
          items: producedItems,
          usage: attemptUsage,
          toolSubmissions,
        } = await collectStreamItems(stream, toolRegistry);

        session.items.push(...producedItems);
        if (attemptUsage) {
          usage = attemptUsage;
        }
        responseId = stream.responseId;

        if (toolSubmissions.length > 0) {
          pendingToolSubmissions = toolSubmissions;
          continue;
        }

        pendingToolSubmissions = null;
        await saveSession(session);
        await appendHistory(sessionId, message);

        return {
          items: session.items,
          usage,
        };
      }
    } catch (error) {
      lastError = error;
      session.items.splice(attemptStartIndex);

      if (error instanceof ToolExecutionError) {
        throw error;
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        const delay =
          RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
        await sleep(delay);
        continue;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError));
}

export async function* runTurnStream(
  sessionId: string,
  message: string,
  options: RunTurnOptions = {},
): AsyncGenerator<TurnStreamItem, void, undefined> {
  const session = await loadSession(sessionId);

  const userItem: SessionItem = {
    role: "user",
    content: [{ type: "input_text", text: message }],
  };
  session.items.push(userItem);

  const promptBuilder = options.promptBuilder ?? constructPrompt;
  const responsesClient = options.responsesClient ?? new ResponsesClient();
  const toolRegistry = options.toolRegistry ?? TOOL_REGISTRY;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const attemptStartIndex = session.items.length;
    try {
      let responseId: string | null = null;
      let pendingToolSubmissions: Array<{ callId: string; name: string; input: unknown; output: unknown }> | null = null;

      while (true) {
        const promptItems = withSessionInstructions(
          [...session.items],
          session.session.instructions,
        );
        const basePrompt = promptBuilder(promptItems, { promptCacheKey: sessionId });

        let request: ResponsesRequest = { ...basePrompt };
        if (pendingToolSubmissions && pendingToolSubmissions.length > 0) {
          const toolInputs = pendingToolSubmissions.flatMap((submission) => [
            {
              type: "function_call",
              name: submission.name,
              arguments: JSON.stringify(submission.input ?? {}),
              call_id: submission.callId,
            },
            {
              type: "function_call_output",
              call_id: submission.callId,
              output: formatToolOutputForModel(submission.output),
            },
          ]);
          request = {
            ...request,
            input: toolInputs,
          };
        } else if (responseId) {
          request = { ...request, previous_response_id: responseId };
        }

        const stream = (await responsesClient.create(request)) as ResponsesStream;
        const attemptItems: SessionItem[] = [];
        const toolSubmissions: Array<{ callId: string; name: string; input: unknown; output: unknown }> = [];

        for await (const rawItem of stream) {
          const conversion = await convertStreamItem(rawItem, toolRegistry);
          if (conversion.submission) {
            toolSubmissions.push(conversion.submission);
          }
          for (const producedItem of conversion.items) {
            attemptItems.push(producedItem);
            yield producedItem;
          }
        }

        const usage = stream.usage ?? null;
        session.items.push(...attemptItems);
        responseId = stream.responseId;

        if (toolSubmissions.length > 0) {
          pendingToolSubmissions = toolSubmissions;
          continue;
        }

        pendingToolSubmissions = null;
        await saveSession(session);
        await appendHistory(sessionId, message);

        yield { type: "usage", usage };
        return;
      }
    } catch (error) {
      lastError = error;
      session.items.splice(attemptStartIndex);

      if (error instanceof ToolExecutionError) {
        throw error;
      }

      if (attempt < MAX_ATTEMPTS - 1) {
        const delay =
          RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
        await sleep(delay);
        continue;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error(String(lastError));
}

async function collectStreamItems(
  stream: ResponsesStream,
  toolRegistry: Record<string, (input: unknown) => Promise<unknown>>,
): Promise<{
  items: SessionItem[];
  usage: TokenUsage | null;
  toolSubmissions: Array<{ callId: string; name: string; input: unknown; output: unknown }>;
}> {
  const collected: SessionItem[] = [];
  const submissions: Array<{ callId: string; name: string; input: unknown; output: unknown }> = [];

  for await (const rawItem of stream) {
    const conversion = await convertStreamItem(rawItem, toolRegistry);
    collected.push(...conversion.items);
    if (conversion.submission) {
      submissions.push(conversion.submission);
    }
  }

  return {
    items: collected,
    usage: stream.usage ?? null,
    toolSubmissions: submissions,
  };
}

async function convertStreamItem(
  item: StreamItem,
  toolRegistry: Record<string, (input: unknown) => Promise<unknown>>,
): Promise<{ items: SessionItem[]; submission?: { callId: string; name: string; input: unknown; output: unknown } }> {
  if ("role" in item) {
    return {
      items: [
        {
          role: item.role,
          content: item.content.map((part) => ({
            type: part.type,
            text: part.text,
          })),
        },
      ],
    };
  }

  if (item.type === "tool_use") {
    const toolUseItem: SessionItem = {
      type: "tool_use",
      call_id: item.call_id,
      name: item.name,
      input: item.input,
    };

    console.debug("[turn] tool_use item", JSON.stringify(item));

    const handler = toolRegistry[item.name];
    if (!handler) {
      console.error(
        "[turn] tool not found",
        JSON.stringify({ callId: item.call_id, name: item.name }),
      );
      throw new ToolExecutionError(`Tool not found: ${item.name}`);
    }

    const normalizedInput = item.input;

    try {
      console.debug(
        "[turn] invoking tool",
        JSON.stringify({ callId: item.call_id, name: item.name, input: normalizedInput }),
      );
      const output = await handler(normalizedInput);
      console.debug(
        "[turn] tool succeeded",
        JSON.stringify({ callId: item.call_id, name: item.name }),
      );
      const toolResult: SessionItem = {
        type: "tool_result",
        call_id: item.call_id,
        output,
      };

      return {
        items: [toolUseItem, toolResult],
        submission: {
          callId: item.call_id,
          name: item.name,
          input: normalizedInput,
          output,
        },
      };
    } catch (error) {
      const message = formatToolError(error);
      console.error(
        "[turn] tool failure",
        JSON.stringify({
          callId: item.call_id,
          name: item.name,
          input: normalizedInput,
          error: message,
        }),
      );

      const failureOutput = {
        success: false,
        error: message,
      };

      const toolResult: SessionItem = {
        type: "tool_result",
        call_id: item.call_id,
        output: failureOutput,
      };

      return {
        items: [toolUseItem, toolResult],
        submission: {
          callId: item.call_id,
          name: item.name,
          input: normalizedInput,
          output: failureOutput,
        },
      };
    }
  }

  return { items: [] };
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function formatToolError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return JSON.stringify(error);
}

function formatToolOutputForModel(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (typeof record.content === "string") {
      return record.content;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
  }

  try {
    return output === undefined ? "" : JSON.stringify(output);
  } catch {
    return String(output ?? "");
  }
}

function withSessionInstructions(
  items: SessionItem[],
  instructions: string | undefined,
): SessionItem[] {
  const text = instructions ?? "";
  const hasInstructions = text.trim().length > 0;
  const base = withEnvironmentContext(items);

  if (!hasInstructions) {
    return base;
  }

  const instructionItem: SessionItem = {
    role: "user",
    content: [
      {
        type: "input_text",
        text: formatUserInstructionsBlock(text),
      },
    ],
  };

  return [instructionItem, ...base];
}

function withEnvironmentContext(items: SessionItem[]): SessionItem[] {
  return [createEnvironmentContextItem(), ...items];
}

function createEnvironmentContextItem(): SessionItem {
  return {
    role: "user",
    content: [
      {
        type: "input_text",
        text: buildEnvironmentContextText(),
      },
    ],
  };
}
