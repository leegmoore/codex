/**
 * Tool Registry - Central registry for all available tools
 *
 * This module provides a typed interface for accessing all tools
 * and is used by the script harness to expose tools to sandboxed scripts.
 */

import { applyPatch } from "./apply-patch/index.js";
import { readFile, type ReadFileParams } from "./read-file/index.js";
import { listDir, type ListDirParams } from "./list-dir/index.js";
import { grepFiles, type GrepFilesParams } from "./grep-files/index.js";
import { viewImage, type ViewImageParams } from "./view-image/index.js";
import {
  updatePlan,
  PLAN_TOOL_SPEC,
  type UpdatePlanParams,
} from "./plan/index.js";
import {
  listMcpResources,
  listMcpResourceTemplates,
  readMcpResource,
  type ListMcpResourcesParams,
  type ListMcpResourceTemplatesParams,
  type ReadMcpResourceParams,
  MCP_RESOURCE_TOOL_SPECS,
} from "./mcp-resource/index.js";
import {
  processExecToolCall,
  type ExecParams,
  type ExecToolCallOutput,
} from "../core/exec/index.js";
import {
  run as fileSearchRun,
  type FileSearchOptions,
  type FileSearchResults,
} from "../file-search/index.js";
import { ToolOptions } from "./types.js";
import type { ToolSpec, JsonSchema } from "../core/client/client-common.js";
import { SandboxType } from "../core/sandboxing/index.js";
import { type SandboxPolicy } from "../protocol/protocol.js";
// Phase 4.7: Web search and document tools
import {
  perplexitySearch,
  type PerplexitySearchParams,
  type PerplexitySearchResult,
  webSearch,
  type WebSearchParams,
  type WebSearchResult,
} from "./web/index.js";
import {
  fetchUrl,
  type FetchUrlParams,
  type FetchUrlResult,
} from "./web/index.js";
import {
  llmChat,
  type LLMChatParams,
  type LLMChatResult,
} from "./agents/index.js";
import {
  launchSync,
  type LaunchSyncParams,
  type LaunchSyncResult,
} from "./agents/index.js";
import {
  launchAsync,
  type LaunchAsyncParams,
  type LaunchAsyncResult,
} from "./agents/index.js";
import {
  saveToFC,
  type SaveToFCParams,
  type SaveToFCResult,
} from "./docs/index.js";
import {
  fetchFromFC,
  type FetchFromFCParams,
  type FetchFromFCResult,
} from "./docs/index.js";
import {
  writeFile,
  type WriteFileParams,
  type WriteFileResult,
} from "./docs/index.js";
import {
  savePrompts,
  type SavePromptsParams,
  type SavePromptsResult,
} from "./prompts/index.js";
import {
  getPrompts,
  type GetPromptsParams,
  type GetPromptsResult,
} from "./prompts/index.js";

const NON_EMPTY_STRING_SCHEMA = { type: "string", minLength: 1 } as const;
const STRING_ARRAY_SCHEMA = {
  type: "array",
  items: NON_EMPTY_STRING_SCHEMA,
  minItems: 1,
} as const;
const STRING_OR_STRING_ARRAY_SCHEMA = {
  anyOf: [NON_EMPTY_STRING_SCHEMA, STRING_ARRAY_SCHEMA],
} as const;
const POSITIVE_INTEGER_SCHEMA = { type: "integer", minimum: 1 } as const;
const NON_NEGATIVE_INTEGER_SCHEMA = { type: "integer", minimum: 0 } as const;

/**
 * Tool function signature
 */
export type ToolFunction<TParams = unknown, TResult = unknown> = (
  params: TParams,
  options?: ToolOptions,
) => Promise<TResult>;

/**
 * Tool metadata for validation and documentation
 */
export interface ToolMetadata {
  name: string;
  description: string;
  requiresApproval: boolean;
  schema?: Record<string, unknown>; // JSON schema for parameters
}

