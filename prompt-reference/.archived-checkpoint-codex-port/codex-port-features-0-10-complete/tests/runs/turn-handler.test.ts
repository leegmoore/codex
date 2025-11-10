import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createDefaultRunTurnHandler } from "../../src/runs/turn-handler";
import type { ProcessRunner, SpawnedProcess } from "../../src/runs/turn-handler";
import type { ContinuousRunConfig, RunEvent } from "../../src/runs/types";

const FIXED_NOW = new Date("2025-10-27T18:00:00.000Z");

describe("default run turn handler", () => {
  let workspaceRoot: string;
  let harnessRoot: string;
  let epicId: string;

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "turn-handler-workspace-"));
    harnessRoot = join(workspaceRoot, ".cody-harness");
    epicId = "current-epic";
    await mkdir(join(harnessRoot, epicId), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  test("streams subprocess output, builds prompt, and stops when completion detected", async () => {
    const projectDir = join(workspaceRoot, "project");
    await mkdir(projectDir, { recursive: true });

    const codysLogPath = join(harnessRoot, epicId, "codys-log.md");
    const decisionLogPath = join(harnessRoot, "decision-log.md");
    const designDocPath = join(harnessRoot, epicId, "continuous-run-design.md");

    await writeFile(codysLogPath, "Initial entry\nSTATUS: FEATURE_9_COMPLETE\n", "utf8");
    await writeFile(decisionLogPath, "- Previous choice\n", "utf8");
    await writeFile(designDocPath, "# Design\n", "utf8");

    const mock = createMockProcessRunner({
      stdoutChunks: ["turn output\n"],
      stderrChunks: ["debug info\n"],
      exitCode: 0,
    });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      promptOutputDir: join(workspaceRoot, "tmp"),
      now: () => FIXED_NOW,
    });

    const result = await handler({
      runId: "r_test",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 1,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("success");
    expect(result.shouldContinue).toBe(false);
    expect(result.completion?.detected).toBe(true);

    const eventTypes = result.events.map((event) => event.type);
    expect(eventTypes).toEqual([
      "turn_started",
      "subprocess_output",
      "subprocess_output",
      "turn_completed",
    ]);

    const promptText = mock.getWrittenPrompt();
    expect(promptText).toContain("# Cody's Turn Prompt");
    expect(promptText).toContain("STATUS: FEATURE_9_COMPLETE");
    expect(promptText).toContain("# Design");
    expect(promptText).toContain("=== BEGIN WORK ===");

    const commands = mock.getCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toEqual([
      "codex",
      "exec",
      "--model",
      "gpt-5-codex",
      "--config",
      "model_reasoning_effort=high",
      "--config",
      "approval_policy=never",
      "--sandbox",
      "danger-full-access",
      "--skip-git-repo-check",
    ]);
    expect(mock.getSpawnOptions()[0]?.cwd).toBe(projectDir);
  });

  test("returns failure when subprocess exits with non-zero status", async () => {
    const projectDir = join(workspaceRoot, "repo");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(harnessRoot, epicId, "codys-log.md"), "No completion yet\n", "utf8");

    const mock = createMockProcessRunner({
      stdoutChunks: ["doing work\n"],
      exitCode: 17,
    });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      now: () => FIXED_NOW,
    });

    const result = await handler({
      runId: "r_failure",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 2,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("failure");
    expect(result.error?.code).toBe("subprocess_exit");
    expect(result.error?.message).toContain("exited with code 17");

    const eventTypes = result.events.map((event) => event.type);
    expect(eventTypes).toContain("turn_failed");
  });

  test("cancels turn when abort signal triggers", async () => {
    const projectDir = join(workspaceRoot, "project");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(harnessRoot, epicId, "codys-log.md"), "Still running\n", "utf8");

    const mock = createMockProcessRunner({ autoExit: false });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      now: () => FIXED_NOW,
    });

    const controller = new AbortController();
    const handlerPromise = handler({
      runId: "r_cancel",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 3,
      signal: controller.signal,
    });

    setTimeout(() => controller.abort("manual"), 5);

    const result = await handlerPromise;
    expect(result.status).toBe("cancelled");
    expect(result.reason).toBe("manual");
    expect(mock.wasKilled()).toBe(true);
  });

  test("emits log_updated events when project logs append", async () => {
    const projectDir = join(workspaceRoot, "workspace");
    await mkdir(projectDir, { recursive: true });

    const codysLogPath = join(harnessRoot, epicId, "codys-log.md");
    const decisionLogPath = join(harnessRoot, "decision-log.md");
    await writeFile(codysLogPath, "Initial log line\n", "utf8");
    await writeFile(decisionLogPath, "Initial decision entry\n", "utf8");

    const mock = createMockProcessRunner({ autoExit: false, pid: 12345 });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      now: () => FIXED_NOW,
    });

    const turnPromise = handler({
      runId: "r_logs",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 4,
      signal: new AbortController().signal,
      onPid: () => {},
    });

    await appendFile(codysLogPath, "New session notes\nAnother line\n", "utf8");
    await appendFile(decisionLogPath, "Decision updated\n", "utf8");

    mock.resolveExit();

    const result = await turnPromise;
    expect(result.status).toBe("success");

    const logEvents = result.events
      .filter((event) => event.type === "log_updated")
      .map((event) => event as any);
    expect(logEvents).toHaveLength(2);

    const codysLogEvent = logEvents.find((event) => event.kind === "codys-log");
    expect(codysLogEvent).toBeDefined();
    expect(codysLogEvent.path).toBe(codysLogPath);
    expect(codysLogEvent.delta.addedLines).toBeGreaterThan(0);
    expect(codysLogEvent.delta.tail).toContain("Another line");

    const decisionLogEvent = logEvents.find((event) => event.kind === "decision-log");
    expect(decisionLogEvent).toBeDefined();
    expect(decisionLogEvent.path).toBe(decisionLogPath);
    expect(decisionLogEvent.delta.addedLines).toBe(1);
    expect(decisionLogEvent.delta.tail).toContain("Decision updated");
  });

  test("parses codex telemetry lines for file and test events", async () => {
    const projectDir = join(workspaceRoot, "workspace");
    await mkdir(projectDir, { recursive: true });

    const codysLogPath = join(harnessRoot, epicId, "codys-log.md");
    await writeFile(codysLogPath, "Initial log line\n", "utf8");

    const telemetryLines = [
      telemetryJson({ type: "file_written", path: "src/app.ts", bytes: 128, sha256: "abc123" }),
      telemetryJson({ type: "file_deleted", path: "old/test.ts" }),
      telemetryJson({ type: "file_read", path: "README.md", bytes: 512 }),
      telemetryJson({
        type: "test_run_started",
        command: "bun test",
      }),
      telemetryJson({
        type: "test_run_completed",
        command: "bun test",
        exitCode: 0,
        durationMs: 321,
        summary: { passed: 12, failed: 0, skipped: 1 },
      }),
    ];

    const stdoutChunks = [
      "regular output line\n",
      `${telemetryLines[0]}\n${telemetryLines[1]}\n`,
      `${telemetryLines[2]}\n`,
      `${telemetryLines[3]}\n${telemetryLines[4]}\n`,
    ];

    const mock = createMockProcessRunner({
      stdoutChunks,
      exitCode: 0,
    });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      now: () => FIXED_NOW,
    });

    const result = await handler({
      runId: "r_events",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 5,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("success");

    const eventsByType = result.events.reduce<Record<string, RunEvent[]>>((acc, event) => {
      (acc[event.type] ??= []).push(event);
      return acc;
    }, {});

    expect(eventsByType["file_written"]).toHaveLength(1);
    expect(eventsByType["file_written"]?.[0]).toMatchObject({
      type: "file_written",
      path: "src/app.ts",
      bytes: 128,
      sha256: "abc123",
    });

    expect(eventsByType["file_deleted"]).toHaveLength(1);
    expect(eventsByType["file_deleted"]?.[0]).toMatchObject({
      type: "file_deleted",
      path: "old/test.ts",
    });

    expect(eventsByType["file_read"]).toHaveLength(1);
    expect(eventsByType["file_read"]?.[0]).toMatchObject({
      type: "file_read",
      path: "README.md",
      bytes: 512,
    });

    expect(eventsByType["test_run_started"]).toHaveLength(1);
    expect(eventsByType["test_run_started"]?.[0]).toMatchObject({
      type: "test_run_started",
      command: "bun test",
    });

    expect(eventsByType["test_run_completed"]).toHaveLength(1);
    expect(eventsByType["test_run_completed"]?.[0]).toMatchObject({
      type: "test_run_completed",
      command: "bun test",
      exitCode: 0,
      durationMs: 321,
      summary: { passed: 12, failed: 0, skipped: 1 },
    });

    const subprocessOutputs = eventsByType["subprocess_output"] ?? [];
    expect(subprocessOutputs.length).toBeGreaterThanOrEqual(stdoutChunks.length);
  });

  test("captures token usage telemetry and surfaces totals in turn result", async () => {
    const projectDir = join(workspaceRoot, "workspace");
    await mkdir(projectDir, { recursive: true });

    const codysLogPath = join(harnessRoot, epicId, "codys-log.md");
    await writeFile(codysLogPath, "Initial log line\n", "utf8");

    const tokenTelemetry = telemetryJson({
      type: "token_usage",
      inputTokens: 321,
      outputTokens: 45,
      totalTokens: 366,
    });

    const mock = createMockProcessRunner({
      stdoutChunks: [`processing...\n${tokenTelemetry}\n`],
      exitCode: 0,
    });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      now: () => FIXED_NOW,
    });

    const result = await handler({
      runId: "r_tokens",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 6,
      signal: new AbortController().signal,
    });

    expect(result.status).toBe("success");
    expect(result.tokenUsage).toEqual({
      inputTokens: 321,
      outputTokens: 45,
      totalTokens: 366,
    });

    const tokenEvents = result.events.filter((event) => event.type === "token_usage");
    expect(tokenEvents).toHaveLength(1);
    expect(tokenEvents[0]).toMatchObject({
      type: "token_usage",
      inputTokens: 321,
      outputTokens: 45,
      totalTokens: 366,
    });
  });

  test("chunks subprocess output according to throttle byte limit", async () => {
    const projectDir = join(workspaceRoot, "workspace");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(harnessRoot, epicId, "codys-log.md"), "Initial log line\n", "utf8");

    const mock = createMockProcessRunner({
      stdoutChunks: ["abcdefghijk"],
      exitCode: 0,
    });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      now: () => FIXED_NOW,
      subprocessThrottle: {
        maxBytesPerEvent: 4,
        maxEventsPerInterval: 10,
        intervalMs: 1000,
      },
    });

    const result = await handler({
      runId: "r_throttle",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 7,
      signal: new AbortController().signal,
    });

    const outputs = result.events.filter((event) => event.type === "subprocess_output");
    expect(outputs.length).toBeGreaterThan(1);
    for (const event of outputs) {
      expect(Buffer.byteLength(event.text, "utf8")).toBeLessThanOrEqual(4);
    }
  });

  test("rate limits subprocess output event frequency", async () => {
    const projectDir = join(workspaceRoot, "workspace");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(harnessRoot, epicId, "codys-log.md"), "Initial log line\n", "utf8");

    let currentMs = Date.parse("2025-10-27T18:00:00.000Z");
    const mock = createMockProcessRunner({
      stdoutChunks: ["abcdefghijkl"],
      exitCode: 0,
    });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      now: () => new Date(currentMs),
      subprocessThrottle: {
        maxBytesPerEvent: 2,
        maxEventsPerInterval: 2,
        intervalMs: 50,
        clock: () => currentMs,
        sleep: async (ms: number) => {
          currentMs += ms;
        },
      },
    });

    const result = await handler({
      runId: "r_rate",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 8,
      signal: new AbortController().signal,
    });

    const outputs = result.events.filter((event) => event.type === "subprocess_output");
    expect(outputs.length).toBeGreaterThan(2);
    for (const event of outputs) {
      expect(Buffer.byteLength(event.text, "utf8")).toBeLessThanOrEqual(2);
    }

    const timestamps = outputs.map((event) => new Date(event.ts).getTime());
    const firstGap = timestamps[2] - timestamps[1];
    expect(firstGap).toBeGreaterThanOrEqual(50);
  });

  test("escalates SIGTERM to SIGKILL when process ignores termination", async () => {
    const projectDir = join(workspaceRoot, "workspace");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(harnessRoot, epicId, "codys-log.md"), "Initial log line\n", "utf8");

    const signals: Array<string | undefined> = [];

    const mock = createMockProcessRunner({
      autoExit: false,
      resolveOnKill: false,
      onKill: (signal) => {
        signals.push(typeof signal === "string" ? signal : undefined);
        if (signal === "SIGKILL") {
          mock.resolveExit();
        }
      },
    });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      now: () => FIXED_NOW,
      terminationGraceMs: 10,
    });

    const controller = new AbortController();
    const handlerPromise = handler({
      runId: "r_sigkill",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 9,
      signal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort("manual");

    await handlerPromise;

    expect(signals[0]).toBe("SIGTERM");
    expect(signals).toContain("SIGKILL");
  });

  test("avoids SIGKILL when process exits after SIGTERM", async () => {
    const projectDir = join(workspaceRoot, "workspace");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(harnessRoot, epicId, "codys-log.md"), "Initial log line\n", "utf8");

    const signals: Array<string | undefined> = [];

    const mock = createMockProcessRunner({
      autoExit: false,
      resolveOnKill: false,
      onKill: (signal) => {
        signals.push(typeof signal === "string" ? signal : undefined);
        if (signal === "SIGTERM") {
          mock.resolveExit();
        }
      },
    });

    const handler = createDefaultRunTurnHandler({
      processRunner: mock.runner,
      harnessRoot,
      now: () => FIXED_NOW,
      terminationGraceMs: 50,
    });

    const controller = new AbortController();
    const handlerPromise = handler({
      runId: "r_sigterm",
      epicId,
      config: createSampleConfig(projectDir),
      turn: 10,
      signal: controller.signal,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort("manual");

    await handlerPromise;

    expect(signals).toEqual(["SIGTERM"]);
  });
});

