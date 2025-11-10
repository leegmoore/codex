import { randomUUID } from "node:crypto";

import type { RunsRedis, RunStreamEntry } from "./redis";
import { createRunWorker } from "./run-worker";
import type {
  ContinuousRunConfig,
  RunSnapshot,
  RunSummary,
  RunControlMessage,
  RunControlType,
  RunEvent,
} from "./types";

export const DEFAULT_STREAM_START_ID = "$";
const TRIM_CHECK_EMPTY_THRESHOLD = 3;

export class RunStreamTrimmedError extends Error {
  public readonly code = "RUN_STREAM_TRIMMED";
  public readonly runId: string;
  public readonly lastSeenId: string;
  public readonly earliestAvailableId: string | null;

  constructor(options: { runId: string; lastSeenId: string; earliestAvailableId: string | null }) {
    super(
      `run ${options.runId} stream no longer includes events before ${options.earliestAvailableId ?? "current head"}`,
    );
    this.name = "RunStreamTrimmedError";
    this.runId = options.runId;
    this.lastSeenId = options.lastSeenId;
    this.earliestAvailableId = options.earliestAvailableId;
  }
}

export interface StartContinuousRunInput {
  epicId: string;
  config: ContinuousRunConfig;
}

export interface StartContinuousRunResult {
  runId: string;
  streamKey: string;
  meta: Record<string, string>;
}

export interface BackgroundRunsService {
  startContinuousRun(input: StartContinuousRunInput): Promise<StartContinuousRunResult>;
  getRun(runId: string): Promise<RunSnapshot | null>;
  listRuns(options?: { limit?: number }): Promise<RunSummary[]>;
  requestPause(runId: string): Promise<{ runId: string; status: "pausing" }>;
  requestResume(runId: string): Promise<{ runId: string; status: "running" }>;
  requestCancel(runId: string): Promise<{ runId: string; status: "cancelling" }>;
  streamRunEvents(
    runId: string,
    options?: StreamRunEventsOptions,
  ): AsyncGenerator<RunStreamEntry>;
  shutdown(): Promise<void>;
  getActiveRunIds(): string[];
}

export interface BackgroundRunsServiceOptions {
  runsRedis: RunsRedis;
  generateRunId?: () => string;
  now?: () => Date;
  workerFactory?: (options: BackgroundRunWorkerOptions) => BackgroundRunWorker;
}

export interface BackgroundRunWorkerOptions {
  runId: string;
  epicId: string;
  config: ContinuousRunConfig;
  runsRedis: RunsRedis;
  now?: () => Date;
}

