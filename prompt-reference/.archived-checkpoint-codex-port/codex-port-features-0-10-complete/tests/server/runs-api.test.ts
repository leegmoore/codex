import { afterEach, describe, expect, mock, test } from "bun:test";
import type { FastifyInstance } from "fastify";

import { createServer, type CreateServerOptions } from "../../src/server";
import { createBackgroundRunsService, type BackgroundRunWorkerOptions } from "../../src/runs/run-service";
import type {
  RunsRedis,
  RunControlEntry,
  RunIndexEntry,
  RunStreamEntry,
} from "../../src/runs/redis";
import type { ContinuousRunConfig, RunEvent, RunSnapshot, RunSummary } from "../../src/runs/types";

const FIXED_NOW = new Date("2025-10-27T16:00:00.000Z");

describe("continuous run API", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  test("POST /api/runs/continuous returns 202 without waiting for worker completion", async () => {
    const runsRedis = createInMemoryRunsRedis();
    const workerDeferred = createDeferred<void>();

    const workerFactory = mock((options: BackgroundRunWorkerOptions) => {
      return {
        start: mock(async () => {
          await workerDeferred.promise;
          const completionTs = new Date(FIXED_NOW.getTime() + 1000).toISOString();
          await options.runsRedis.setRunMeta(options.runId, {
            status: "completed",
            updatedAt: completionTs,
          });
          await options.runsRedis.appendRunEvent(options.runId, {
            type: "run_completed",
            ts: completionTs,
            runId: options.runId,
          });
        }),
        shutdown: mock(async () => {
          workerDeferred.resolve();
        }),
      };
    });

    const runsService = createBackgroundRunsService({
      runsRedis,
      generateRunId: () => "r_async",
      now: () => FIXED_NOW,
      workerFactory,
    });

    app = await createServer({
      logger: false,
      runsService,
    });

    const payload = {
      epicId: "current-epic",
      config: {
        workingDir: ".",
        loopDelaySec: 0,
        model: "gpt-5-codex",
        reasoning: "high",
        approval: "never",
        sandbox: "danger-full-access",
        completion: {
          pattern: "^DONE$",
          scanTailLines: 10,
        },
        watch: {
          include: ["src/**"],
          exclude: ["node_modules/**"],
        },
        maxTurns: 1,
        env: {},
      } satisfies ContinuousRunConfig,
    };

    const startRequestAt = Date.now();
    const startResponse = await app.inject({
      method: "POST",
      url: "/api/runs/continuous",
      payload,
    });

    expect(startResponse.statusCode).toBe(202);
    const startBody = startResponse.json() as { runId: string };
    expect(startBody.runId).toBeDefined();
    const startDuration = Date.now() - startRequestAt;
    expect(startDuration).toBeLessThan(200);

    expect(runsService.getActiveRunIds()).toEqual(["r_async"]);

    const meta = await runsRedis.getRunMeta("r_async");
    expect(meta.status).toBe("queued");
    expect(meta.createdAt).toBe(FIXED_NOW.toISOString());

    const snapshotResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${startBody.runId}`,
    });
    expect(snapshotResponse.statusCode).toBe(200);
    const snapshot = snapshotResponse.json() as RunSnapshot;
    expect(snapshot.runId).toBe("r_async");
    expect(snapshot.status).toBe("queued");

    workerDeferred.resolve();
    await workerDeferred.promise;

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(runsService.getActiveRunIds()).toEqual([]);

    const finalResponse = await app.inject({
      method: "GET",
      url: `/api/runs/${startBody.runId}`,
    });
    expect(finalResponse.statusCode).toBe(200);
    const finalSnapshot = finalResponse.json() as RunSnapshot;
    expect(finalSnapshot.status).toBe("completed");
  });

  test("POST /api/runs/continuous returns run metadata", async () => {
    const startResult = {
      runId: "r_test",
      streamKey: "$",
      meta: {
        status: "queued",
        createdAt: "2025-10-27T16:00:00.000Z",
        updatedAt: "2025-10-27T16:00:00.000Z",
        epicId: "current-epic",
      },
    };

    const runsService = {
      startContinuousRun: mock(async (input: { epicId: string; config: ContinuousRunConfig }) => {
        expect(input.epicId).toBe("current-epic");
        expect(input.config.model).toBe("gpt-5-codex");
        return startResult;
      }),
      getActiveRunIds: mock(() => [] as string[]),
    };

    app = await createServer({
      logger: false,
      runsService,
    } as CreateServerOptions & { runsService: typeof runsService });

    const payload = {
      epicId: "current-epic",
      config: {
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
          include: ["src/**"],
          exclude: ["node_modules/**"],
        },
        maxTurns: null,
        env: {},
      } satisfies ContinuousRunConfig,
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/runs/continuous",
      payload,
    });

    expect(response.statusCode).toBe(202);
    expect(response.headers["content-type"]).toContain("application/json");

    expect(response.json()).toEqual({
      runId: startResult.runId,
      streamKey: startResult.streamKey,
      meta: startResult.meta,
    });

    expect(runsService.startContinuousRun).toHaveBeenCalledTimes(1);
  });

  test("GET /api/runs/:id returns run snapshot", async () => {
    const snapshot: RunSnapshot = {
      runId: "r_get",
      status: "running",
      createdAt: "2025-10-27T16:01:00.000Z",
      updatedAt: "2025-10-27T16:02:00.000Z",
      epicId: "current-epic",
      streamKey: "0-0",
      config: {
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
          include: ["src/**"],
        exclude: ["node_modules/**"],
      },
      maxTurns: null,
      env: {},
    },
      error: {
        code: "spawn_error",
        message: "failed to spawn",
        retryable: false,
      },
    };

    const runsService = {
      startContinuousRun: mock(),
      getRun: mock(async () => snapshot),
      listRuns: mock(),
      requestPause: mock(),
      requestResume: mock(),
      requestCancel: mock(),
      streamRunEvents: mock(),
       getActiveRunIds: mock(() => [] as string[]),
    };

    app = await createServer({
      logger: false,
      runsService,
    } as CreateServerOptions & { runsService: typeof runsService });

    const response = await app.inject({
      method: "GET",
      url: `/api/runs/${snapshot.runId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(snapshot);
    expect(runsService.getRun).toHaveBeenCalledWith(snapshot.runId);
  });

  test("GET /api/runs/:id/status returns run snapshot alias", async () => {
    const snapshot: RunSnapshot = {
      runId: "r_alias",
      status: "paused",
      createdAt: "2025-10-27T16:03:00.000Z",
      updatedAt: "2025-10-27T16:04:00.000Z",
      epicId: "current-epic",
      streamKey: "0-0",
    };

    const runsService = {
      startContinuousRun: mock(),
      getRun: mock(async () => snapshot),
      listRuns: mock(),
      requestPause: mock(),
      requestResume: mock(),
      requestCancel: mock(),
      streamRunEvents: mock(),
      getActiveRunIds: mock(() => [] as string[]),
      shutdown: mock(async () => {}),
    };

    app = await createServer({
      logger: false,
      runsService,
    } as CreateServerOptions & { runsService: typeof runsService });

    const response = await app.inject({
      method: "GET",
      url: `/api/runs/${snapshot.runId}/status`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(snapshot);
    expect(runsService.getRun).toHaveBeenCalledWith(snapshot.runId);
  });

  test("GET /api/runs returns list of runs", async () => {
    const runs = [
      {
        runId: "r_2",
        status: "running",
        epicId: "beta",
        createdAt: "2025-10-27T16:02:00.000Z",
        updatedAt: "2025-10-27T16:02:30.000Z",
        currentTurn: 7,
        stats: { turns: 7, tokens: 2410 },
        pid: 1234,
        completion: { detected: true, line: "STATUS: FEATURE_10_COMPLETE" },
        error: { code: "runtime_error", message: "failed", retryable: true },
      },
      {
        runId: "r_1",
        status: "queued",
        epicId: "alpha",
        createdAt: "2025-10-27T16:01:00.000Z",
        updatedAt: "2025-10-27T16:01:00.000Z",
      },
    ] as RunSummary[];

    const runsService = {
      startContinuousRun: mock(),
      getRun: mock(),
      listRuns: mock(async () => runs),
      requestPause: mock(),
      requestResume: mock(),
      requestCancel: mock(),
      streamRunEvents: mock(),
      getActiveRunIds: mock(() => [] as string[]),
    };

    app = await createServer({
      logger: false,
      runsService,
    } as CreateServerOptions & { runsService: typeof runsService });

    const response = await app.inject({
      method: "GET",
      url: "/api/runs",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ runs });
    expect(runsService.listRuns).toHaveBeenCalledWith({ limit: 20 });
  });

  test("server close triggers background run service shutdown", async () => {
    const runsService = {
      startContinuousRun: mock(),
      getRun: mock(),
      listRuns: mock(),
      requestPause: mock(),
      requestResume: mock(),
      requestCancel: mock(),
      streamRunEvents: mock(),
      getActiveRunIds: mock(() => [] as string[]),
      shutdown: mock(async () => {}),
    };

    app = await createServer({
      logger: false,
      runsService,
    } as CreateServerOptions & { runsService: typeof runsService });

    await app.close();
    app = undefined as unknown as FastifyInstance;

    expect(runsService.shutdown).toHaveBeenCalledTimes(1);
  });

  test("POST /api/runs/:id/control forwards pause/resume/cancel", async () => {
    const runsService = {
      startContinuousRun: mock(),
      getRun: mock(),
      listRuns: mock(),
      requestPause: mock(async (runId: string) => ({ runId, status: "pausing" as const })),
      requestResume: mock(async (runId: string) => ({ runId, status: "running" as const })),
      requestCancel: mock(async (runId: string) => ({ runId, status: "cancelling" as const })),
      streamRunEvents: mock(),
      getActiveRunIds: mock(() => [] as string[]),
    };

    app = await createServer({
      logger: false,
      runsService,
    } as CreateServerOptions & { runsService: typeof runsService });

    const pauseResponse = await app.inject({
      method: "POST",
      url: "/api/runs/r_demo/control",
      payload: { action: "pause" },
    });
    expect(pauseResponse.statusCode).toBe(200);
    expect(pauseResponse.json()).toEqual({ runId: "r_demo", status: "pausing" });
    expect(runsService.requestPause).toHaveBeenCalledWith("r_demo");

    const resumeResponse = await app.inject({
      method: "POST",
      url: "/api/runs/r_demo/control",
      payload: { action: "resume" },
    });
    expect(resumeResponse.statusCode).toBe(200);
    expect(resumeResponse.json()).toEqual({ runId: "r_demo", status: "running" });
    expect(runsService.requestResume).toHaveBeenCalledWith("r_demo");

    const cancelResponse = await app.inject({
      method: "POST",
      url: "/api/runs/r_demo/control",
      payload: { action: "cancel" },
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toEqual({ runId: "r_demo", status: "cancelling" });
    expect(runsService.requestCancel).toHaveBeenCalledWith("r_demo");
  });

  test("POST /api/runs/:id/control returns 400 for invalid action", async () => {
    const runsService = {
      startContinuousRun: mock(),
      getRun: mock(),
      listRuns: mock(),
      requestPause: mock(),
      requestResume: mock(),
      requestCancel: mock(),
      streamRunEvents: mock(),
      getActiveRunIds: mock(() => [] as string[]),
    };

    app = await createServer({
      logger: false,
      runsService,
    } as CreateServerOptions & { runsService: typeof runsService });

    const response = await app.inject({
      method: "POST",
      url: "/api/runs/r_demo/control",
      payload: { action: "noop" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "invalid_request",
        message: "Unsupported action: noop",
      },
    });
  });

  test("GET /api/runs/:id/stream forwards events via SSE", async () => {
    const entries = [
      {
        id: "0-1",
        event: { type: "run_started", ts: "2025-10-27T16:00:01.000Z", runId: "r_stream" } satisfies RunEvent,
      },
      {
        id: "0-2",
        event: { type: "turn_started", ts: "2025-10-27T16:00:02.000Z", runId: "r_stream", turn: 1 } satisfies RunEvent,
      },
      {
        id: "0-3",
        event: { type: "run_updated", ts: "2025-10-27T16:00:03.000Z", runId: "r_stream", status: "pausing" } satisfies RunEvent,
      },
      {
        id: "0-4",
        event: { type: "run_paused", ts: "2025-10-27T16:00:04.000Z", runId: "r_stream", reason: "manual" } satisfies RunEvent,
      },
      {
        id: "0-5",
        event: { type: "run_resumed", ts: "2025-10-27T16:00:05.000Z", runId: "r_stream" } satisfies RunEvent,
      },
      {
        id: "0-6",
        event: { type: "run_completed", ts: "2025-10-27T16:00:06.000Z", runId: "r_stream" } satisfies RunEvent,
      },
    ];

    async function* stubStream() {
      for (const entry of entries) {
        yield entry;
      }
    }

    const runsService = {
      startContinuousRun: mock(),
      getRun: mock(),
      listRuns: mock(),
      requestPause: mock(),
      requestResume: mock(),
      requestCancel: mock(),
      streamRunEvents: mock((_runId: string) => stubStream()),
      getActiveRunIds: mock(() => [] as string[]),
    };

    app = await createServer({
      logger: false,
      runsService,
    } as CreateServerOptions & { runsService: typeof runsService });

    const response = await app.inject({
      method: "GET",
      url: "/api/runs/r_stream/stream?from=0-0",
      headers: { accept: "text/event-stream" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");

    const chunks = response.body.trim().split("\n\n");
    for (const entry of entries) {
      expect(chunks).toContain(`id: ${entry.id}\ndata: ${JSON.stringify(entry.event)}`);
    }
    expect(chunks[chunks.length - 1]).toBe("data: [DONE]");

    expect(runsService.streamRunEvents).toHaveBeenCalledWith(
      "r_stream",
      expect.objectContaining({
        from: "0-0",
        lastEventId: undefined,
      }),
    );
  });

  test("GET /api/runs/:id/stream emits keepalive comments while waiting", async () => {
    const completionEvent = {
      id: "0-2",
      event: { type: "run_completed", ts: "2025-10-27T16:00:10.000Z", runId: "r_keepalive" } satisfies RunEvent,
    };

    async function* delayedStream() {
      await new Promise((resolve) => setTimeout(resolve, 25));
      yield completionEvent;
    }

    const runsService = {
      startContinuousRun: mock(),
      getRun: mock(),
      listRuns: mock(),
      requestPause: mock(),
      requestResume: mock(),
      requestCancel: mock(),
      streamRunEvents: mock((_runId: string) => delayedStream()),
      getActiveRunIds: mock(() => [] as string[]),
    };

    app = await createServer({
      logger: false,
      runsService,
      runsStreamKeepaliveMs: 5,
    } as CreateServerOptions & {
      runsService: typeof runsService;
      runsStreamKeepaliveMs: number;
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/runs/r_keepalive/stream",
      headers: { accept: "text/event-stream" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(":keepalive");
    expect(response.body).toContain(`id: ${completionEvent.id}`);
  });

  test("GET /api/runs/:id/stream returns 410 when stream trimmed", async () => {
    const trimmedError = Object.assign(new Error("stream events trimmed"), {
      code: "RUN_STREAM_TRIMMED",
    });

    async function* trimmedStream() {
      throw trimmedError;
    }

    const runsService = {
      startContinuousRun: mock(),
      getRun: mock(),
      listRuns: mock(),
      requestPause: mock(),
      requestResume: mock(),
      requestCancel: mock(),
      streamRunEvents: mock((_runId: string) => trimmedStream()),
      getActiveRunIds: mock(() => [] as string[]),
    };

    app = await createServer({
      logger: false,
      runsService,
    } as CreateServerOptions & { runsService: typeof runsService });

    const response = await app.inject({
      method: "GET",
      url: "/api/runs/r_trimmed/stream",
      headers: { accept: "text/event-stream" },
    });

    expect(response.statusCode).toBe(410);
    expect(response.body).toContain("\"code\":\"stream_trimmed\"");
  });
});

async function waitForAsync(check: () => Promise<boolean>, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Condition not satisfied within timeout");
}

function createInMemoryRunsRedis(): RunsRedis & {
  events: Record<string, RunStreamEntry[]>;
  meta: Record<string, Record<string, string>>;
  control: Record<string, RunControlEntry[]>;
  index: RunIndexEntry[];
} {
  let seq = 0;
  const stores = {
    events: new Map<string, RunStreamEntry[]>(),
    meta: new Map<string, Record<string, string>>(),
    control: new Map<string, RunControlEntry[]>(),
    index: [] as RunIndexEntry[],
  };

  const getNextId = () => {
    seq += 1;
    return `${seq}-0`;
  };

  const parseId = (id: string) => {
    const [major] = id.split("-");
    const parsed = Number.parseInt(major, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    client: undefined as never,
    events: Object.create(null),
    meta: Object.create(null),
    control: Object.create(null),
    index: stores.index,
    async appendRunEvent(runId, event) {
      const id = getNextId();
      const entries = stores.events.get(runId) ?? [];
      entries.push({ id, event });
      stores.events.set(runId, entries);
      (this.events[runId] ??= []).push({ id, event });
      return id;
    },
    async readRunEvents(runId, lastId) {
      const entries = stores.events.get(runId) ?? [];
      const lastSeq = parseId(lastId);
      return entries.filter((entry) => parseId(entry.id) > lastSeq);
    },
    async setRunMeta(runId, values) {
      const meta = stores.meta.get(runId) ?? {};
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) {
          continue;
        }
        meta[key] = value === null ? "null" : String(value);
      }
      stores.meta.set(runId, meta);
      this.meta[runId] = meta;
    },
    async getRunMeta(runId) {
      return stores.meta.get(runId) ?? {};
    },
    async appendRunControlMessage(runId, message) {
      const id = getNextId();
      const entries = stores.control.get(runId) ?? [];
      const entry: RunControlEntry = { id, message };
      entries.push(entry);
      stores.control.set(runId, entries);
      (this.control[runId] ??= []).push(entry);
      return id;
    },
    async readRunControlMessages(runId, lastId) {
      const entries = stores.control.get(runId) ?? [];
      const lastSeq = parseId(lastId);
      return entries.filter((entry) => parseId(entry.id) > lastSeq);
    },
    async addRunToIndex(runId, score) {
      stores.index = stores.index.filter((entry) => entry.runId !== runId);
      stores.index.push({ runId, score });
      stores.index.sort((a, b) => b.score - a.score);
      this.index = stores.index;
    },
    async listRunsFromIndex(limit) {
      return stores.index.slice(0, limit);
    },
    async getRunEventsInfo(runId) {
      const entries = stores.events.get(runId) ?? [];
      return {
        length: entries.length,
        firstEntryId: entries[0]?.id ?? null,
        lastEntryId: entries.length > 0 ? entries[entries.length - 1]?.id ?? null : null,
      };
    },
    async deleteRunData(runId) {
      stores.events.delete(runId);
      stores.meta.delete(runId);
      stores.control.delete(runId);
      stores.index = stores.index.filter((entry) => entry.runId !== runId);
      this.index = stores.index;
    },
    async close() {
      // no-op
    },
  };
}

function createDeferred<T>() {
  let resolveFn!: (value: T | PromiseLike<T>) => void;
  let rejectFn!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return {
    promise,
    resolve(value?: T) {
      resolveFn(value as T);
    },
    reject(reason?: unknown) {
      rejectFn(reason);
    },
  };
}
