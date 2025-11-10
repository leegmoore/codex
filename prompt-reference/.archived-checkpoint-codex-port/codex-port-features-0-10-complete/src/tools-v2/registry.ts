import { z } from "zod";

import type { ResponseFunctionCallOutputItem, ResponseItem } from "../protocol/types";
import { applyPatch } from "../tools/applyPatch/applyPatch";
import type { ApplyPatchOptions } from "../tools/applyPatch/applyPatch";
import { grepFiles, type GrepFilesParams } from "../tools/grepFiles";
import { listDir } from "../tools/listDir";
import { readFile } from "../tools/readFile";
import { runShell, type ShellParams } from "../tools/shell";
import {
  normalizeListDirParams,
  normalizeReadFileParams,
  normalizeShellParams,
} from "../tools/registry";
import { CORE_TOOL_SPECS, type FunctionToolSchema } from "./specs";
import {
  FunctionCallError,
  type ToolInvocation,
  type ToolPayload,
  type ToolRegistryAdapter,
} from "./router";

export interface ConfiguredToolSpec {
  spec: FunctionToolSchema;
  supportsParallelToolCalls: boolean;
}

export interface CoreToolRegistry {
  specs: ConfiguredToolSpec[];
  registry: ToolRegistryAdapter;
}

interface ToolExecutionResult {
  content: string;
  success: boolean;
  structuredContent?: unknown;
}

interface ToolDefinition<Input> {
  name: string;
  kind: "function" | "unified_exec" | "custom";
  schema: z.ZodType<Input>;
  supportsParallel: boolean;
  execute: (input: Input, invocation: ToolInvocation) => Promise<ToolExecutionResult>;
}

class CoreToolRegistryAdapter implements ToolRegistryAdapter {
  private readonly handlers = new Map<string, ToolDefinition<unknown>>();

  constructor(definitions: Array<ToolDefinition<unknown>>) {
    for (const definition of definitions) {
      this.handlers.set(definition.name, definition);
    }
  }

  toolSupportsParallel(toolName: string): boolean {
    const definition = this.handlers.get(toolName);
    return definition?.supportsParallel ?? false;
  }

