/**
 * Standard tool result interface for all tools.
 */
export interface ToolResult {
  content: string;
  success: boolean;
}

/**
 * Tool execution options.
 */
export interface ToolOptions {
  signal?: AbortSignal;
}

export type ToolApprovalCallback = (
  toolName: string,
  args: unknown,
) => Promise<boolean>;
