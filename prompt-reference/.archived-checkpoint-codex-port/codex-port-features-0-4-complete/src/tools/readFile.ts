import { promises as fs } from "node:fs";
import { isAbsolute } from "node:path";

import { ToolResult } from "./types";

const DEFAULT_OFFSET = 1;
const DEFAULT_LIMIT = 2000;
const MAX_LINE_LENGTH = 500;

export interface ReadFileParams {
  filePath: string;
  offset?: number;
  limit?: number;
}

export async function readFile(params: ReadFileParams): Promise<ToolResult> {
  const offset = params.offset ?? DEFAULT_OFFSET;
  const limit = params.limit ?? DEFAULT_LIMIT;

  if (offset <= 0) {
    throw new Error("offset must be a 1-indexed line number");
  }

  if (limit <= 0) {
    throw new Error("limit must be greater than zero");
  }

  const filePath = params.filePath;
  if (!isAbsolute(filePath)) {
    throw new Error("file_path must be an absolute path");
  }

  let fileContent: string;
  try {
    const buffer = await fs.readFile(filePath);
    fileContent = buffer.toString("utf8");
  } catch (error) {
    throw new Error(`failed to read file: ${(error as Error).message}`);
  }

  const lines = splitLines(fileContent);

  if (lines.length === 0 || offset > lines.length) {
    throw new Error("offset exceeds file length");
  }

  const startIndex = offset - 1;
  const slice = lines.slice(startIndex, startIndex + limit);

  const formatted = slice.map((line, index) => {
    const lineNumber = startIndex + index + 1;
    const formattedLine = formatLine(line);
    return `L${lineNumber}: ${formattedLine}`;
  });

  return {
    content: formatted.join("\n"),
    success: true,
  };
}

function splitLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }

  const rawLines = content.split("\n");
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
    rawLines.pop();
  }

  return rawLines.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
}

function formatLine(line: string): string {
  if (line.length <= MAX_LINE_LENGTH) {
    return line;
  }

  return Array.from(line).slice(0, MAX_LINE_LENGTH).join("");
}