  async dispatch(invocation: ToolInvocation): Promise<ResponseItem> {
    const definition = this.handlers.get(invocation.toolName);
    if (!definition) {
      throw new FunctionCallError(
        "RespondToModel",
        unsupportedToolCallMessage(invocation.payload, invocation.toolName),
      );
    }

    if (!payloadMatchesKind(invocation.payload, definition.kind)) {
      throw new FunctionCallError(
        "Fatal",
        `tool ${invocation.toolName} invoked with incompatible payload`,
      );
    }

    try {
      const parsedInput = this.parseInput(definition, invocation);
      const result = await definition.execute(parsedInput, invocation);
      return toFunctionCallOutput(invocation.callId, result);
    } catch (error) {
      if (error instanceof FunctionCallError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
      throw new FunctionCallError(
        "RespondToModel",
        `Tool "${invocation.toolName}" execution failed: ${message}`,
      );
    }
  }

  private parseInput<Input>(
    definition: ToolDefinition<Input>,
    invocation: ToolInvocation,
  ): Input {
    const payload = invocation.payload;
    switch (payload.type) {
      case "function":
      case "unified_exec": {
        const parsed = this.parseFunctionArguments(payload.arguments, invocation.toolName);
        const result = definition.schema.safeParse(parsed);
        if (!result.success) {
          const message = formatZodIssues(result.error.issues);
          throw new FunctionCallError(
            "RespondToModel",
            `Tool "${invocation.toolName}" execution failed: ${message}`,
          );
        }
        return result.data;
      }
      case "custom": {
        const parsed = parseJsonSafely(payload.input, invocation.toolName);
        const result = definition.schema.safeParse(parsed);
        if (!result.success) {
          const message = formatZodIssues(result.error.issues);
          throw new FunctionCallError(
            "RespondToModel",
            `Tool "${invocation.toolName}" execution failed: ${message}`,
          );
        }
        return result.data;
      }
      case "local_shell":
      case "mcp": {
        const result = definition.schema.safeParse(payload);
        if (!result.success) {
          const message = formatZodIssues(result.error.issues);
          throw new FunctionCallError(
            "RespondToModel",
            `Tool "${invocation.toolName}" execution failed: ${message}`,
          );
        }
        return result.data;
      }
      default:
        throw new FunctionCallError(
          "Fatal",
          `tool ${invocation.toolName} invoked with unsupported payload type ${payload.type}`,
        );
    }
  }

  private parseFunctionArguments(raw: string, toolName: string): unknown {
    if (!raw || raw.trim().length === 0) {
      return {};
    }

    try {
      return JSON.parse(raw) as unknown;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
      throw new FunctionCallError(
        "RespondToModel",
        `Tool "${toolName}" execution failed: unable to parse arguments as JSON (${message})`,
      );
    }
  }
}

export function createCoreToolRegistry(): CoreToolRegistry {
  const definitions: Array<ToolDefinition<unknown>> = [
    createShellDefinition(),
    createGrepFilesDefinition(),
    createListDirDefinition(),
    createReadFileDefinition(),
    createApplyPatchDefinition(),
  ];

  const specs: ConfiguredToolSpec[] = CORE_TOOL_SPECS.map((spec) => ({
    spec,
    supportsParallelToolCalls: spec.supportsParallelToolCalls ?? false,
  }));

  return {
    specs,
    registry: new CoreToolRegistryAdapter(definitions),
  };
}

function createShellDefinition(): ToolDefinition<ShellInput> {
  return {
    name: "shell",
    kind: "function",
    schema: shellSchema,
    supportsParallel: false,
    execute: async (input) => {
      const params = normalizeShellInput(input);
      const result = await runShell(params);
      return {
        content: result.content,
        success: result.success,
        structuredContent: {
          command: params.command,
          workdir: params.workdir ?? null,
          timeout_ms: params.timeoutMs ?? null,
          success: result.success,
          output: result.content,
        },
      };
    },
  };
}

function createGrepFilesDefinition(): ToolDefinition<GrepFilesParams> {
  return {
    name: "grep_files",
    kind: "function",
    schema: grepFilesSchema,
    supportsParallel: false,
    execute: async (input) => {
      const result = await grepFiles(input);
      const content = result.content;
      return {
        content,
        success: result.success,
        structuredContent: {
          content: result.content,
          success: result.success,
        },
      };
    },
  };
}

function createListDirDefinition(): ToolDefinition<ListDirInput> {
  return {
    name: "list_dir",
    kind: "function",
    schema: listDirSchema,
    supportsParallel: false,
    execute: async (input) => {
      const params = normalizeListDirParams(input);
      const result = await listDir(params);
      const content = result.content;
      return {
        content,
        success: result.success,
        structuredContent: {
          content: result.content,
          success: result.success,
        },
      };
    },
  };
}

function createReadFileDefinition(): ToolDefinition<ReadFileInput> {
  return {
    name: "read_file",
    kind: "function",
    schema: readFileSchema,
    supportsParallel: false,
    execute: async (input) => {
      const params = normalizeReadFileParams(input);
      const result = await readFile(params);
      const content = result.content;
      return {
        content,
        success: result.success,
        structuredContent: {
          content: result.content,
          success: result.success,
        },
      };
    },
  };
}

function createApplyPatchDefinition(): ToolDefinition<ApplyPatchInput> {
  return {
    name: "apply_patch",
    kind: "function",
    schema: applyPatchSchema,
    supportsParallel: false,
    execute: async (input) => {
      const options: ApplyPatchOptions = {};
      if (input.cwd) {
        options.cwd = input.cwd;
      }
      const result = await applyPatch(input.patch, options);
      const structured = {
        stdout: result.stdout,
        stderr: result.stderr,
        success: result.success,
      };
      return {
        content: JSON.stringify(structured, null, 2),
        success: result.success,
        structuredContent: structured,
      };
    },
  };
}

function payloadMatchesKind(payload: ToolPayload, kind: ToolDefinition<unknown>["kind"]): boolean {
  switch (kind) {
    case "function":
      return payload.type === "function";
    case "unified_exec":
      return payload.type === "unified_exec";
    case "custom":
      return payload.type === "custom";
    default:
      return false;
  }
}

function unsupportedToolCallMessage(payload: ToolPayload, toolName: string): string {
  if (payload.type === "custom") {
    return `unsupported custom tool call: ${toolName}`;
  }
  return `unsupported call: ${toolName}`;
}

function formatZodIssues(issues: z.ZodIssue[]): string {
  if (issues.length === 0) {
    return "invalid tool arguments";
  }

  const messages = issues.map((issue) => issue.message);
  const unique = Array.from(new Set(messages));
  return unique.join("; ");
}

function toFunctionCallOutput(
  callId: string,
  result: ToolExecutionResult,
): ResponseFunctionCallOutputItem {
  return {
    type: "function_call_output",
    call_id: callId,
    output: {
      content: result.content,
      success: result.success,
      ...(result.structuredContent !== undefined
        ? { structured_content: result.structuredContent }
        : {}),
    },
  };
}

function parseJsonSafely(raw: string, toolName: string): unknown {
  if (!raw || raw.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
    throw new FunctionCallError(
      "RespondToModel",
      `Tool "${toolName}" execution failed: unable to parse arguments as JSON (${message})`,
    );
  }
}

const shellSchema = z
  .object({
    command: z.union([z.array(z.string()), z.string()]).optional(),
    script: z.string().optional(),
    workdir: z.string().optional(),
    timeout_ms: z.number().positive().optional(),
    with_escalated_permissions: z.boolean().optional(),
    justification: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const commandValues = Array.isArray(value.command)
      ? value.command.filter((item) => typeof item === "string" && item.trim().length > 0)
      : typeof value.command === "string" && value.command.trim().length > 0
        ? [value.command]
        : [];

    if (commandValues.length === 0 && !value.script) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "command must not be empty",
        path: ["command"],
      });
    }
  });