export interface BackgroundRunWorker {
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface StreamRunEventsOptions {
  from?: string;
  lastEventId?: string;
  blockMs?: number;
  signal?: AbortSignal;
}

export function createBackgroundRunsService(options: BackgroundRunsServiceOptions): BackgroundRunsService {
  const {
    runsRedis,
    generateRunId = defaultGenerateRunId,
    now = () => new Date(),
    workerFactory = (workerOptions: BackgroundRunWorkerOptions) =>
      createRunWorker({ ...workerOptions, now }),
  } = options;

  const activeWorkers = new Map<string, { worker: BackgroundRunWorker; promise: Promise<void> }>();

  async function startContinuousRun(input: StartContinuousRunInput): Promise<StartContinuousRunResult> {
    const runId = generateRunId();
    const currentTime = now();
    const timestamp = currentTime.toISOString();

    const meta = {
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
      epicId: input.epicId,
      streamKey: DEFAULT_STREAM_START_ID,
      config: JSON.stringify(input.config),
      model: input.config.model,
      reasoning: input.config.reasoning,
      approval: input.config.approval,
      sandbox: input.config.sandbox,
      loopDelaySec: String(input.config.loopDelaySec),
      maxTurns: input.config.maxTurns === null ? "null" : String(input.config.maxTurns),
      "completion.pattern": input.config.completion.pattern,
      "completion.scanTailLines": String(input.config.completion.scanTailLines),
      "completion.detected": "0",
      "completion.line": "",
    };

    await runsRedis.setRunMeta(runId, meta);
    await runsRedis.addRunToIndex(runId, currentTime.getTime());

    const worker = workerFactory({
      runId,
      epicId: input.epicId,
      config: input.config,
      runsRedis,
      now,
    });

    const workerTask = (async () => {
      try {
        await worker.start();
      } catch (error) {
        console.error("continuous run worker failed", { runId, error });
      }
    })();

    const trackedPromise = workerTask.finally(() => {
      activeWorkers.delete(runId);
    });

    activeWorkers.set(runId, { worker, promise: trackedPromise });
    void trackedPromise;

    return {
      runId,
      streamKey: DEFAULT_STREAM_START_ID,
      meta,
    };
  }

  async function getRun(runId: string): Promise<RunSnapshot | null> {
    const meta = await runsRedis.getRunMeta(runId);
    if (!meta.status || !meta.createdAt || !meta.updatedAt) {
      return null;
    }

    let config: ContinuousRunConfig | undefined;
    if (meta.config) {
      try {
        config = JSON.parse(meta.config) as ContinuousRunConfig;
      } catch {
        config = undefined;
      }
    }

    const snapshot: RunSnapshot = {
      runId,
      status: meta.status as RunSnapshot["status"],
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      epicId: meta.epicId,
      streamKey: meta.streamKey ?? DEFAULT_STREAM_START_ID,
      config,
    };

    const pid = parseInteger(meta.pid);
    if (pid !== undefined) {
      snapshot.pid = pid;
    }

    const currentTurn = parseInteger(meta.currentTurn);
    if (currentTurn !== undefined) {
      snapshot.currentTurn = currentTurn;
    }

    const statsTurns = parseInteger(meta["stats.turns"]);
    const statsTokens = parseInteger(meta["stats.tokens"]);
    if (statsTurns !== undefined || statsTokens !== undefined) {
      snapshot.stats = {
        turns: statsTurns ?? 0,
        tokens: statsTokens ?? 0,
      };
    }

    if (meta["completion.detected"] !== undefined || meta["completion.line"] !== undefined) {
      const detected = parseBoolean(meta["completion.detected"]);
      const completion: NonNullable<RunSnapshot["completion"]> = {
        detected: detected ?? false,
      };
      if (meta["completion.line"] !== undefined) {
        completion.line = meta["completion.line"];
      }
      snapshot.completion = completion;
    }

    const errorCode = parseString(meta["error.code"]);
    const errorMessage = parseString(meta["error.message"]);
    const errorRetryable = parseBoolean(meta["error.retryable"]);
    if (errorCode !== undefined || errorMessage !== undefined || errorRetryable !== undefined) {
      snapshot.error = {
        code: errorCode ?? "",
        message: errorMessage ?? "",
      };
      if (errorRetryable !== undefined) {
        snapshot.error.retryable = errorRetryable;
      }
    }

    return snapshot;
  }

  async function listRuns(options: { limit?: number } = {}): Promise<RunSummary[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const indexEntries = await runsRedis.listRunsFromIndex(limit);

    const results: RunSummary[] = [];
    for (const entry of indexEntries) {
      const meta = await runsRedis.getRunMeta(entry.runId);
      if (!meta.status || !meta.createdAt || !meta.updatedAt) {
        continue;
      }
      const summary: RunSummary = {
        runId: entry.runId,
        status: meta.status as RunSummary["status"],
        epicId: meta.epicId,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      };

      const pid = parseInteger(meta.pid);
      if (pid !== undefined) {
        summary.pid = pid;
      }

      const currentTurn = parseInteger(meta.currentTurn);
      if (currentTurn !== undefined) {
        summary.currentTurn = currentTurn;
      }

      const statsTurns = parseInteger(meta["stats.turns"]);
      const statsTokens = parseInteger(meta["stats.tokens"]);
      if (statsTurns !== undefined || statsTokens !== undefined) {
        summary.stats = {
          turns: statsTurns ?? 0,
          tokens: statsTokens ?? 0,
        };
      }

      if (meta["completion.detected"] !== undefined || meta["completion.line"] !== undefined) {
        const detected = parseBoolean(meta["completion.detected"]);
        const completion: NonNullable<RunSummary["completion"]> = {
          detected: detected ?? false,
        };
        if (meta["completion.line"] !== undefined) {
          completion.line = meta["completion.line"];
        }
        summary.completion = completion;
      }

      const errorCode = parseString(meta["error.code"]);
      const errorMessage = parseString(meta["error.message"]);
      const errorRetryable = parseBoolean(meta["error.retryable"]);
      if (errorCode !== undefined || errorMessage !== undefined || errorRetryable !== undefined) {
        summary.error = {
          code: errorCode ?? "",
          message: errorMessage ?? "",
        };
        if (errorRetryable !== undefined) {
          summary.error.retryable = errorRetryable;
        }
      }

      results.push(summary);
    }

    return results;
  }

  async function requestPause(runId: string): Promise<{ runId: string; status: "pausing" }> {
    return requestControl(runId, "pause", "pausing");
  }

  async function requestResume(runId: string): Promise<{ runId: string; status: "running" }> {
    return requestControl(runId, "resume", "running");
  }

  async function requestCancel(runId: string): Promise<{ runId: string; status: "cancelling" }> {
    return requestControl(runId, "cancel", "cancelling");
  }

  async function requestControl(
    runId: string,
    type: RunControlType,
    status: "pausing" | "running" | "cancelling",
  ): Promise<{ runId: string; status: typeof status }> {
    const currentTime = now();
    const timestamp = currentTime.toISOString();
    const message: RunControlMessage = {
      type,
      ts: timestamp,
      runId,
    };

    await runsRedis.appendRunControlMessage(runId, message);
    await runsRedis.setRunMeta(runId, {
      status,
      updatedAt: timestamp,
    });

    return { runId, status };
  }

  async function* streamRunEvents(
    runId: string,
    options: StreamRunEventsOptions = {},
  ): AsyncGenerator<RunStreamEntry> {
    let lastId =
      typeof options.lastEventId === "string" && options.lastEventId.length > 0
        ? options.lastEventId
        : typeof options.from === "string" && options.from.length > 0
          ? options.from
          : DEFAULT_STREAM_START_ID;

    const blockMs = options.blockMs ?? 5_000;
    let consecutiveEmptyPolls = 0;

    while (!options.signal?.aborted) {
      const entries = await runsRedis.readRunEvents(runId, lastId, {
        blockMs,
      });

      if (entries.length === 0) {
        consecutiveEmptyPolls += 1;
        if (
          consecutiveEmptyPolls >= TRIM_CHECK_EMPTY_THRESHOLD &&
          lastId !== DEFAULT_STREAM_START_ID
        ) {
          consecutiveEmptyPolls = 0;
          const streamInfo = await runsRedis.getRunEventsInfo(runId);
          if (
            streamInfo &&
            (streamInfo.length === 0 ||
              (streamInfo.firstEntryId && compareStreamIds(streamInfo.firstEntryId, lastId) > 0))
          ) {
            throw new RunStreamTrimmedError({
              runId,
              lastSeenId: lastId,
              earliestAvailableId: streamInfo.firstEntryId,
            });
          }
        }
        continue;
      }

      consecutiveEmptyPolls = 0;

      for (const entry of entries) {
        lastId = entry.id;
        yield entry;
        if (isTerminalRunEvent(entry.event)) {
          return;
        }
      }
    }
  }

  async function shutdown(): Promise<void> {
    if (activeWorkers.size === 0) {
      return;
    }

    const entries = Array.from(activeWorkers.entries());
    const shutdownCalls: Promise<void>[] = [];
    const waitCalls: Promise<void>[] = [];

    for (const [runId, entry] of entries) {
      try {
        const shutdownCall = entry.worker.shutdown();
        shutdownCalls.push(
          shutdownCall.catch((error) => {
            console.error("failed to shutdown worker", { runId, error });
          }),
        );
      } catch (error) {
        console.error("failed to initiate worker shutdown", { runId, error });
      }

      waitCalls.push(
        entry.promise.catch((error) => {
          console.error("worker promise rejected during shutdown", { runId, error });
        }),
      );
    }

    if (shutdownCalls.length > 0) {
      await Promise.allSettled(shutdownCalls);
    }
    if (waitCalls.length > 0) {
      await Promise.allSettled(waitCalls);
    }

    activeWorkers.clear();
  }

  function getActiveRunIds(): string[] {
    return Array.from(activeWorkers.keys());
  }

  return {
    startContinuousRun,
    getRun,
    listRuns,
    requestPause,
    requestResume,
    requestCancel,
    streamRunEvents,
    shutdown,
    getActiveRunIds,
  };
}

function defaultGenerateRunId(): string {
  return `r_${randomUUID()}`;
}

// createRunWorker provides default background execution when a worker factory is not supplied.

function parseInteger(value: string | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "null") {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "n") {
    return false;
  }
  return undefined;
}

function parseString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === "null") {
    return undefined;
  }
  return trimmed;
}

function isTerminalRunEvent(event: RunEvent): boolean {
  switch (event.type) {
    case "run_completed":
    case "run_failed":
    case "run_cancelled":
      return true;
    default:
      return false;
  }
}

function compareStreamIds(a: string, b: string): number {
  const [aMajorRaw, aMinorRaw] = a.split("-");
  const [bMajorRaw, bMinorRaw] = b.split("-");
  const aMajor = Number.parseInt(aMajorRaw ?? "0", 10);
  const bMajor = Number.parseInt(bMajorRaw ?? "0", 10);
  if (aMajor !== bMajor) {
    return (aMajor || 0) - (bMajor || 0);
  }
  const aMinor = Number.parseInt(aMinorRaw ?? "0", 10);
  const bMinor = Number.parseInt(bMinorRaw ?? "0", 10);
  return (aMinor || 0) - (bMinor || 0);
}
