export interface FunctionToolSchema {
  name: string;
  description: string;
  strict: boolean;
  parameters: Record<string, unknown>;
  supportsParallelToolCalls?: boolean;
}

export const CORE_TOOL_SPECS: FunctionToolSchema[] = [
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
              description:
                "Anchor line to center the indentation lookup on (defaults to offset).",
            },
            max_levels: {
              type: "number",
              description:
                "How many parent indentation levels (smaller indents) to include.",
            },
            include_siblings: {
              type: "boolean",
              description:
                "When true, include additional blocks that share the anchor indentation.",
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
