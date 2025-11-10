import { describe, expect, it } from "bun:test";

import {
  InvalidRunStateTransitionError,
  createInitialRunState,
  isTerminalRunState,
  transitionRunState,
} from "../../src/runs/state-machine";

describe("run state machine", () => {
  it("starts queued and is not terminal", () => {
    const state = createInitialRunState();
    expect(state).toEqual({ status: "queued" });
    expect(isTerminalRunState(state)).toBe(false);
  });

  it("transitions from queued to running when the worker starts", () => {
    const initial = createInitialRunState();
    const running = transitionRunState(initial, { type: "worker_started" });
    expect(running).toEqual({ status: "running" });
  });

  it("supports manual pause flow", () => {
    let state = createInitialRunState();
    state = transitionRunState(state, { type: "worker_started" });
    state = transitionRunState(state, { type: "pause_requested", reason: "manual" });
    expect(state).toEqual({ status: "pausing", reason: "manual" });

    state = transitionRunState(state, { type: "pause_acknowledged" });
    expect(state).toEqual({ status: "paused", reason: "manual" });
    expect(isTerminalRunState(state)).toBe(false);

    state = transitionRunState(state, { type: "resume_requested" });
    expect(state).toEqual({ status: "running" });
  });

  it("supports cancelling a running run", () => {
    let state = createInitialRunState();
    state = transitionRunState(state, { type: "worker_started" });

    state = transitionRunState(state, { type: "cancel_requested", reason: "manual" });
    expect(state).toEqual({ status: "cancelling", reason: "manual" });

    state = transitionRunState(state, { type: "cancel_acknowledged" });
    expect(state).toEqual({ status: "cancelled", reason: "manual" });
    expect(isTerminalRunState(state)).toBe(true);
  });

  it("allows cancelling before the run starts", () => {
    let state = createInitialRunState();
    state = transitionRunState(state, { type: "cancel_requested", reason: "manual" });
    expect(state).toEqual({ status: "cancelling", reason: "manual" });

    state = transitionRunState(state, { type: "cancel_acknowledged" });
    expect(state).toEqual({ status: "cancelled", reason: "manual" });
  });

  it("marks the run as completed", () => {
    const started = transitionRunState(createInitialRunState(), { type: "worker_started" });
    const completed = transitionRunState(started, { type: "run_completed" });
    expect(completed).toEqual({ status: "completed" });
    expect(isTerminalRunState(completed)).toBe(true);
  });

  it("marks the run as failed with error information", () => {
    const started = transitionRunState(createInitialRunState(), { type: "worker_started" });
    const failed = transitionRunState(started, {
      type: "run_failed",
      error: { code: "spawn_error", message: "failed to spawn process" },
    });
    expect(failed).toEqual({
      status: "failed",
      error: { code: "spawn_error", message: "failed to spawn process" },
    });
    expect(isTerminalRunState(failed)).toBe(true);
  });

  it("rejects invalid transitions", () => {
    const initial = createInitialRunState();
    expect(() => transitionRunState(initial, { type: "pause_requested", reason: "manual" })).toThrow(
      InvalidRunStateTransitionError,
    );

    const paused = transitionRunState(
      transitionRunState(
        transitionRunState(createInitialRunState(), { type: "worker_started" }),
        { type: "pause_requested", reason: "manual" },
      ),
      { type: "pause_acknowledged" },
    );

    expect(() => transitionRunState(paused, { type: "run_completed" })).toThrow(
      InvalidRunStateTransitionError,
    );
  });

  it("prevents transitions from terminal states", () => {
    const completed = transitionRunState(
      transitionRunState(createInitialRunState(), { type: "worker_started" }),
      { type: "run_completed" },
    );

    expect(() => transitionRunState(completed, { type: "resume_requested" })).toThrow(
      InvalidRunStateTransitionError,
    );
  });
});