/**
 * Registered tool with metadata and execution function
 */
export interface RegisteredTool<TParams = unknown, TResult = unknown> {
  metadata: ToolMetadata;
  execute: ToolFunction<TParams, TResult>;
}

/**
 * Tool Registry class
 */
export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * Register default tools
   */
  private registerDefaultTools(): void {
    // Apply Patch tool
    this.register({
      metadata: {
        name: "applyPatch",
        description: "Apply a unified diff patch to files",
        requiresApproval: true,
        schema: {
          type: "object",
          properties: {
            patch: { type: "string", description: "Unified diff content" },
            cwd: {
              type: "string",
              description:
                "Working directory where the patch should be applied",
            },
          },
          required: ["patch"],
        },
      },
      execute: async (params: { patch: string; cwd?: string }) => {
        const result = await applyPatch(params.patch, { cwd: params.cwd });
        return result;
      },
    });

    // Read File tool
    this.register({
      metadata: {
        name: "readFile",
        description:
          "Read file contents with various modes (slice or indentation)",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            filePath: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Absolute or relative path to the file to read",
            },
            offset: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "1-indexed line number to start reading from",
            },
            limit: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum number of lines to return",
            },
            mode: {
              type: "string",
              description: "slice (default) or indentation mode",
              enum: ["slice", "indentation"],
            },
            anchorLine: {
              ...POSITIVE_INTEGER_SCHEMA,
              description:
                "For indentation mode, the primary line that anchors the block",
            },
            maxLevels: {
              ...NON_NEGATIVE_INTEGER_SCHEMA,
              description:
                "Maximum indentation levels to include when expanding the block",
            },
            includeSiblings: {
              type: "boolean",
              description: "Include sibling blocks when using indentation mode",
            },
            includeHeader: {
              type: "boolean",
              description:
                "Include leading comment/header lines when using indentation mode",
            },
            maxLines: {
              ...POSITIVE_INTEGER_SCHEMA,
              description:
                "Safety cap on total lines when using indentation mode",
            },
            workdir: {
              type: "string",
              description:
                "Working directory used to resolve relative file paths",
            },
          },
          required: ["filePath"],
          additionalProperties: false,
        },
      },
      execute: async (params: ReadFileParams) => {
        return await readFile(params);
      },
    });

    // List Directory tool
    this.register({
      metadata: {
        name: "listDir",
        description: "List directory contents recursively",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            dirPath: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Directory to inspect",
            },
            offset: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "1-indexed entry offset",
            },
            limit: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum number of entries to return",
            },
            depth: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "How many directory levels to traverse",
            },
          },
          required: ["dirPath"],
          additionalProperties: false,
        },
      },
      execute: async (params: ListDirParams) => {
        return await listDir(params);
      },
    });

    // Grep Files tool
    this.register({
      metadata: {
        name: "grepFiles",
        description: "Search for patterns in files using ripgrep",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            pattern: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Regex pattern to search for",
            },
            include: {
              type: "string",
              description: "Optional glob to limit the search",
            },
            path: {
              type: "string",
              description: "Directory or file path to search (defaults to cwd)",
            },
            limit: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum number of matching files to return",
            },
          },
          required: ["pattern"],
          additionalProperties: false,
        },
      },
      execute: async (params: GrepFilesParams) => {
        return await grepFiles(params, { cwd: process.cwd() });
      },
    });

    // Exec tool (requires approval)
    this.register({
      metadata: {
        name: "exec",
        description: "Execute a command in a sandboxed environment",
        requiresApproval: true,
        schema: {
          type: "object",
          properties: {
            command: {
              type: "array",
              description: "Command and arguments to run",
              items: NON_EMPTY_STRING_SCHEMA,
              minItems: 1,
            },
            cwd: {
              type: "string",
              description: "Working directory for the command",
            },
            env: {
              type: "object",
              description: "Additional environment variables",
              additionalProperties: { type: "string" },
            },
            timeoutMs: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum runtime in milliseconds",
            },
          },
          required: ["command"],
          additionalProperties: false,
        },
      },
      execute: async (params: {
        command: string[];
        cwd?: string;
        env?: Record<string, string>;
        timeoutMs?: number;
      }): Promise<ExecToolCallOutput> => {
        const execParams: ExecParams = {
          command: params.command,
          cwd: params.cwd || process.cwd(),
          env: params.env || {},
          timeoutMs: params.timeoutMs,
        };
        const policy: SandboxPolicy = { mode: "read-only" }; // Default to read-only sandbox
        return await processExecToolCall(
          execParams,
          SandboxType.None, // Default to no sandboxing - can be configured
          policy,
          process.cwd(), // Sandbox CWD
          undefined, // No custom sandbox exe
        );
      },
    });

    // File Search tool
    this.register({
      metadata: {
        name: "fileSearch",
        description: "Fast fuzzy file search",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            pattern: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Fuzzy match pattern",
            },
            limit: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum number of matches to return",
            },
            searchDirectory: {
              type: "string",
              description: "Directory to search (defaults to cwd)",
            },
            exclude: {
              ...STRING_ARRAY_SCHEMA,
              description: "Glob patterns to exclude",
            },
          },
          required: ["pattern"],
          additionalProperties: false,
        },
      },
      execute: async (
        params: {
          pattern: string;
          limit?: number;
          searchDirectory?: string;
          exclude?: string[];
        },
        options?: ToolOptions,
      ): Promise<FileSearchResults> => {
        const searchOptions: FileSearchOptions = {
          pattern: params.pattern,
          limit: params.limit,
          searchDirectory: params.searchDirectory,
          exclude: params.exclude,
          signal: options?.signal,
        };
        return await fileSearchRun(searchOptions);
      },
    });

    // View Image tool
    this.register({
      metadata: {
        name: "viewImage",
        description:
          "Validate and prepare an image for viewing in the conversation",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            path: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Path to the image file",
            },
            workdir: {
              type: "string",
              description: "Working directory used to resolve the image path",
            },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
      execute: async (params: ViewImageParams) => {
        return await viewImage(params);
      },
    });

    // Plan (update_plan) tool
    this.register({
      metadata: {
        name: "updatePlan",
        description:
          "Update the task plan with structured steps. At most one step can be in_progress at a time.",
        requiresApproval: false,
        schema: PLAN_TOOL_SPEC.parameters,
      },
      execute: async (params: UpdatePlanParams) => {
        return await updatePlan(params);
      },
    });

    // MCP Resource tools (3 operations)
    this.register({
      metadata: {
        name: "listMcpResources",
        description: "List available resources from MCP servers",
        requiresApproval: false,
        schema: MCP_RESOURCE_TOOL_SPECS.list_mcp_resources.parameters,
      },
      execute: async (params: ListMcpResourcesParams) => {
        return await listMcpResources(params);
      },
    });

    this.register({
      metadata: {
        name: "listMcpResourceTemplates",
        description: "List available resource templates from MCP servers",
        requiresApproval: false,
        schema: MCP_RESOURCE_TOOL_SPECS.list_mcp_resource_templates.parameters,
      },
      execute: async (params: ListMcpResourceTemplatesParams) => {
        return await listMcpResourceTemplates(params);
      },
    });

    this.register({
      metadata: {
        name: "readMcpResource",
        description: "Read content from a specific MCP resource",
        requiresApproval: false,
        schema: MCP_RESOURCE_TOOL_SPECS.read_mcp_resource.parameters,
      },
      execute: async (params: ReadMcpResourceParams) => {
        return await readMcpResource(params);
      },
    });

    // Phase 4.7: Web Search & Document Tools

    // Perplexity reasoning search tool
    this.register({
      metadata: {
        name: "perplexitySearch",
        description:
          "Perform reasoning-based research using Perplexity Sonar Reasoning Pro",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            query: {
              ...STRING_OR_STRING_ARRAY_SCHEMA,
              description: "Single query string or array of queries",
            },
            maxResults: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum number of aggregated results",
            },
            prefetch: {
              ...NON_NEGATIVE_INTEGER_SCHEMA,
              description: "Number of top results to prefetch",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      execute: async (
        params: PerplexitySearchParams,
      ): Promise<PerplexitySearchResult> => {
        return await perplexitySearch(params);
      },
    });

    // Live web search tool
    this.register({
      metadata: {
        name: "webSearch",
        description:
          "Search the live web and return ranked results with URLs, titles, and snippets",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            query: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Search query string",
            },
            maxResults: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum number of results to return",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      execute: async (params: WebSearchParams): Promise<WebSearchResult> => {
        return await webSearch(params);
      },
    });

    // Fetch URL tool
    this.register({
      metadata: {
        name: "fetchUrl",
        description: "Fetch URL content via Firecrawl with caching",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            urls: {
              ...STRING_OR_STRING_ARRAY_SCHEMA,
              description: "One URL or list of URLs to fetch",
            },
            maxLength: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum number of characters per fetched document",
            },
          },
          required: ["urls"],
          additionalProperties: false,
        },
      },
      execute: async (params: FetchUrlParams): Promise<FetchUrlResult> => {
        return await fetchUrl(params);
      },
    });

    // LLM Chat tool
    this.register({
      metadata: {
        name: "llmChat",
        description: "Single-shot LLM call using OpenRouter",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            messages: {
              type: "array",
              description: "Conversation messages to forward",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  role: {
                    type: "string",
                    enum: ["system", "user", "assistant"],
                  },
                  content: { ...NON_EMPTY_STRING_SCHEMA },
                },
                required: ["role", "content"],
                additionalProperties: false,
              },
            },
            model: {
              type: "string",
              description: "Optional OpenRouter model identifier",
            },
            temperature: {
              type: "number",
              minimum: 0,
              maximum: 2,
              description: "Sampling temperature",
            },
            maxTokens: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum completion tokens",
            },
            systemPrompt: {
              type: "string",
              description: "Optional system prompt prefix",
            },
          },
          required: ["messages"],
          additionalProperties: false,
        },
      },
      execute: async (params: LLMChatParams): Promise<LLMChatResult> => {
        return await llmChat(params);
      },
    });

    // Agent Launch Sync tool
    this.register({
      metadata: {
        name: "launchSync",
        description: "Launch synchronous agent (waits for completion) [STUB]",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            agentType: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Agent persona to execute (e.g., researcher)",
            },
            task: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Task description for the agent",
            },
            context: {
              type: "object",
              description: "Optional structured context passed to the agent",
            },
            maxTokens: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum tokens the agent may consume",
            },
          },
          required: ["agentType", "task"],
          additionalProperties: false,
        },
      },
      execute: async (params: LaunchSyncParams): Promise<LaunchSyncResult> => {
        return await launchSync(params);
      },
    });

    // Agent Launch Async tool
    this.register({
      metadata: {
        name: "launchAsync",
        description: "Launch asynchronous agent (background execution) [STUB]",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            agentType: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Agent persona to execute",
            },
            task: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Task description for the agent",
            },
            context: {
              type: "object",
              description: "Optional structured context",
            },
            maxTokens: {
              ...POSITIVE_INTEGER_SCHEMA,
              description: "Maximum tokens allocated to the agent",
            },
            callbackUrl: {
              type: "string",
              description: "Optional webhook invoked when the job completes",
            },
          },
          required: ["agentType", "task"],
          additionalProperties: false,
        },
      },
      execute: async (
        params: LaunchAsyncParams,
      ): Promise<LaunchAsyncResult> => {
        return await launchAsync(params);
      },
    });

    // Save to File Cabinet tool
    this.register({
      metadata: {
        name: "saveToFC",
        description: "Save fileKey to File Cabinet (30 day storage) [STUB]",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            fileKey: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Identifier of the file to save",
            },
            note: {
              type: "string",
              description: "Optional note or description",
            },
          },
          required: ["fileKey"],
          additionalProperties: false,
        },
      },
      execute: async (params: SaveToFCParams): Promise<SaveToFCResult> => {
        return await saveToFC(params);
      },
    });

    // Fetch from File Cabinet tool
    this.register({
      metadata: {
        name: "fetchFromFC",
        description: "Retrieve content by fileKey from File Cabinet [STUB]",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            fileKeys: {
              ...STRING_OR_STRING_ARRAY_SCHEMA,
              description: "Single fileKey or list of fileKeys to fetch",
            },
          },
          required: ["fileKeys"],
          additionalProperties: false,
        },
      },
      execute: async (
        params: FetchFromFCParams,
      ): Promise<FetchFromFCResult> => {
        return await fetchFromFC(params);
      },
    });

    // Write File tool
    this.register({
      metadata: {
        name: "writeFile",
        description: "Write fileKey content to filesystem [STUB]",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            fileKey: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Identifier of the staged file contents",
            },
            path: {
              ...NON_EMPTY_STRING_SCHEMA,
              description: "Destination path on disk",
            },
            overwrite: {
              type: "boolean",
              description: "Whether to overwrite the destination if it exists",
            },
          },
          required: ["fileKey", "path"],
          additionalProperties: false,
        },
      },
      execute: async (params: WriteFileParams): Promise<WriteFileResult> => {
        return await writeFile(params);
      },
    });

    // Save Prompts tool
    this.register({
      metadata: {
        name: "savePrompts",
        description: "Store prompts in cache and return promptKeys [STUB]",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            prompts: {
              type: "array",
              description: "Prompts to store",
              minItems: 1,
              items: {
                type: "object",
                properties: {
                  name: { ...NON_EMPTY_STRING_SCHEMA },
                  content: { ...NON_EMPTY_STRING_SCHEMA },
                },
                required: ["name", "content"],
                additionalProperties: false,
              },
            },
          },
          required: ["prompts"],
          additionalProperties: false,
        },
      },
      execute: async (
        params: SavePromptsParams,
      ): Promise<SavePromptsResult> => {
        return await savePrompts(params);
      },
    });

    // Get Prompts tool
    this.register({
      metadata: {
        name: "getPrompts",
        description: "Retrieve prompts by keys [STUB]",
        requiresApproval: false,
        schema: {
          type: "object",
          properties: {
            promptKeys: {
              ...STRING_OR_STRING_ARRAY_SCHEMA,
              description: "Prompt key or list of prompt keys to fetch",
            },
          },
          required: ["promptKeys"],
          additionalProperties: false,
        },
      },
      execute: async (params: GetPromptsParams): Promise<GetPromptsResult> => {
        return await getPrompts(params);
      },
    });
  }

  /**
   * Register a tool
   */
  register<TParams, TResult>(tool: RegisteredTool<TParams, TResult>): void {
    this.tools.set(tool.metadata.name, tool as RegisteredTool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all tools
   */
  getAll(): Map<string, RegisteredTool> {
    return new Map(this.tools);
  }

  /**
   * Convert registered tools to ToolSpec entries for model prompts.
   */
  getToolSpecs(): ToolSpec[] {
    return Array.from(this.tools.values()).map((tool) => {
      const parameters = (tool.metadata.schema as JsonSchema | undefined) ?? {
        type: "object",
        properties: {},
      };
      return {
        type: "function",
        name: tool.metadata.name,
        description: tool.metadata.description,
        strict: false,
        parameters,
      } satisfies ToolSpec;
    });
  }
}

/**
 * Global tool registry instance
 */
export const toolRegistry = new ToolRegistry();
