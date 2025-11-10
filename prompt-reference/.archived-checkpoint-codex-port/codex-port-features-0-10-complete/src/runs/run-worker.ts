import { randomUUID } from "node:crypto";
import type { BackgroundRunWorker, BackgroundRunWorkerOptions } from "./run-service";
import type { RunsRedis, RunControlEntry } from "./redis";
import {
  createInitialRunState,
  isTerminalRunState,
  transitionRunState,
  InvalidRunStateTransitionError,
} from "./state-machine";
import type {
  ContinuousRunConfig,
  RunCancelReason,
  RunControlMessage,
  RunEvent,
  RunFailure,
  RunPauseReason,
} from "./types";
import { createDefaultRunTurnHandler } from "./turn-handler";

const DEFAULT_CONTROL_POLL_INTERVAL_MS = 500;
const RUN_LOCK_TTL_MS = 60_000;
const RUN_LOCK_REFRESH_INTERVAL_MS = 20_000;

export interface RunTurnContext {
  runId: string;
  epicId: string;
  config: ContinuousRunConfig;
  turn: number;
  signal: AbortSignal;
  onPid?: (pid: number) => void | Promise<void>;
}

export interface TurnTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface RunTurnSuccessResult {
  status: "success";
  events: RunEvent[];
  shouldContinue: boolean;
  completion?: {
    detected: boolean;
    line?: string;
  };
  tokenUsage?: TurnTokenUsage;
}

export interface RunTurnFailureResult {
  status: "failure";
  events: RunEvent[];
  error: RunFailure;
  tokenUsage?: TurnTokenUsage;
}

export interface RunTurnCancelledResult {
  status: "cancelled";
  events: RunEvent[];
  reason?: RunCancelReason;
}

export type RunTurnResult = RunTurnSuccessResult | RunTurnFailureResult | RunTurnCancelledResult;

export type RunTurnHandler = (context: RunTurnContext) => Promise<RunTurnResult>;

export interface CreateRunWorkerOptions extends BackgroundRunWorkerOptions {
  turnHandler?: RunTurnHandler;
  now?: () => Date;
  controlPollIntervalMs?: number;
  logger?: Pick<Console, "debug" | "info" | "warn" | "error">;
}

