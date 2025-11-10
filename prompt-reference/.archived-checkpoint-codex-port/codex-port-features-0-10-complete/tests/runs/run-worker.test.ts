import { describe, expect, mock, test } from "bun:test";
import { appendFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRunWorker, type RunTurnContext, type RunTurnResult } from "../../src/runs/run-worker";
import {
  createDefaultRunTurnHandler,
  type ProcessRunner,
  type SpawnedProcess,
} from "../../src/runs/turn-handler";
import type {
  RunsRedis,
  RunControlEntry,
  RunIndexEntry,
  RunStreamEntry,
} from "../../src/runs/redis";
import type { ContinuousRunConfig, RunControlMessage, RunEvent } from "../../src/runs/types";

const FIXED_NOW = new Date("2025-10-27T17:00:00.000Z");

describe("run worker", () => {
  test("completes a single turn and emits completion events", async () => {
    const runId = `r_${randomUUID()}`;
    const runsRedis = createInMemoryRunsRedis();
    await runsRedis.setRunMeta(runId, {
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId: "current-epic",
      streamKey: "$",
      config: JSON.stringify(createSampleConfig()),
    });

    const turnHandler = mock(async ({ turn }: RunTurnContext): Promise<RunTurnResult> => {
      expect(turn).toBe(1);
      return {
        status: "success",
        events: [
          createEvent(runId, "turn_started", { turn }),
          createEvent(runId, "turn_completed", { turn }),
        ],
        shouldContinue: false,
      };
    });

    const worker = createRunWorker({
      runId,
      epicId: "current-epic",
      config: createSampleConfig(),
      runsRedis,
      now: () => FIXED_NOW,
      turnHandler,
    });

    await worker.start();

    expect(turnHandler).toHaveBeenCalledTimes(1);

    const events = await runsRedis.readRunEvents(runId, "0-0");
    const eventTypes = events.map((entry) => entry.event.type);
    expect(eventTypes).toEqual(["run_started", "turn_started", "turn_completed", "run_completed"]);

    const meta = await runsRedis.getRunMeta(runId);
    expect(meta.status).toBe("completed");
    expect(meta.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(meta.currentTurn).toBe("1");
  });

  test("records pid and token usage stats in metadata", async () => {
    const runId = `r_${randomUUID()}`;
    const runsRedis = createInMemoryRunsRedis();
    await runsRedis.setRunMeta(runId, {
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId: "current-epic",
      streamKey: "$",
      config: JSON.stringify(createSampleConfig()),
    });

    const turnHandler = mock(async (context: RunTurnContext): Promise<RunTurnResult> => {
      context.onPid?.(43210);
      return {
        status: "success",
        events: [
          createEvent(runId, "turn_started", { turn: context.turn }),
          createEvent(runId, "turn_completed", {
            turn: context.turn,
            tokenUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
          }),
        ],
        shouldContinue: false,
        tokenUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      };
    });

    const worker = createRunWorker({
      runId,
      epicId: "current-epic",
      config: createSampleConfig(),
      runsRedis,
      now: () => FIXED_NOW,
      turnHandler,
    });

    await worker.start();

    const meta = await runsRedis.getRunMeta(runId);
    expect(meta.pid).toBe("43210");
    expect(meta["stats.turns"]).toBe("1");
    expect(meta["stats.tokens"]).toBe("120");
  });

  test("accumulates token usage from telemetry events when turn handler omits tokenUsage field", async () => {
    const runId = `r_${randomUUID()}`;
    const runsRedis = createInMemoryRunsRedis();
    await runsRedis.setRunMeta(runId, {
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId: "current-epic",
      streamKey: "$",
      config: JSON.stringify(createSampleConfig()),
    });

    const turnHandler = mock(async (context: RunTurnContext): Promise<RunTurnResult> => {
      return {
        status: "success",
        events: [
          createEvent(runId, "turn_started", { turn: context.turn }),
          {
            type: "token_usage",
            ts: FIXED_NOW.toISOString(),
            runId,
            inputTokens: 111,
            outputTokens: 9,
            totalTokens: 120,
          },
          createEvent(runId, "turn_completed", { turn: context.turn }),
        ],
        shouldContinue: false,
      };
    });

    const worker = createRunWorker({
      runId,
      epicId: "current-epic",
      config: createSampleConfig(),
      runsRedis,
      now: () => FIXED_NOW,
      turnHandler,
    });

    await worker.start();

    const meta = await runsRedis.getRunMeta(runId);
    expect(meta["stats.tokens"]).toBe("120");
  });

  test("persists structured error metadata when a turn fails", async () => {
    const runId = `r_${randomUUID()}`;
    const runsRedis = createInMemoryRunsRedis();
    await runsRedis.setRunMeta(runId, {
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId: "current-epic",
      streamKey: "$",
      config: JSON.stringify(createSampleConfig()),
    });

    const turnHandler = mock(async (context: RunTurnContext): Promise<RunTurnResult> => {
      return {
        status: "failure",
        events: [
          createEvent(runId, "turn_started", { turn: context.turn }),
          createEvent(runId, "turn_failed", { turn: context.turn }),
        ],
        error: {
          code: "turn_failure",
          message: "turn failed for testing",
          retryable: true,
        },
      };
    });

    const worker = createRunWorker({
      runId,
      epicId: "current-epic",
      config: createSampleConfig(),
      runsRedis,
      now: () => FIXED_NOW,
      turnHandler,
    });

    await worker.start();

    const meta = await runsRedis.getRunMeta(runId);
    expect(meta.status).toBe("failed");
    expect(meta["error.code"]).toBe("turn_failure");
    expect(meta["error.message"]).toBe("turn failed for testing");
    expect(meta["error.retryable"]).toBe("true");
  });

  test("acquires and releases redis worker lock during lifecycle", async () => {
    const runId = `r_${randomUUID()}`;
    const runsRedis = createInMemoryRunsRedis();
    await runsRedis.setRunMeta(runId, {
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId: "current-epic",
      streamKey: "$",
      config: JSON.stringify(createSampleConfig()),
    });

    const turnDeferred = createDeferred<void>();

    const turnHandler = mock(async (context: RunTurnContext): Promise<RunTurnResult> => {
      await turnDeferred.promise;
      return {
        status: "success",
        events: [
          createEvent(runId, "turn_started", { turn: context.turn }),
          createEvent(runId, "turn_completed", { turn: context.turn }),
        ],
        shouldContinue: false,
      };
    });

    const worker = createRunWorker({
      runId,
      epicId: "current-epic",
      config: createSampleConfig(),
      runsRedis,
      now: () => FIXED_NOW,
      turnHandler,
    });

    const startPromise = worker.start();

    await waitFor(() => runsRedis.locks[runId] !== undefined);
    expect(runsRedis.locks[runId]?.value).toBeDefined();

    turnDeferred.resolve();
    await startPromise;

    expect(runsRedis.locks[runId]).toBeUndefined();
  });

  test("fails to start when redis worker lock is already held", async () => {
    const runId = `r_${randomUUID()}`;
    const runsRedis = createInMemoryRunsRedis();
    await runsRedis.setRunMeta(runId, {
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId: "current-epic",
      streamKey: "$",
      config: JSON.stringify(createSampleConfig()),
    });

    const acquired = await runsRedis.acquireRunLock(runId, "existing-worker", 60_000);
    expect(acquired).toBe(true);

    const worker = createRunWorker({
      runId,
      epicId: "current-epic",
      config: createSampleConfig(),
      runsRedis,
      now: () => FIXED_NOW,
      turnHandler: mock(async (): Promise<RunTurnResult> => {
        throw new Error("should not execute turn handler when lock held");
      }),
    });

    await expect(worker.start()).rejects.toThrow(/lock/i);
    expect(runsRedis.locks[runId]?.value).toBe("existing-worker");
  });

  test("cancels after control message and emits run_cancelled", async () => {
    const runId = `r_${randomUUID()}`;
    const runsRedis = createInMemoryRunsRedis();
    await runsRedis.setRunMeta(runId, {
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId: "current-epic",
      streamKey: "$",
      config: JSON.stringify(createSampleConfig()),
    });

    const firstTurnDeferred = createDeferred<RunTurnResult>();

    const turnHandler = mock(async ({ turn }: RunTurnContext): Promise<RunTurnResult> => {
      if (turn === 1) {
        return firstTurnDeferred.promise;
      }

      return {
        status: "success",
        events: [
          createEvent(runId, "turn_started", { turn }),
          createEvent(runId, "turn_completed", { turn }),
        ],
        shouldContinue: false,
      };
    });

    const worker = createRunWorker({
      runId,
      epicId: "current-epic",
      config: createSampleConfig(),
      runsRedis,
      now: () => FIXED_NOW,
      turnHandler,
      controlPollIntervalMs: 5,
    });

    const workerPromise = worker.start();

    await waitFor(() => turnHandler.mock.calls.length === 1);

    firstTurnDeferred.resolve({
      status: "success",
      events: [
        createEvent(runId, "turn_started", { turn: 1 }),
        createEvent(runId, "turn_completed", { turn: 1 }),
      ],
      shouldContinue: true,
    });

    await runsRedis.appendRunControlMessage(runId, {
      type: "cancel",
      ts: new Date(FIXED_NOW.getTime() + 1).toISOString(),
      runId,
      reason: "manual",
    });

    await workerPromise;

    const events = await runsRedis.readRunEvents(runId, "0-0");
    const eventTypes = events.map((entry) => entry.event.type);
    expect(eventTypes).toContain("run_cancelled");
    expect(events[events.length - 1]?.event.type).toBe("run_cancelled");

    const meta = await runsRedis.getRunMeta(runId);
    expect(meta.status).toBe("cancelled");
    expect(meta.updatedAt).toBe(FIXED_NOW.toISOString());
  });

  test("pauses after control message and resumes with subsequent turn", async () => {
    const runId = `r_${randomUUID()}`;
    const runsRedis = createInMemoryRunsRedis();
    await runsRedis.setRunMeta(runId, {
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId: "current-epic",
      streamKey: "$",
      config: JSON.stringify(createSampleConfig()),
    });

    const firstTurnDeferred = createDeferred<RunTurnResult>();
    const turnHandler = mock(async ({ turn }: RunTurnContext): Promise<RunTurnResult> => {
      if (turn === 1) {
        return firstTurnDeferred.promise;
      }

      expect(turn).toBe(2);
      return {
        status: "success",
        events: [
          createEvent(runId, "turn_started", { turn }),
          createEvent(runId, "turn_completed", { turn }),
        ],
        shouldContinue: false,
      };
    });

    const worker = createRunWorker({
      runId,
      epicId: "current-epic",
      config: createSampleConfig(),
      runsRedis,
      now: () => FIXED_NOW,
      turnHandler,
      controlPollIntervalMs: 5,
    });

    const workerPromise = worker.start();

    await waitFor(() => turnHandler.mock.calls.length === 1);

    await runsRedis.appendRunControlMessage(runId, {
      type: "pause",
      ts: new Date(FIXED_NOW.getTime() + 1).toISOString(),
      runId,
      reason: "manual",
    });

    firstTurnDeferred.resolve({
      status: "success",
      events: [
        createEvent(runId, "turn_started", { turn: 1 }),
        createEvent(runId, "turn_completed", { turn: 1 }),
      ],
      shouldContinue: true,
    });

    await waitFor(async () => {
      const events = await runsRedis.readRunEvents(runId, "0-0");
      return events.some((entry) => entry.event.type === "run_paused");
    });

    await waitFor(async () => {
      const meta = await runsRedis.getRunMeta(runId);
      return meta.status === "paused";
    });

    await runsRedis.appendRunControlMessage(runId, {
      type: "resume",
      ts: new Date(FIXED_NOW.getTime() + 2).toISOString(),
      runId,
    });

    await waitFor(async () => {
      const events = await runsRedis.readRunEvents(runId, "0-0");
      return events.some((entry) => entry.event.type === "run_resumed");
    });

    await workerPromise;

    expect(turnHandler.mock.calls.length).toBe(2);

    const events = await runsRedis.readRunEvents(runId, "0-0");
    const eventTypes = events.map((entry) => entry.event.type);
    expect(eventTypes).toEqual([
      "run_started",
      "turn_started",
      "turn_completed",
      "run_updated",
      "run_paused",
      "run_resumed",
      "turn_started",
      "turn_completed",
      "run_completed",
    ]);

    const finalMeta = await runsRedis.getRunMeta(runId);
    expect(finalMeta.status).toBe("completed");
  });

  test("persists telemetry events emitted by the default turn handler", async () => {
    const runId = `r_${randomUUID()}`;
    const runsRedis = createInMemoryRunsRedis();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "worker-telemetry-"));
    try {
      const projectDir = join(workspaceRoot, "workspace");
      const harnessRoot = join(workspaceRoot, ".cody-harness");
      const epicId = "current-epic";
      await mkdir(projectDir, { recursive: true });
      await mkdir(join(harnessRoot, epicId), { recursive: true });

      const codysLogPath = join(harnessRoot, epicId, "codys-log.md");
      const decisionLogPath = join(harnessRoot, "decision-log.md");
      await writeFile(
        codysLogPath,
        "Initial entry\nSTATUS: FEATURE_9_COMPLETE\n",
        "utf8",
      );
      await writeFile(decisionLogPath, "Initial decision entry\n", "utf8");

      const config = createSampleConfig(projectDir);
      await runsRedis.setRunMeta(runId, {
        status: "queued",
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString(),
        epicId,
        streamKey: "$",
        config: JSON.stringify(config),
      });

      const telemetryLines = [
        telemetryJson({ type: "file_written", path: "src/app.ts", bytes: 128 }),
        telemetryJson({ type: "test_run_started", command: "bun test" }),
        telemetryJson({
          type: "test_run_completed",
          command: "bun test",
          exitCode: 0,
          summary: { passed: 3, failed: 0, skipped: 0 },
        }),
      ];

      const processMock = createTelemetryProcessRunner({
        stdoutChunks: ["regular output\n", `${telemetryLines.join("\n")}\n`],
        exitCode: 0,
        autoExit: false,
        pid: 42424,
      });

      const turnHandler = createDefaultRunTurnHandler({
        processRunner: processMock.runner,
        harnessRoot,
        promptOutputDir: join(workspaceRoot, "tmp-prompts"),
        now: () => FIXED_NOW,
      });

      const worker = createRunWorker({
        runId,
        epicId,
        config,
        runsRedis,
        now: () => FIXED_NOW,
        turnHandler,
      });

      const workerPromise = worker.start();

      await waitFor(() => processMock.getWrittenPrompt().length > 0);
      await appendFile(codysLogPath, "New session note\n", "utf8");
      await appendFile(decisionLogPath, "Decision updated\n", "utf8");
      processMock.resolveExit();

      await workerPromise;

      const events = await runsRedis.readRunEvents(runId, "0-0");
      const eventsByType = events.reduce<Record<string, RunEvent[]>>((acc, entry) => {
        (acc[entry.event.type] ??= []).push(entry.event);
        return acc;
      }, {});

      expect(eventsByType["file_written"]).toBeDefined();
      expect(eventsByType["test_run_started"]).toBeDefined();
      expect(eventsByType["test_run_completed"]).toBeDefined();
      const logUpdates = eventsByType["log_updated"] ?? [];
      expect(logUpdates.length).toBeGreaterThan(0);
      expect(eventsByType["file_written"]?.[0]).toMatchObject({
        type: "file_written",
        path: "src/app.ts",
        bytes: 128,
      });
      expect(eventsByType["test_run_completed"]?.[0]).toMatchObject({
        type: "test_run_completed",
        command: "bun test",
        exitCode: 0,
      });

      const meta = await runsRedis.getRunMeta(runId);
      expect(meta.pid).toBe("42424");
      expect(meta["stats.turns"]).toBe("1");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

});

function createSampleConfig(workingDir = "."): ContinuousRunConfig {
  return {
    workingDir,
    loopDelaySec: 0,
    model: "gpt-5-codex",
    reasoning: "high",
    approval: "never",
    sandbox: "danger-full-access",
    completion: {
      pattern: "^STATUS: FEATURE_9_COMPLETE$",
      scanTailLines: 50,
    },
    watch: {
      include: ["src/**"],
      exclude: ["node_modules/**"],
    },
    maxTurns: null,
    env: {},
  };
}

function createTelemetryProcessRunner(options: {
  stdoutChunks?: string[];
  stderrChunks?: string[];
  exitCode?: number;
  autoExit?: boolean;
  pid?: number;
}) {
  const stdoutChunks = options.stdoutChunks ?? [];
  const stderrChunks = options.stderrChunks ?? [];
  const exitCode = options.exitCode ?? 0;
  const autoExit = options.autoExit ?? true;
  const pid = options.pid ?? 1337;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const promptParts: string[] = [];

  const exitDeferred = createDeferred<number>();
  let exitResolved = false;
  let killed = false;

  const resolveExit = () => {
    if (exitResolved) {
      return;
    }
    exitResolved = true;
    exitDeferred.resolve(exitCode);
  };

  if (autoExit) {
    queueMicrotask(resolveExit);
  }

  const runner: ProcessRunner = {
    spawn() {
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

      const spawned: SpawnedProcess = {
        stdin,
        stdout,
        stderr,
        exited: exitDeferred.promise,
        exitCode,
        pid,
        kill() {
          killed = true;
          resolveExit();
        },
      };

      return spawned;
    },
  };

  return {
    runner,
    resolveExit,
    wasKilled: () => killed,
    getWrittenPrompt: () => promptParts.join(""),
  };
}

function createEvent<T extends Record<string, unknown>>(
  runId: string,
  type: string,
  payload?: T,
): RunEvent {
  return {
    type,
    ts: FIXED_NOW.toISOString(),
    runId,
    ...(payload ?? {}),
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function telemetryJson(event: Record<string, unknown>): string {
  return JSON.stringify({
    __cody_event__: {
      ...event,
    },
  });
}

async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 500,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = check();
    let resolved: boolean;
    if (result && typeof (result as Promise<boolean>).then === "function") {
      resolved = await (result as Promise<boolean>);
    } else {
      resolved = Boolean(result);
    }
    if (resolved) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("Condition not satisfied within timeout");
}

function createInMemoryRunsRedis(): RunsRedis & {
  events: Record<string, RunStreamEntry[]>;
  control: Record<string, RunControlEntry[]>;
  meta: Record<string, Record<string, string>>;
  locks: Record<string, { value: string; expiresAt: number }>;
  index: RunIndexEntry[];
} {
  let seq = 0;
  const store = {
    events: new Map<string, RunStreamEntry[]>(),
    control: new Map<string, RunControlEntry[]>(),
    meta: new Map<string, Record<string, string>>(),
    locks: new Map<string, { value: string; expiresAt: number }>(),
    index: [] as RunIndexEntry[],
  };
  const locksRecord: Record<string, { value: string; expiresAt: number }> = Object.create(null);

  function nextId(): string {
    seq += 1;
    return `${seq}-0`;
  }

  function parseId(id: string): number {
    const [major] = id.split("-");
    const parsed = Number.parseInt(major, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function cleanupLock(runId: string): void {
    const entry = store.locks.get(runId);
    if (entry && entry.expiresAt <= Date.now()) {
      store.locks.delete(runId);
      delete locksRecord[runId];
    }
  }

  return {
    client: undefined as never,
    events: Object.create(null),
    control: Object.create(null),
    meta: Object.create(null),
    locks: locksRecord,
    index: store.index,
    async appendRunEvent(runId, event) {
      const id = nextId();
      const entries = store.events.get(runId) ?? [];
      entries.push({ id, event });
      store.events.set(runId, entries);
      (this.events[runId] ??= []).push({ id, event });
      return id;
    },
    async readRunEvents(runId, lastId) {
      const entries = store.events.get(runId) ?? [];
      const lastSeq = parseId(lastId);
      return entries.filter((entry) => parseId(entry.id) > lastSeq);
    },
    async setRunMeta(runId, values) {
      const meta = store.meta.get(runId) ?? {};
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) {
          continue;
        }
        meta[key] = value === null ? "null" : String(value);
      }
      store.meta.set(runId, meta);
      this.meta[runId] = meta;
    },
    async getRunMeta(runId) {
      return store.meta.get(runId) ?? {};
    },
    async appendRunControlMessage(runId, message) {
      const id = nextId();
      const entries = store.control.get(runId) ?? [];
      const entry: RunControlEntry = { id, message };
      entries.push(entry);
      store.control.set(runId, entries);
      (this.control[runId] ??= []).push(entry);
      return id;
    },
    async readRunControlMessages(runId, lastId) {
      const entries = store.control.get(runId) ?? [];
      const lastSeq = parseId(lastId);
      return entries.filter((entry) => parseId(entry.id) > lastSeq);
    },
    async acquireRunLock(runId, workerId, ttlMs) {
      cleanupLock(runId);
      if (store.locks.has(runId)) {
        return false;
      }
      const entry = { value: workerId, expiresAt: Date.now() + ttlMs };
      store.locks.set(runId, entry);
      locksRecord[runId] = entry;
      return true;
    },
    async refreshRunLock(runId, workerId, ttlMs) {
      cleanupLock(runId);
      const entry = store.locks.get(runId);
      if (!entry || entry.value !== workerId) {
        return false;
      }
      const refreshed = { value: workerId, expiresAt: Date.now() + ttlMs };
      store.locks.set(runId, refreshed);
      locksRecord[runId] = refreshed;
      return true;
    },
    async releaseRunLock(runId, workerId) {
      const entry = store.locks.get(runId);
      if (entry && entry.value === workerId) {
        store.locks.delete(runId);
        delete locksRecord[runId];
      }
    },
    async addRunToIndex(runId, score) {
      store.index = store.index.filter((entry) => entry.runId !== runId);
      store.index.push({ runId, score });
      store.index.sort((a, b) => b.score - a.score);
      this.index = store.index;
    },
    async listRunsFromIndex(limit) {
      return store.index.slice(0, limit);
    },
    async getRunEventsInfo(runId) {
      const entries = store.events.get(runId) ?? [];
      return {
        length: entries.length,
        firstEntryId: entries[0]?.id ?? null,
        lastEntryId: entries.length > 0 ? entries[entries.length - 1]?.id ?? null : null,
      };
    },
    async deleteRunData(runId) {
      store.events.delete(runId);
      store.control.delete(runId);
      store.meta.delete(runId);
      store.locks.delete(runId);
      delete locksRecord[runId];
      store.index = store.index.filter((entry) => entry.runId !== runId);
    },
    async close() {
      // no-op
    },
  };
}
