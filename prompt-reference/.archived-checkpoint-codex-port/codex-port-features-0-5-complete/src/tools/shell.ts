import { spawn } from "bun";
import { promises as fs } from "node:fs";

import { ToolResult } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const TIMEOUT_MESSAGE = "command timed out after 30 seconds";

export interface ShellParams {
  command: string[];
  workdir?: string;
  timeoutMs?: number;
}

export async function runShell(params: ShellParams): Promise<ToolResult> {
  if (!params.command || params.command.length === 0) {
    throw new Error("command must not be empty");
  }

  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (timeoutMs <= 0) {
    throw new Error("timeout must be greater than zero");
  }

  const cwd = params.workdir ?? process.cwd();
  if (params.workdir) {
    try {
      await fs.stat(params.workdir);
    } catch (error) {
      throw new Error(`unable to access workdir \`${params.workdir}\`: ${(error as Error).message}`);
    }
  }

  let subprocess;
  try {
    subprocess = spawn({
      cmd: params.command,
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw new Error(`failed to spawn command: ${(error as Error).message}`);
  }

  const execution = (async () => {
    const [stdout, stderr] = await Promise.all([
      streamToString(subprocess.stdout),
      streamToString(subprocess.stderr),
    ]);
    const code = await subprocess.exited;
    return { stdout, stderr, code };
  })();

  const result = await withTimeout(execution, timeoutMs, () => {
    try {
      subprocess.kill();
    } catch {
      // ignore
    }
  });

  if (result.code === 0) {
    const pieces = [];
    if (result.stdout) {
      pieces.push(result.stdout);
    }
    if (result.stderr) {
      pieces.push(result.stderr);
    }
    return { content: pieces.join(""), success: true };
  }

  throw new Error(`command failed with exit code ${result.code}`);
}

async function streamToString(
  stream: ReadableStream<Uint8Array> | number | null | undefined,
): Promise<string> {
  if (!stream || typeof stream === "number") {
    return "";
  }
  return new Response(stream).text();
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout();
      } catch {
        // ignore errors when killing process
      }
      reject(new Error(TIMEOUT_MESSAGE));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
