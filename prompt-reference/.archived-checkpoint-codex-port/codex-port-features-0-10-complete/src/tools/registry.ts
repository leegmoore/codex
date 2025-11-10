import { applyPatch } from "./applyPatch/applyPatch";
import type { ApplyPatchOptions } from "./applyPatch/applyPatch";
import { grepFiles, type GrepFilesParams } from "./grepFiles";
import { listDir, type ListDirParams } from "./listDir";
import { readFile, type ReadFileParams } from "./readFile";
import { runShell, type ShellParams } from "./shell";

type ToolHandler = (input: unknown) => Promise<unknown>;

type ToolRegistry = Record<string, ToolHandler>;

export const TOOL_REGISTRY: ToolRegistry = {
  grep_files: async (input: unknown) => {
    return grepFiles((input ?? {}) as GrepFilesParams);
  },
  list_dir: async (input: unknown) => {
    return listDir(normalizeListDirParams(input));
  },
  read_file: async (input: unknown) => {
    return readFile(normalizeReadFileParams(input));
  },
  shell: async (input: unknown) => {
    return runShell(normalizeShellParams(input));
  },
  apply_patch: async (input: unknown) => {
    if (!input || typeof input !== "object") {
      throw new Error("apply_patch requires object input");
    }
    const { patch, cwd } = input as { patch?: string; cwd?: string };
    if (typeof patch !== "string" || patch.length === 0) {
      throw new Error("apply_patch requires a non-empty `patch` string");
    }
    const options: ApplyPatchOptions = {};
    if (typeof cwd === "string" && cwd.length > 0) {
      options.cwd = cwd;
    }
    return applyPatch(patch, options);
  },
} as const;

export type ToolName = keyof typeof TOOL_REGISTRY;

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return { ...(input as Record<string, unknown>) };
}

export function normalizeListDirParams(input: unknown): ListDirParams {
  const record = toRecord(input);
  if (typeof record.dirPath !== "string" && typeof record.dir_path === "string") {
    record.dirPath = record.dir_path;
  }
  return record as ListDirParams;
}

export function normalizeReadFileParams(input: unknown): ReadFileParams {
  const record = toRecord(input);

  if (typeof record.filePath !== "string" && typeof record.file_path === "string") {
    record.filePath = record.file_path;
  }

  const indentation = record.indentation;
  if (indentation && typeof indentation === "object") {
    const ind = indentation as Record<string, unknown>;
    if (record.mode === undefined) {
      record.mode = "indentation";
    }
    if (record.anchorLine === undefined && typeof ind.anchor_line === "number") {
      record.anchorLine = ind.anchor_line;
    }
    if (record.maxLevels === undefined && typeof ind.max_levels === "number") {
      record.maxLevels = ind.max_levels;
    }
    if (record.includeSiblings === undefined && typeof ind.include_siblings === "boolean") {
      record.includeSiblings = ind.include_siblings;
    }
    if (record.includeHeader === undefined && typeof ind.include_header === "boolean") {
      record.includeHeader = ind.include_header;
    }
    if (record.maxLines === undefined && typeof ind.max_lines === "number") {
      record.maxLines = ind.max_lines;
    }
  }

  return record as ReadFileParams;
}

export function normalizeShellParams(input: unknown): ShellParams {
  const record = toRecord(input);

  if (record.timeoutMs === undefined && typeof record.timeout_ms === "number") {
    record.timeoutMs = record.timeout_ms;
  }

  let command = record.command;
  if (Array.isArray(command)) {
    command = command.filter((value) => typeof value === "string" && value.trim().length > 0);
  } else if (typeof command === "string") {
    command = command.trim().length > 0 ? [command.trim()] : [];
  }

  if ((!command || (Array.isArray(command) && command.length === 0)) && typeof record.script === "string") {
    command = ["bash", "-lc", record.script];
    delete record.script;
  }

  if (command) {
    record.command = command;
  }

  return record as ShellParams;
}
