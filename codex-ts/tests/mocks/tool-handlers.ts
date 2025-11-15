import { vi } from "vitest";
import type { RegisteredTool } from "../../src/tools/registry.js";
import type { ToolFunction } from "../../src/tools/registry.js";

export interface MockToolHandlerOptions<TResult = unknown> {
  requiresApproval?: boolean;
  implementation?: ToolFunction<unknown, TResult>;
  result?: TResult;
}

export function createMockToolHandler<TResult = unknown>(
  name: string,
  options: MockToolHandlerOptions<TResult> = {},
): RegisteredTool<unknown, TResult> & {
  execute: ReturnType<typeof vi.fn>;
} {
  const execute =
    options.implementation ??
    vi.fn().mockResolvedValue(
      options.result ?? ({ content: `${name} result` } as TResult),
    );

  return {
    metadata: {
      name,
      description: `${name} tool (mock)`,
      requiresApproval: options.requiresApproval ?? true,
    },
    execute: execute as ReturnType<typeof vi.fn>,
  } as RegisteredTool<unknown, TResult> & {
    execute: ReturnType<typeof vi.fn>;
  };
}
