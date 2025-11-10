import { describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { createBackgroundRunsService } from "../../src/runs/run-service";
import type { BackgroundRunWorkerOptions } from "../../src/runs/run-service";
import { createRunWorker } from "../../src/runs/run-worker";
import type {
  RunsRedis,
  RunControlEntry,
  RunIndexEntry,
  RunStreamEntry,
} from "../../src/runs/redis";
import type { RunTurnContext, RunTurnResult } from "../../src/runs/run-worker";
import type { RunControlMessage, RunEvent, ContinuousRunConfig } from "../../src/runs/types";

const FIXED_NOW = new Date("2025-10-27T16:00:00.000Z");

describe("background runs service", () => {
  test("startContinuousRun seeds metadata and invokes worker factory", async () => {
    const redis = createInMemoryRunsRedis();
    const worker = createFakeWorker();
    const workerFactory = mock(() => worker);

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => `r_${randomUUID()}`,
      now: () => FIXED_NOW,
      workerFactory,
    });

    const epicId = "current-epic";
    const config: ContinuousRunConfig = {
      workingDir: ".",
      loopDelaySec: 5,
      model: "gpt-5-codex",
      reasoning: "high",
      approval: "never",
      sandbox: "danger-full-access",
      completion: {
        pattern: "^STATUS: FEATURE_9_COMPLETE$",
        scanTailLines: 50,
      },
      watch: {
        include: ["src/**", "tests/**", ".cody-harness/**"],
        exclude: ["node_modules/**", ".git/**"],
      },
      maxTurns: null,
      env: {},
    };

    const startResult = await service.startContinuousRun({ epicId, config });

    expect(startResult.streamKey).toBe("$");
    expect(startResult.runId).toMatch(/^r_/);
    expect(startResult.meta).toEqual({
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId,
      streamKey: "$",
      config: JSON.stringify(config),
      model: config.model,
      reasoning: config.reasoning,
      approval: config.approval,
      sandbox: config.sandbox,
      loopDelaySec: String(config.loopDelaySec),
      maxTurns: "null",
      "completion.pattern": config.completion.pattern,
      "completion.scanTailLines": String(config.completion.scanTailLines),
      "completion.detected": "0",
      "completion.line": "",
    });

    const runId = startResult.runId;
    expect(workerFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        runId,
        config,
        epicId,
      }),
    );
    expect(worker.startCalls).toBe(1);

    const meta = await redis.getRunMeta(runId);
    expect(meta.status).toBe("queued");
    expect(meta.createdAt).toBe(FIXED_NOW.toISOString());
    expect(meta.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(meta.epicId).toBe(epicId);
    expect(meta.streamKey).toBe("$");
    expect(meta.config).toBe(JSON.stringify(config));
    expect(meta.model).toBe(config.model);
    expect(meta.reasoning).toBe(config.reasoning);
    expect(meta.approval).toBe(config.approval);
    expect(meta.sandbox).toBe(config.sandbox);
    expect(meta.loopDelaySec).toBe(String(config.loopDelaySec));
    expect(meta.maxTurns).toBe("null");
    expect(meta["completion.pattern"]).toBe(config.completion.pattern);
    expect(meta["completion.scanTailLines"]).toBe(String(config.completion.scanTailLines));
    expect(meta["completion.detected"]).toBe("0");
    expect(meta["completion.line"]).toBe("");

    const events = await redis.readRunEvents(runId, "0-0");
    expect(events).toEqual<RunStreamEntry[]>([]);
  });
  test("startContinuousRun resolves without waiting for worker start to finish", async () => {
    const redis = createInMemoryRunsRedis();
    const workerStartDeferred = createDeferred<void>();
    const worker = {
      startCalls: 0,
      start: mock(() => {
        worker.startCalls += 1;
        return workerStartDeferred.promise;
      }),
      shutdown: mock(async () => {}),
    };
    const workerFactory = mock(() => worker);

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => `r_${randomUUID()}`,
      now: () => FIXED_NOW,
      workerFactory,
    });

    const startPromise = service.startContinuousRun({
      epicId: "current-epic",
      config: createSampleConfig(),
    });

    const result = await withTimeout(startPromise, 50);

    expect(result.runId).toMatch(/^r_/);
    expect(worker.start).toHaveBeenCalledTimes(1);
    expect(worker.startCalls).toBe(1);
    expect(workerStartDeferred.settled).toBe(false);

    workerStartDeferred.resolve();
    await workerStartDeferred.promise;
  });
  test("service tracks active worker until completion", async () => {
    const redis = createInMemoryRunsRedis();
    const workerCompleteDeferred = createDeferred<void>();
    const worker = {
      startCalls: 0,
      start: mock(() => {
        worker.startCalls += 1;
        return workerCompleteDeferred.promise;
      }),
      shutdown: mock(async () => {}),
    };
    const workerFactory = mock(() => worker);

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => "r_registry",
      now: () => FIXED_NOW,
      workerFactory,
    }) as ReturnType<typeof createBackgroundRunsService> & {
      getActiveRunIds: () => string[];
    };

    const startResult = await withTimeout(
      service.startContinuousRun({
        epicId: "current-epic",
        config: createSampleConfig(),
      }),
      50,
    );

    expect(worker.start).toHaveBeenCalledTimes(1);
    expect(service.getActiveRunIds()).toEqual(["r_registry"]);

    workerCompleteDeferred.resolve();
    await workerCompleteDeferred.promise;

    await waitForCondition(() => service.getActiveRunIds().length === 0, 200);
  });
  test("shutdown cancels active workers and awaits completion", async () => {
    const redis = createInMemoryRunsRedis();
    const workerStartDeferred = createDeferred<void>();
    const workerShutdownDeferred = createDeferred<void>();
    const worker = {
      startCalls: 0,
      shutdownCalls: 0,
      start: mock(() => {
        worker.startCalls += 1;
        return workerStartDeferred.promise;
      }),
      shutdown: mock(() => {
        worker.shutdownCalls += 1;
        workerStartDeferred.resolve();
        return workerShutdownDeferred.promise;
      }),
    };
    const workerFactory = mock(() => worker);

    const service: any = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => "r_shutdown",
      now: () => FIXED_NOW,
      workerFactory,
    });

    await service.startContinuousRun({
      epicId: "current-epic",
      config: createSampleConfig(),
    });

    expect(worker.start).toHaveBeenCalledTimes(1);
    expect(service.getActiveRunIds()).toEqual(["r_shutdown"]);

    const shutdownPromise: Promise<void> = service.shutdown();

    expect(worker.shutdown).toHaveBeenCalledTimes(1);
    let settled = false;
    shutdownPromise.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    workerShutdownDeferred.resolve();
    await shutdownPromise;

    expect(worker.shutdownCalls).toBe(1);
    expect(service.getActiveRunIds()).toEqual([]);
  });
  test("startContinuousRun holds redis worker lock until completion", async () => {
    const redis = createInMemoryRunsRedis();
    const runId = "r_lock";
    const turnDeferred = createDeferred<void>();

    const workerFactory = (options: BackgroundRunWorkerOptions) =>
      createRunWorker({
        ...options,
        turnHandler: mock(async (context: RunTurnContext): Promise<RunTurnResult> => {
          await turnDeferred.promise;
          const ts = FIXED_NOW.toISOString();
          return {
            status: "success",
            events: [
              { type: "turn_started", ts, runId, turn: context.turn },
              { type: "turn_completed", ts, runId, turn: context.turn },
            ],
            shouldContinue: false,
          };
        }),
        now: () => FIXED_NOW,
      });

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => runId,
      now: () => FIXED_NOW,
      workerFactory,
    }) as ReturnType<typeof createBackgroundRunsService> & {
      getActiveRunIds(): string[];
    };

    await service.startContinuousRun({
      epicId: "current-epic",
      config: createSampleConfig(),
    });

    await waitForCondition(() => Boolean(redis.locks[runId]), 200);
    expect(redis.locks[runId]?.value).toBeDefined();

    turnDeferred.resolve();

    await waitForCondition(() => service.getActiveRunIds().length === 0, 200);
    expect(redis.locks[runId]).toBeUndefined();
  });
  test("getRun returns parsed metadata for an existing run", async () => {
    const redis = createInMemoryRunsRedis();
    const worker = createFakeWorker();
    const workerFactory = mock(() => worker);

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => "r_get",
      now: () => FIXED_NOW,
      workerFactory,
    });

    const epicId = "current-epic";
    const config = createSampleConfig();
    await service.startContinuousRun({ epicId, config });

    const snapshot = await service.getRun("r_get");
    expect(snapshot).toMatchObject({
      runId: "r_get",
      status: "queued",
      createdAt: FIXED_NOW.toISOString(),
      updatedAt: FIXED_NOW.toISOString(),
      epicId,
      streamKey: "$",
      config,
      completion: {
        detected: false,
        line: "",
      },
    });
  });

  test("getRun includes runtime stats, completion metadata, and pid when available", async () => {
    const redis = createInMemoryRunsRedis();
    const worker = createFakeWorker();
    const workerFactory = mock(() => worker);

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => "r_meta",
      now: () => FIXED_NOW,
      workerFactory,
    });

    const epicId = "current-epic";
    const config = createSampleConfig();
    await service.startContinuousRun({ epicId, config });

    await redis.setRunMeta("r_meta", {
      pid: 43210,
      currentTurn: 3,
      "stats.turns": 3,
      "stats.tokens": 456,
      "completion.detected": "1",
      "completion.line": "STATUS: FEATURE_9_COMPLETE",
      "error.code": "execution_error",
      "error.message": "turn failed",
      "error.retryable": true,
    });

    const snapshot = await service.getRun("r_meta");
    expect(snapshot?.pid).toBe(43210);
    expect(snapshot?.currentTurn).toBe(3);
    expect(snapshot?.stats).toEqual({ turns: 3, tokens: 456 });
    expect(snapshot?.completion).toEqual({
      detected: true,
      line: "STATUS: FEATURE_9_COMPLETE",
    });
    expect(snapshot?.error).toEqual({
      code: "execution_error",
      message: "turn failed",
      retryable: true,
    });
  });

  test("listRuns returns runs ordered by createdAt descending", async () => {
    const redis = createInMemoryRunsRedis();
    const worker = createFakeWorker();
    const workerFactory = mock(() => worker);
    let counter = 0;

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => `r_${counter++}`,
      now: () => new Date(FIXED_NOW.getTime() + counter * 1000),
      workerFactory,
    });

    await service.startContinuousRun({ epicId: "alpha", config: createSampleConfig() });
    await service.startContinuousRun({ epicId: "beta", config: createSampleConfig() });

    const list = await service.listRuns({ limit: 10 });
    expect(list).toEqual([
      {
        runId: "r_1",
        status: "queued",
        epicId: "beta",
        createdAt: new Date(FIXED_NOW.getTime() + 2000).toISOString(),
        updatedAt: new Date(FIXED_NOW.getTime() + 2000).toISOString(),
        completion: {
          detected: false,
          line: "",
        },
      },
      {
        runId: "r_0",
        status: "queued",
        epicId: "alpha",
        createdAt: new Date(FIXED_NOW.getTime() + 1000).toISOString(),
        updatedAt: new Date(FIXED_NOW.getTime() + 1000).toISOString(),
        completion: {
          detected: false,
          line: "",
        },
      },
    ]);
  });

  test("listRuns includes runtime stats when available", async () => {
    const redis = createInMemoryRunsRedis();
    const worker = createFakeWorker();
    const workerFactory = mock(() => worker);

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => "r_summary",
      now: () => FIXED_NOW,
      workerFactory,
    });

    await service.startContinuousRun({ epicId: "alpha", config: createSampleConfig() });

    await redis.setRunMeta("r_summary", {
      currentTurn: 5,
      "stats.turns": 5,
      "stats.tokens": 812,
    });

    const [first] = await service.listRuns({ limit: 5 });
    expect(first?.currentTurn).toBe(5);
    expect(first?.stats).toEqual({ turns: 5, tokens: 812 });
  });

  test("listRuns includes pid and completion metadata when available", async () => {
    const redis = createInMemoryRunsRedis();
    const worker = createFakeWorker();
    const workerFactory = mock(() => worker);

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => "r_summary",
      now: () => FIXED_NOW,
      workerFactory,
    });

    await service.startContinuousRun({ epicId: "alpha", config: createSampleConfig() });

    await redis.setRunMeta("r_summary", {
      pid: 3210,
      "completion.detected": "1",
      "completion.line": "STATUS: FEATURE_10_COMPLETE",
      "error.code": "spawn_failure",
      "error.message": "failed to spawn process",
      "error.retryable": false,
    });

    const [first] = await service.listRuns({ limit: 5 });
    expect(first?.pid).toBe(3210);
    expect(first?.completion).toEqual({
      detected: true,
      line: "STATUS: FEATURE_10_COMPLETE",
    });
    expect(first?.error).toEqual({
      code: "spawn_failure",
      message: "failed to spawn process",
      retryable: false,
    });
  });

  test("control requests enqueue control messages and return updated status", async () => {
    const redis = createInMemoryRunsRedis();
    const worker = createFakeWorker();
    const workerFactory = mock(() => worker);

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => "r_control",
      now: () => FIXED_NOW,
      workerFactory,
    });

    await service.startContinuousRun({ epicId: "current-epic", config: createSampleConfig() });

    const pause = await service.requestPause("r_control");
    expect(pause).toEqual({ runId: "r_control", status: "pausing" });
    expect(redis.control["r_control"]).toHaveLength(1);
    expect(redis.control["r_control"]?.[0].message.type).toBe("pause");

    const resume = await service.requestResume("r_control");
    expect(resume).toEqual({ runId: "r_control", status: "running" });
    expect(redis.control["r_control"]).toHaveLength(2);
    expect(redis.control["r_control"]?.[1].message.type).toBe("resume");

    const cancel = await service.requestCancel("r_control");
    expect(cancel).toEqual({ runId: "r_control", status: "cancelling" });
    expect(redis.control["r_control"]).toHaveLength(3);
    expect(redis.control["r_control"]?.[2].message.type).toBe("cancel");
  });

  test("streamRunEvents yields events and ends when run reaches terminal state", async () => {
    const redis = createInMemoryRunsRedis();
    const worker = createFakeWorker();
    const workerFactory = mock(() => worker);
    const runId = "r_stream";

    const service = createBackgroundRunsService({
      runsRedis: redis,
      generateRunId: () => runId,
      now: () => FIXED_NOW,
      workerFactory,
    });

    await service.startContinuousRun({ epicId: "current-epic", config: createSampleConfig() });

    const collectedPromise = (async () => {
      const events: RunEvent[] = [];
      for await (const entry of service.streamRunEvents(runId, { from: "0-0", blockMs: 5 })) {
        events.push(entry.event);
      }
      return events;
    })();

    const runEvents: RunEvent[] = [
      {
        type: "run_started",
        ts: new Date(FIXED_NOW.getTime() + 1).toISOString(),
        runId,
      },
      {
        type: "turn_completed",
        ts: new Date(FIXED_NOW.getTime() + 2).toISOString(),
        runId,
        turn: 1,
      },
      {
        type: "run_completed",
        ts: new Date(FIXED_NOW.getTime() + 3).toISOString(),
        runId,
      },
    ];

    for (const event of runEvents) {
      await redis.appendRunEvent(runId, event);
    }

    const collected = await withTimeout(collectedPromise, 200);
    expect(collected.map((event) => event.type)).toEqual(runEvents.map((event) => event.type));
  });
});

