import { getModelInstructions } from "../agent/instructions";
import type { ResponseItem } from "../protocol/types";
import { CORE_TOOL_SPECS } from "../tools-v2/specs";

export interface ConstructPromptV2Options {
  model?: string;
  parallelToolCalls?: boolean;
  maxOutputTokens?: number;
  promptCacheKey?: string;
}

export interface FunctionToolDefinition {
  type: "function";
  name: string;
  description: string;
  strict: boolean;
  parameters: Record<string, unknown>;
}

export interface PromptV2Request {
  model: string;
  instructions: string;
  input: ResponseItem[];
  tools: FunctionToolDefinition[];
  parallel_tool_calls: boolean;
  max_output_tokens: number;
  store: boolean;
  stream: boolean;
  tool_choice: string;
  prompt_cache_key?: string;
}

const DEFAULT_MODEL = process.env.CODEX_MODEL ?? "gpt-5-codex";
const DEFAULT_MAX_OUTPUT_TOKENS = 8_000;

export function constructPromptV2(
  items: ResponseItem[],
  options: ConstructPromptV2Options = {},
): PromptV2Request {
  const model = options.model ?? DEFAULT_MODEL;
  const tools = buildToolSchemas();
  const instructions = getModelInstructions(model, {
    includeApplyPatchTool: tools.some((tool) => tool.name === "apply_patch"),
  });

  return {
    model,
    instructions,
    input: sanitizeItemsForRequest(items),
    tools,
    parallel_tool_calls: options.parallelToolCalls ?? false,
    max_output_tokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    store: false,
    stream: true,
    tool_choice: "auto",
    ...(options.promptCacheKey ? { prompt_cache_key: options.promptCacheKey } : {}),
  };
}

function sanitizeItemsForRequest(items: ResponseItem[]): ResponseItem[] {
  const sanitized: ResponseItem[] = [];

  for (const item of items) {
    const cleaned = sanitizeResponseItem(item);
    if (cleaned) {
      sanitized.push(cleaned);
    }
  }

  return sanitized;
}

function sanitizeResponseItem(item: ResponseItem): ResponseItem | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  if (item.type === "reasoning") {
    return null;
  }

  const clone: Record<string, unknown> = structuredClone(item);
  delete clone.id;
  delete clone.status;

  if (clone.type === "message") {
    const contentArray = Array.isArray(clone.content) ? clone.content : [];
    clone.content = contentArray.map((entry: Record<string, unknown>) => {
      const entryClone = { ...entry };
      delete entryClone.id;
      delete entryClone.annotations;
      delete entryClone.logprobs;
      return entryClone;
    });
  }

  if (clone.type === "function_call_output" && clone.output && typeof clone.output === "object") {
    clone.output = { ...(clone.output as Record<string, unknown>) };
  }

  if (clone.type === "local_shell_call" && clone.action && typeof clone.action === "object") {
    clone.action = { ...(clone.action as Record<string, unknown>) };
  }

  return clone as ResponseItem;
}

function buildToolSchemas(): FunctionToolDefinition[] {
  return CORE_TOOL_SPECS.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    strict: tool.strict ?? false,
    parameters: tool.parameters,
  }));
}
