import type { ResponsesContentPart, ResponsesMessage, ResponsesRequest, ResponsesTool } from "../client/types";
import { getModelInstructions } from "./instructions";
import type { SessionItem } from "./session";

interface ConstructPromptOptions {
  model?: string;
  parallelToolCalls?: boolean;
  maxOutputTokens?: number;
  // Forwarded to the API as prompt_cache_key to aid caching/alignment with CLI
  promptCacheKey?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

const DEFAULT_MODEL = process.env.CODEX_MODEL ?? "gpt-5-codex";
const DEFAULT_MAX_OUTPUT_TOKENS = 8_000;

const CORE_TOOLS: ToolDefinition[] = [
  {
    name: "grep_files",
    description:
      "Finds files whose contents match the pattern and lists them by modification time.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regular expression pattern to search for.",
        },
        include: {
          type: "string",
          description:
            'Optional glob that limits which files are searched (e.g. "*.rs" or "*.{ts,tsx}").',
        },
        path: {
          type: "string",
          description:
            "Directory or file path to search. Defaults to the session's working directory.",
        },
        limit: {
          type: "number",
          description: "Maximum number of file paths to return (defaults to 100).",
        },
      },
      required: ["pattern"],
      additionalProperties: false,
    },
  },
  {
    name: "read_file",
    description:
      "Reads a local file with 1-indexed line numbers, supporting slice and indentation-aware block modes.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file",
        },
        offset: {
          type: "number",
          description: "The line number to start reading from. Must be 1 or greater.",
        },
        limit: {
          type: "number",
          description: "The maximum number of lines to return.",
        },
        mode: {
          type: "string",
          description:
            'Optional mode selector: "slice" for simple ranges (default) or "indentation" to expand around an anchor line.',
        },
        indentation: {
          type: "object",
          additionalProperties: false,
          properties: {
            anchor_line: {
              type: "number",
              description: "Anchor line to center the indentation lookup on (defaults to offset).",
            },
            max_levels: {
              type: "number",
              description: "How many parent indentation levels (smaller indents) to include.",
            },
            include_siblings: {
              type: "boolean",
              description: "When true, include additional blocks that share the anchor indentation.",
            },
            include_header: {
              type: "boolean",
              description:
                "Include doc comments or attributes directly above the selected block.",
            },
            max_lines: {
              type: "number",
              description:
                "Hard cap on the number of lines returned when using indentation mode.",
            },
          },
        },
      },
      required: ["file_path"],
      additionalProperties: false,
    },
  },
  {
    name: "list_dir",
    description:
      "Lists entries in a local directory with 1-indexed entry numbers and simple type labels.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        dir_path: {
          type: "string",
          description: "Absolute path to the directory to list.",
        },
        offset: {
          type: "number",
          description: "The entry number to start listing from. Must be 1 or greater.",
        },
        limit: {
          type: "number",
          description: "The maximum number of entries to return.",
        },
        depth: {
          type: "number",
          description: "The maximum directory depth to traverse. Must be 1 or greater.",
        },
      },
      required: ["dir_path"],
      additionalProperties: false,
    },
  },
  {
    name: "shell",
    description: "Run shell commands in the project workspace.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "array",
          description: "Command argv to execute. First element is the program name.",
          items: { type: "string" },
        },
        workdir: {
          type: "string",
          description: "Optional working directory. Defaults to the project root.",
        },
        timeout_ms: {
          type: "number",
          description: "Optional timeout in milliseconds (defaults to 30000).",
        },
        with_escalated_permissions: {
          type: "boolean",
          description:
            "Whether to request escalated permissions. Set to true if command needs to be run without sandbox restrictions",
        },
        justification: {
          type: "string",
          description:
            "Only set if with_escalated_permissions is true. 1-sentence explanation of why we want to run this command.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    name: "apply_patch",
    description:
      "Use the `apply_patch` tool to edit files with the Codex patch format. File paths must be relative.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        patch: {
          type: "string",
          description: "The complete patch payload to send to the apply_patch CLI.",
        },
        cwd: {
          type: "string",
          description: "Optional working directory for the apply_patch invocation.",
        },
      },
      required: ["patch"],
      additionalProperties: false,
    },
  },
];

export function constructPrompt(
  items: SessionItem[],
  options: ConstructPromptOptions = {},
): ResponsesRequest {
  const model = options.model ?? DEFAULT_MODEL;
  const tools = buildToolSchemas();
  const instructions = getModelInstructions(model, {
    includeApplyPatchTool: tools.some((tool) => tool.name === "apply_patch"),
  });

  const messages: ResponsesMessage[] = [buildSystemMessage(instructions)];
  for (const item of items) {
    messages.push(...translateSessionItem(item));
  }

  return {
    model,
    instructions,
    messages,
    tools,
    parallel_tool_calls: options.parallelToolCalls ?? false,
    max_output_tokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    // Align with CLI defaults
    store: false,
    // Mirror CLI request knobs
    include: ["reasoning.encrypted_content"],
    reasoning: { effort: "low", summary: "auto" },
    ...(options.promptCacheKey ? { prompt_cache_key: options.promptCacheKey } : {}),
    stream: true,
    tool_choice: "auto",
  };
}

function buildSystemMessage(instructions: string): ResponsesMessage {
  return {
    role: "system",
    content: [{ type: "text", text: instructions }],
  };
}

function translateSessionItem(item: SessionItem): ResponsesMessage[] {
  if ("role" in item) {
    if (item.role === "user") {
      return [
        {
          role: "user",
          content: item.content.map((part) => ({
            type: part.type,
            text: part.text,
          })),
        },
      ];
    }

    if (item.role === "assistant") {
      return [
        {
          role: "assistant",
          content: item.content.map((part) => ({
            type: "output_text",
            text: part.text,
          })),
        },
      ];
    }
  }

  if (item.type === "tool_use") {
    return [
      {
        role: "assistant",
        content: [
          {
            type: "tool_call",
            id: item.call_id,
            name: item.name,
            input: item.input,
          } as ResponsesContentPart,
        ],
      },
    ];
  }

  if (item.type === "tool_result") {
    return [
      {
        role: "tool",
        tool_call_id: item.call_id,
        content: [
          {
            type: "output_text",
            text: formatToolOutput(item.output),
          },
        ],
      },
    ];
  }

  return [];
}

function buildToolSchemas(): ResponsesTool[] {
  return CORE_TOOLS.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    strict: tool.strict ?? false,
    parameters: tool.parameters,
  }));
}

function formatToolOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}