export function createRunWorker(options: CreateRunWorkerOptions): BackgroundRunWorker {
  const {
    runId,
    epicId,
    config,
    runsRedis,
    now = () => new Date(),
    controlPollIntervalMs = DEFAULT_CONTROL_POLL_INTERVAL_MS,
    turnHandler: providedTurnHandler,
    logger,
  } = options;

  const turnHandler = providedTurnHandler ?? createDefaultRunTurnHandler({ now });

  let state = createInitialRunState();
  let lastControlId = "0-0";
  let started = false;
  let turnCounter = 0;
  let currentTurnController: AbortController | null = null;
  let lastPid: number | null = null;
  let totalTokens = 0;
  let startPromise: Promise<void> | null = null;
  let shutdownPromise: Promise<void> | null = null;
  const workerId = randomUUID();
  let lockHeld = false;
  let lockRefreshTimer: NodeJS.Timeout | null = null;
  let lockRefreshInFlight = false;

  const logDebug = (message: string, meta?: Record<string, unknown>) => {
    if (logger && typeof logger.debug === "function") {
      logger.debug({ runId, ...(meta ?? {}) }, message);
    }
  };

  async function start(): Promise<void> {
    if (startPromise) {
      return startPromise;
    }
    if (started) {
      return Promise.resolve();
    }
    started = true;

    startPromise = (async () => {
      const lockAcquired = await runsRedis.acquireRunLock(runId, workerId, RUN_LOCK_TTL_MS);
      if (!lockAcquired) {
        throw new Error(`run ${runId} cannot acquire worker lock`);
      }
      lockHeld = true;
      startLockRefresh();

      try {
        logDebug("starting worker");

        const startTimestamp = now().toISOString();
        state = transitionRunState(state, { type: "worker_started" });
        await runsRedis.setRunMeta(runId, {
          status: state.status,
          updatedAt: startTimestamp,
          "stats.turns": 0,
          "stats.tokens": 0,
        });
        await appendEvent(createRunStartedEvent(runId, startTimestamp, config));

        await processControlMessages();

        while (!isTerminalRunState(state)) {
          if (state.status === "cancelling") {
            await finalizeCancellation();
            break;
          }

          if (state.status === "pausing") {
            await finalizePause();
            await waitForResume();
            continue;
          }

          if (state.status === "paused") {
            await waitForResume();
            continue;
          }

          turnCounter += 1;
          currentTurnController = new AbortController();
          let currentPid: number | null = null;
          const turnContext: RunTurnContext = {
            runId,
            epicId,
            config,
            turn: turnCounter,
            signal: currentTurnController.signal,
            onPid: async (pid: number) => {
              if (typeof pid !== "number" || !Number.isFinite(pid)) {
                return;
              }
              currentPid = pid;
              lastPid = pid;
              const timestamp = now().toISOString();
              await runsRedis.setRunMeta(runId, {
                pid,
                updatedAt: timestamp,
              });
            },
          };

          const result = await turnHandler(turnContext);
          await publishTurnEvents(result.events);

          const metaUpdates: Record<string, string | number | boolean | null | undefined> = {
            currentTurn: turnCounter,
            updatedAt: now().toISOString(),
            "stats.turns": turnCounter,
          };
          if (result.status === "success" && result.completion) {
            metaUpdates["completion.detected"] = result.completion.detected ? "1" : "0";
            metaUpdates["completion.line"] = result.completion.line ?? "";
          }
          const usage = extractTokenUsage(result);
          if (usage) {
            totalTokens += Number.isFinite(usage.totalTokens) ? usage.totalTokens : 0;
          }
          metaUpdates["stats.tokens"] = totalTokens;
          if (currentPid != null) {
            metaUpdates.pid = currentPid;
          } else if (lastPid != null) {
            metaUpdates.pid = lastPid;
          }
          await runsRedis.setRunMeta(runId, metaUpdates);
          currentTurnController = null;

          if (result.status === "failure") {
            await finalizeFailure(result.error);
            break;
          }

          if (result.status === "cancelled") {
            await requestCancellation(result.reason);
            await finalizeCancellation();
            break;
          }

          await processControlMessages();

          if (state.status === "cancelling") {
            await finalizeCancellation();
            break;
          }

          if (state.status === "pausing") {
            await finalizePause();
            await waitForResume();
            continue;
          }

          if (!result.shouldContinue) {
            await finalizeSuccess();
            break;
          }

          const loopDelayMs = Math.max(0, Math.floor(config.loopDelaySec * 1000));
          if (loopDelayMs > 0) {
            await processControlMessages(loopDelayMs);

            if (state.status === "cancelling") {
              await finalizeCancellation();
              break;
            }

            if (state.status === "pausing") {
              await finalizePause();
              await waitForResume();
              continue;
            }
          }
        }
      } finally {
        clearLockRefreshTimer();
        if (lockHeld) {
          lockHeld = false;
          try {
            await runsRedis.releaseRunLock(runId, workerId);
          } catch (error) {
            logDebug("failed to release run lock", { error });
          }
        }
      }
    })();

    return startPromise;
  }

  async function shutdown(): Promise<void> {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      try {
        await requestCancellation("system");
      } catch (error) {
        logDebug("failed to request cancellation during shutdown", { error });
      }

      if (currentTurnController && !currentTurnController.signal.aborted) {
        currentTurnController.abort();
      }

      if (startPromise) {
        try {
          await startPromise;
        } catch (error) {
          logDebug("worker shutdown wait failed", { error });
        }
      }
    })();

    return shutdownPromise;
  }

  function clearLockRefreshTimer(): void {
    if (lockRefreshTimer) {
      clearInterval(lockRefreshTimer);
      lockRefreshTimer = null;
    }
  }

  function startLockRefresh(): void {
    if (lockRefreshTimer || !lockHeld) {
      return;
    }
    lockRefreshTimer = setInterval(() => {
      void refreshLock();
    }, RUN_LOCK_REFRESH_INTERVAL_MS);
    if (typeof lockRefreshTimer.unref === "function") {
      lockRefreshTimer.unref();
    }
    void refreshLock();
  }

  async function refreshLock(): Promise<void> {
    if (!lockHeld || lockRefreshInFlight) {
      return;
    }
    lockRefreshInFlight = true;
    try {
      const ok = await runsRedis.refreshRunLock(runId, workerId, RUN_LOCK_TTL_MS);
      if (!ok) {
        lockHeld = false;
        clearLockRefreshTimer();
        logDebug("lost run lock during refresh, requesting cancellation");
        await requestCancellation("system");
      }
    } catch (error) {
      logDebug("failed to refresh run lock", { error });
    } finally {
      lockRefreshInFlight = false;
    }
  }

  async function publishTurnEvents(events: RunEvent[]): Promise<void> {
    if (!events || events.length === 0) {
      return;
    }
    for (const event of events) {
      if (event.runId !== runId) {
        continue;
      }
      await runsRedis.appendRunEvent(runId, event);
    }
  }

  async function appendEvent(event: RunEvent): Promise<void> {
    await runsRedis.appendRunEvent(runId, event);
  }

  async function processControlMessages(blockMs?: number): Promise<void> {
    const entries = await runsRedis.readRunControlMessages(
      runId,
      lastControlId,
      blockMs !== undefined ? { blockMs } : undefined,
    );

    if (entries.length === 0) {
      if (blockMs && blockMs > 0) {
        await sleep(Math.min(blockMs, 10));
      }
      return;
    }

    for (const entry of entries) {
      lastControlId = entry.id;
      await handleControlMessage(entry);
    }
  }

  async function handleControlMessage(entry: RunControlEntry): Promise<void> {
    const message = entry.message;
    const timestamp = now().toISOString();

    switch (message.type) {
      case "pause":
        if (state.status === "running") {
          try {
            state = transitionRunState(state, {
              type: "pause_requested",
              reason: normalizePauseReason(message.reason),
            });
            await runsRedis.setRunMeta(runId, {
              status: state.status,
              updatedAt: timestamp,
            });
            await appendEvent(createRunUpdatedEvent(runId, timestamp, state.status));
          } catch (error) {
            logDebug("invalid pause transition", { error });
          }
        }
        break;
      case "resume":
        if (state.status === "paused") {
          try {
            state = transitionRunState(state, { type: "resume_requested" });
            await runsRedis.setRunMeta(runId, {
              status: state.status,
              updatedAt: timestamp,
            });
            await appendEvent(createRunResumedEvent(runId, timestamp));
          } catch (error) {
            logDebug("invalid resume transition", { error });
          }
        }
        break;
      case "cancel":
        if (!isTerminalRunState(state)) {
          await requestCancellation(normalizeCancelReason(message.reason), timestamp);
        }
        break;
      default:
        break;
    }
  }

  async function requestCancellation(reason?: RunCancelReason, timestamp?: string): Promise<void> {
    const cancelReason = normalizeCancelReason(reason);
    const appliedTimestamp = timestamp ?? now().toISOString();

    if (isTerminalRunState(state)) {
      return;
    }

    if (state.status !== "cancelling") {
      try {
        state = transitionRunState(state, {
          type: "cancel_requested",
          reason: cancelReason,
        });
        await runsRedis.setRunMeta(runId, {
          status: state.status,
          updatedAt: appliedTimestamp,
        });
        await appendEvent(createRunUpdatedEvent(runId, appliedTimestamp, state.status));
      } catch (error) {
        logDebug("invalid cancel transition", { error });
      }
    }

    if (currentTurnController) {
      currentTurnController.abort();
    }
  }

  async function finalizeSuccess(): Promise<void> {
    try {
      state = transitionRunState(state, { type: "run_completed" });
    } catch (error) {
      if (error instanceof InvalidRunStateTransitionError) {
        logDebug("invalid completion transition", { error });
        return;
      }
      throw error;
    }

    const timestamp = now().toISOString();
    await runsRedis.setRunMeta(runId, {
      status: state.status,
      updatedAt: timestamp,
    });
    await appendEvent(createRunCompletedEvent(runId, timestamp));
  }

  async function finalizeFailure(error: RunFailure): Promise<void> {
    try {
      state = transitionRunState(state, { type: "run_failed", error });
    } catch (transitionError) {
      if (transitionError instanceof InvalidRunStateTransitionError) {
        logDebug("invalid failure transition", { error: transitionError });
        return;
      }
      throw transitionError;
    }

    const timestamp = now().toISOString();
    const metaUpdates: Record<string, string | number | boolean | null | undefined> = {
      status: state.status,
      updatedAt: timestamp,
      "error.code": error.code,
      "error.message": error.message,
    };
    if (typeof error.retryable === "boolean") {
      metaUpdates["error.retryable"] = error.retryable;
    }
    await runsRedis.setRunMeta(runId, metaUpdates);
    await appendEvent(createRunFailedEvent(runId, timestamp, error));
  }

  async function finalizePause(): Promise<void> {
    try {
      state = transitionRunState(state, { type: "pause_acknowledged" });
    } catch (error) {
      if (error instanceof InvalidRunStateTransitionError) {
        logDebug("invalid pause acknowledgement", { error });
        return;
      }
      throw error;
    }

    const timestamp = now().toISOString();
    const reason = state.status === "paused" ? state.reason : "manual";
    await runsRedis.setRunMeta(runId, {
      status: state.status,
      updatedAt: timestamp,
    });
    await appendEvent(createRunPausedEvent(runId, timestamp, reason));
  }

  async function waitForResume(): Promise<void> {
    while (state.status === "paused") {
      await processControlMessages(controlPollIntervalMs);
    }
  }

  async function finalizeCancellation(): Promise<void> {
    if (state.status !== "cancelling") {
      return;
    }

    try {
      state = transitionRunState(state, { type: "cancel_acknowledged" });
    } catch (error) {
      if (error instanceof InvalidRunStateTransitionError) {
        logDebug("invalid cancel acknowledgement", { error });
        return;
      }
      throw error;
    }

    const timestamp = now().toISOString();
    const reason = state.status === "cancelled" ? state.reason : "manual";
    await runsRedis.setRunMeta(runId, {
      status: state.status,
      updatedAt: timestamp,
    });
    await appendEvent(createRunCancelledEvent(runId, timestamp, reason));
  }

  function extractTokenUsage(result: RunTurnResult): TurnTokenUsage | undefined {
    if (result.status === "success" && result.tokenUsage) {
      return normalizeTokenUsage(result.tokenUsage);
    }
    if (result.status === "failure" && result.tokenUsage) {
      return normalizeTokenUsage(result.tokenUsage);
    }
    for (const event of result.events) {
      if (event.type === "token_usage") {
        const normalized = normalizeTokenUsage(event as Partial<TurnTokenUsage>);
        if (normalized) {
          return normalized;
        }
        continue;
      }
      if (event.type !== "turn_completed") {
        continue;
      }
      const payload = event as RunEvent & { tokenUsage?: Partial<TurnTokenUsage> };
      if (payload.tokenUsage && typeof payload.tokenUsage === "object") {
        const normalized = normalizeTokenUsage(payload.tokenUsage);
        if (normalized) {
          return normalized;
        }
      }
    }
    return undefined;
  }

  function normalizeTokenUsage(raw: Partial<TurnTokenUsage>): TurnTokenUsage | undefined {
    const inputTokens = toNumber(raw.inputTokens) ?? 0;
    const outputTokens = toNumber(raw.outputTokens) ?? 0;
    const totalTokens = toNumber(raw.totalTokens) ?? inputTokens + outputTokens;
    if (!Number.isFinite(totalTokens)) {
      return undefined;
    }
    return {
      inputTokens,
      outputTokens,
      totalTokens,
    };
  }

  function toNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  return {
    start,
    shutdown,
  };
}