function createSampleConfig(workingDir: string): ContinuousRunConfig {
  return {
    workingDir,
    loopDelaySec: 0,
    model: "gpt-5-codex",
    reasoning: "high",
    approval: "never",
    sandbox: "danger-full-access",
    completion: {
      pattern: "STATUS: FEATURE_9_COMPLETE",
      scanTailLines: 10,
    },
    watch: {
      include: ["src/**"],
      exclude: ["node_modules/**"],
    },
    maxTurns: null,
    env: {},
  };
}

type MockProcessOptions = {
  stdoutChunks?: string[];
  stderrChunks?: string[];
  exitCode?: number;
  autoExit?: boolean;
  pid?: number;
  onKill?: (signal?: number | NodeJS.Signals) => void;
  resolveOnKill?: boolean;
};

type SpawnCall = {
  cmd: string[];
  options: {
    cwd: string;
    env: Record<string, string>;
  };
};

function createMockProcessRunner(options: MockProcessOptions = {}) {
  const stdoutChunks = options.stdoutChunks ?? [];
  const stderrChunks = options.stderrChunks ?? [];
  let configuredExitCode = options.exitCode ?? 0;
  const autoExit = options.autoExit ?? true;
  const pid = options.pid ?? 1337;
  const resolveOnKill = options.resolveOnKill ?? true;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let killed = false;
  const promptParts: string[] = [];
  const spawnCalls: SpawnCall[] = [];

  const exitDeferred = createDeferred<number>();

  function resolveExit(code: number = configuredExitCode) {
    configuredExitCode = code;
    if (!exitDeferred.settled) {
      exitDeferred.resolve(code);
    }
  }

  const runner: ProcessRunner = {
    spawn(cmd, spawnOptions) {
      spawnCalls.push({ cmd: [...cmd], options: { cwd: spawnOptions.cwd, env: { ...spawnOptions.env } } });

      const stdout = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of stdoutChunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      const stderr = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of stderrChunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      const stdin = new WritableStream<Uint8Array>({
        write(chunk) {
          promptParts.push(decoder.decode(chunk));
        },
      });

      if (autoExit) {
        queueMicrotask(resolveExit);
      }

      const spawned: SpawnedProcess = {
        stdin,
        stdout,
        stderr,
        exited: exitDeferred.promise,
        exitCode: autoExit ? configuredExitCode : null,
        pid,
        kill(signal) {
          killed = true;
          options.onKill?.(signal);
          if (resolveOnKill) {
            resolveExit();
          }
        },
      };

      return spawned;
    },
  };

  return {
    runner,
    getWrittenPrompt: () => promptParts.join(""),
    getCommands: () => spawnCalls.map((call) => call.cmd),
    getSpawnOptions: () => spawnCalls.map((call) => call.options),
    wasKilled: () => killed,
    resolveExit,
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
  settled: boolean;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  let settled = false;
  const promise = new Promise<T>((res, rej) => {
    resolve = (value: T) => {
      settled = true;
      res(value);
    };
    reject = (error: unknown) => {
      settled = true;
      rej(error);
    };
  });
  return {
    promise,
    resolve,
    reject,
  get settled() {
    return settled;
  },
} as Deferred<T>;
}

function telemetryJson(event: Record<string, unknown>): string {
  return JSON.stringify({
    __cody_event__: {
      ...event,
    },
  });
}