type ShellInput = z.infer<typeof shellSchema>;

function normalizeShellInput(input: ShellInput): ShellParams {
  return normalizeShellParams(input);
}

const grepFilesSchema: z.ZodType<GrepFilesParams> = z.object({
  pattern: z.string(),
  include: z.string().optional(),
  path: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

const listDirSchema = z
  .object({
    dirPath: z.string().optional(),
    dir_path: z.string().optional(),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().positive().optional(),
    depth: z.number().int().min(1).optional(),
  })
  .passthrough();

type ListDirInput = z.infer<typeof listDirSchema>;

const readFileSchema = z
  .object({
    filePath: z.string().optional(),
    file_path: z.string().optional(),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().positive().optional(),
    mode: z.string().optional(),
    indentation: z
      .object({
        anchor_line: z.number().int().min(1).optional(),
        max_levels: z.number().int().min(0).optional(),
        include_siblings: z.boolean().optional(),
        include_header: z.boolean().optional(),
        max_lines: z.number().int().positive().optional(),
      })
      .optional(),
    anchorLine: z.number().int().min(1).optional(),
    maxLevels: z.number().int().min(0).optional(),
    includeSiblings: z.boolean().optional(),
    includeHeader: z.boolean().optional(),
    maxLines: z.number().int().positive().optional(),
  })
  .passthrough();

type ReadFileInput = z.infer<typeof readFileSchema>;

type ApplyPatchInput = {
  patch: string;
  cwd?: string;
};

const applyPatchSchema: z.ZodType<ApplyPatchInput> = z.object({
  patch: z.string().min(1),
  cwd: z.string().optional(),
});