function createInMemoryRunsRedis(): RunsRedis & {
  events: Record<string, RunStreamEntry[]>;
  meta: Record<string, Record<string, string>>;
  control: Record<string, RunControlEntry[]>;
  locks: Record<string, { value: string; expiresAt: number }>;
  index: RunIndexEntry[];
} {
  const stores: {
    events: Record<string, RunStreamEntry[]>;
    meta: Record<string, Record<string, string>>;
    control: Record<string, RunControlEntry[]>;
    locks: Record<string, { value: string; expiresAt: number }>;
    index: RunIndexEntry[];
  } = {
    events: {},
    meta: {},
    control: {},
    locks: {},
    index: [],
  };

  function cleanupLock(runId: string): void {
    const entry = stores.locks[runId];
    if (entry && entry.expiresAt <= Date.now()) {
      delete stores.locks[runId];
    }
  }

  return {
    client: undefined as never,
    events: stores.events,
    meta: stores.meta,
    control: stores.control,
    locks: stores.locks,
    index: stores.index,
    async appendRunEvent(runId: string, event: RunEvent): Promise<string> {
      const entryId = `${Date.now()}-0`;
      const entries = stores.events[runId] ?? [];
      entries.push({ id: entryId, event });
      stores.events[runId] = entries;
      return entryId;
    },
    async readRunEvents(runId: string): Promise<RunStreamEntry[]> {
      return stores.events[runId] ?? [];
    },
    async setRunMeta(runId: string, values: Record<string, string | number | boolean | null | undefined>): Promise<void> {
      const existing = stores.meta[runId] ?? {};
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) {
          continue;
        }
        existing[key] = value === null ? "null" : String(value);
      }
      stores.meta[runId] = existing;
    },
    async getRunMeta(runId: string): Promise<Record<string, string>> {
      return stores.meta[runId] ?? {};
    },
    async deleteRunData(runId: string): Promise<void> {
      delete stores.events[runId];
      delete stores.meta[runId];
      delete stores.control[runId];
      delete stores.locks[runId];
      stores.index = stores.index.filter((entry) => entry.runId !== runId);
    },
    async appendRunControlMessage(runId: string, message: RunControlMessage): Promise<string> {
      const entryId = `${Date.now()}-0`;
      const entries = stores.control[runId] ?? [];
      const entry: RunControlEntry = { id: entryId, message };
      entries.push(entry);
      stores.control[runId] = entries;
      return entryId;
    },
    async readRunControlMessages(runId: string): Promise<RunControlEntry[]> {
      return stores.control[runId] ?? [];
    },
    async acquireRunLock(runId: string, workerId: string, ttlMs: number): Promise<boolean> {
      cleanupLock(runId);
      if (stores.locks[runId]) {
        return false;
      }
      stores.locks[runId] = { value: workerId, expiresAt: Date.now() + ttlMs };
      return true;
    },
    async refreshRunLock(runId: string, workerId: string, ttlMs: number): Promise<boolean> {
      cleanupLock(runId);
      const entry = stores.locks[runId];
      if (!entry || entry.value !== workerId) {
        return false;
      }
      stores.locks[runId] = { value: workerId, expiresAt: Date.now() + ttlMs };
      return true;
    },
    async releaseRunLock(runId: string, workerId: string): Promise<void> {
      const entry = stores.locks[runId];
      if (entry && entry.value === workerId) {
        delete stores.locks[runId];
      }
    },
    async addRunToIndex(runId: string, score: number): Promise<void> {
      stores.index = stores.index.filter((entry) => entry.runId !== runId);
      stores.index.push({ runId, score });
      stores.index.sort((a, b) => b.score - a.score);
    },
    async listRunsFromIndex(limit: number): Promise<RunIndexEntry[]> {
      return stores.index.slice(0, limit);
    },
    async close(): Promise<void> {
      // no-op
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

async function waitForCondition(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

function createDeferred<T>() {
  let resolveFn!: (value: T | PromiseLike<T>) => void;
  let rejectFn!: (reason?: unknown) => void;
  let resolved = false;
  let rejected = false;

  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = (value) => {
      resolved = true;
      resolve(value);
    };
    rejectFn = (reason) => {
      rejected = true;
      reject(reason);
    };
  });

  return {
    promise,
    resolve(value?: T) {
      resolveFn(value as T);
    },
    reject(reason?: unknown) {
      rejectFn(reason);
    },
    get settled() {
      return resolved || rejected;
    },
  };
}

function createFakeWorker() {
  return {
    startCalls: 0,
    shutdownCalls: 0,
    async start() {
      this.startCalls += 1;
    },
    async shutdown() {
      this.shutdownCalls += 1;
    },
  };
}

function createSampleConfig(): ContinuousRunConfig {
  return {
    workingDir: ".",
    loopDelaySec: 5,
    model: "gpt-5-codex",
    reasoning: "high",
    approval: "never",
    sandbox: "danger-full-access",
    completion: {
      pattern: "^STATUS: FEATURE_9_COMPLETE$",
      scanTailLines: 50,
    },
    watch: {
      include: ["src/**", "tests/**", ".cody-harness/**"],
      exclude: ["node_modules/**", ".git/**"],
    },
    maxTurns: null,
    env: {},
  };
}
