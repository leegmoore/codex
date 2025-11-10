export type RunStatus =
  | "queued"
  | "running"
  | "pausing"
  | "paused"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed";

export type RunPauseReason = "manual" | "error";
export type RunCancelReason = "manual" | "system" | "error";

export interface RunFailure {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface QueuedRunState {
  status: "queued";
}

export interface RunningRunState {
  status: "running";
}

export interface PausingRunState {
  status: "pausing";
  reason: RunPauseReason;
}

export interface PausedRunState {
  status: "paused";
  reason: RunPauseReason;
}

export interface CancellingRunState {
  status: "cancelling";
  reason: RunCancelReason;
}

export interface CancelledRunState {
  status: "cancelled";
  reason: RunCancelReason;
}

export interface CompletedRunState {
  status: "completed";
}

export interface FailedRunState {
  status: "failed";
  error: RunFailure;
}

export type RunState =
  | QueuedRunState
  | RunningRunState
  | PausingRunState
  | PausedRunState
  | CancellingRunState
  | CancelledRunState
  | CompletedRunState
  | FailedRunState;

export type RunStateEvent =
  | { type: "worker_started" }
  | { type: "pause_requested"; reason?: RunPauseReason }
  | { type: "pause_acknowledged" }
  | { type: "resume_requested" }
  | { type: "cancel_requested"; reason?: RunCancelReason }
  | { type: "cancel_acknowledged" }
  | { type: "run_completed" }
  | { type: "run_failed"; error: RunFailure };

export interface RunEvent {
  type: string;
  ts: string;
  runId: string;
  [key: string]: unknown;
}

export type RunControlType = "pause" | "resume" | "cancel";

export interface RunControlMessage {
  type: RunControlType;
  ts: string;
  runId: string;
  reason?: string;
}

export interface ContinuousRunWatchConfig {
  include: string[];
  exclude: string[];
}

export interface ContinuousRunCompletionConfig {
  pattern: string;
  scanTailLines: number;
}

export interface ContinuousRunConfig {
  workingDir: string;
  loopDelaySec: number;
  model: string;
  reasoning: string;
  approval: string;
  sandbox: string;
  completion: ContinuousRunCompletionConfig;
  watch: ContinuousRunWatchConfig;
  maxTurns: number | null;
  env: Record<string, string>;
}

export interface RunSnapshot {
  runId: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  epicId?: string;
  streamKey: string;
  config?: ContinuousRunConfig;
  currentTurn?: number;
  pid?: number;
  stats?: {
    turns: number;
    tokens: number;
  };
  completion?: {
    detected: boolean;
    line?: string;
  };
  error?: RunFailure;
}

export interface RunSummary {
  runId: string;
  status: RunStatus;
  epicId?: string;
  createdAt: string;
  updatedAt: string;
  pid?: number;
  currentTurn?: number;
  stats?: {
    turns: number;
    tokens: number;
  };
  completion?: {
    detected: boolean;
    line?: string;
  };
  error?: RunFailure;
}