function createRunStartedEvent(runId: string, ts: string, config: ContinuousRunConfig): RunEvent {
  return {
    type: "run_started",
    ts,
    runId,
    config: {
      model: config.model,
      reasoning: config.reasoning,
      approval: config.approval,
      sandbox: config.sandbox,
      loopDelaySec: config.loopDelaySec,
      maxTurns: config.maxTurns,
    },
  };
}

function createRunUpdatedEvent(runId: string, ts: string, status: string): RunEvent {
  return {
    type: "run_updated",
    ts,
    runId,
    status,
  };
}

function createRunResumedEvent(runId: string, ts: string): RunEvent {
  return {
    type: "run_resumed",
    ts,
    runId,
  };
}

function createRunPausedEvent(runId: string, ts: string, reason: RunPauseReason): RunEvent {
  return {
    type: "run_paused",
    ts,
    runId,
    reason,
  };
}

function createRunCancelledEvent(runId: string, ts: string, reason: RunCancelReason): RunEvent {
  return {
    type: "run_cancelled",
    ts,
    runId,
    reason,
  };
}

function createRunCompletedEvent(runId: string, ts: string): RunEvent {
  return {
    type: "run_completed",
    ts,
    runId,
  };
}

function createRunFailedEvent(runId: string, ts: string, error: RunFailure): RunEvent {
  return {
    type: "run_failed",
    ts,
    runId,
    error,
  };
}

function normalizePauseReason(reason?: string): RunPauseReason {
  if (reason === "error") {
    return "error";
  }
  return "manual";
}

function normalizeCancelReason(reason?: string): RunCancelReason {
  if (reason === "system" || reason === "error") {
    return reason;
  }
  return "manual";
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
