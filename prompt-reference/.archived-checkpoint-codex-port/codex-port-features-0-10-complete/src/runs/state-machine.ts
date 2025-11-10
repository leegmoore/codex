import {
  type RunCancelReason,
  type RunPauseReason,
  type RunState,
  type RunStateEvent,
} from "./types";

const TERMINAL_STATUSES = new Set<RunState["status"]>(["cancelled", "completed", "failed"]);

export class InvalidRunStateTransitionError extends Error {
  readonly current: RunState;
  readonly event: RunStateEvent;

  constructor(current: RunState, event: RunStateEvent, message?: string) {
    super(message ?? buildErrorMessage(current, event));
    this.name = "InvalidRunStateTransitionError";
    this.current = current;
    this.event = event;
  }
}

export function createInitialRunState(): RunState {
  return { status: "queued" };
}

export function isTerminalRunState(state: RunState): boolean {
  return TERMINAL_STATUSES.has(state.status);
}

export function transitionRunState(state: RunState, event: RunStateEvent): RunState {
  if (isTerminalRunState(state)) {
    throw new InvalidRunStateTransitionError(state, event, "Cannot transition from terminal state");
  }

  if (state.status === "queued") {
    return handleQueuedState(state, event);
  }

  if (state.status === "running") {
    return handleRunningState(state, event);
  }

  if (state.status === "pausing") {
    return handlePausingState(state, event);
  }

  if (state.status === "paused") {
    return handlePausedState(state, event);
  }

  if (state.status === "cancelling") {
    return handleCancellingState(state, event);
  }

  throw new InvalidRunStateTransitionError(state, event);
}

function handleQueuedState(state: RunState, event: RunStateEvent): RunState {
  if (state.status !== "queued") {
    throw new InvalidRunStateTransitionError(state, event);
  }

  switch (event.type) {
    case "worker_started":
      return { status: "running" };
    case "cancel_requested":
      return {
        status: "cancelling",
        reason: normalizeCancelReason(event.reason),
      };
    default:
      throw new InvalidRunStateTransitionError(state, event);
  }
}

function handleRunningState(state: RunState, event: RunStateEvent): RunState {
  if (state.status !== "running") {
    throw new InvalidRunStateTransitionError(state, event);
  }

  switch (event.type) {
    case "pause_requested":
      return {
        status: "pausing",
        reason: normalizePauseReason(event.reason),
      };
    case "cancel_requested":
      return {
        status: "cancelling",
        reason: normalizeCancelReason(event.reason),
      };
    case "run_completed":
      return { status: "completed" };
    case "run_failed":
      return { status: "failed", error: event.error };
    default:
      throw new InvalidRunStateTransitionError(state, event);
  }
}

function handlePausingState(state: RunState, event: RunStateEvent): RunState {
  if (state.status !== "pausing") {
    throw new InvalidRunStateTransitionError(state, event);
  }

  switch (event.type) {
    case "pause_acknowledged":
      return {
        status: "paused",
        reason: state.reason,
      };
    case "cancel_requested":
      return {
        status: "cancelling",
        reason: normalizeCancelReason(event.reason),
      };
    default:
      throw new InvalidRunStateTransitionError(state, event);
  }
}

function handlePausedState(state: RunState, event: RunStateEvent): RunState {
  if (state.status !== "paused") {
    throw new InvalidRunStateTransitionError(state, event);
  }

  switch (event.type) {
    case "resume_requested":
      return { status: "running" };
    case "cancel_requested":
      return {
        status: "cancelling",
        reason: normalizeCancelReason(event.reason),
      };
    default:
      throw new InvalidRunStateTransitionError(state, event);
  }
}

function handleCancellingState(state: RunState, event: RunStateEvent): RunState {
  if (state.status !== "cancelling") {
    throw new InvalidRunStateTransitionError(state, event);
  }

  switch (event.type) {
    case "cancel_acknowledged":
      return {
        status: "cancelled",
        reason: state.reason,
      };
    default:
      throw new InvalidRunStateTransitionError(state, event);
  }
}

function normalizePauseReason(reason: RunPauseReason | undefined): RunPauseReason {
  return reason ?? "manual";
}

function normalizeCancelReason(reason: RunCancelReason | undefined): RunCancelReason {
  return reason ?? "manual";
}

function buildErrorMessage(state: RunState, event: RunStateEvent): string {
  return `Invalid transition from ${state.status} via ${event.type}`;
}
