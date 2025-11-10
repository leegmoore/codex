import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  ReadableStream as ReadableStreamType,
  WritableStream as WritableStreamType,
} from "node:stream/web";

import type {
  RunTurnContext,
  RunTurnHandler,
  RunTurnResult,
  TurnTokenUsage,
} from "./run-worker";
import type { RunCancelReason, RunEvent, RunFailure } from "./types";

const DEFAULT_TURN_PROMPT = `# Cody's Turn Prompt

You are **Cody**, an autonomous coding agent working on the Codex CLI → TypeScript port.

## End-to-End Process (CRITICAL)

### 1. At Session Start (READ FIRST)
- Read codys-log.md to understand current state and next task
- Review decision-log.md for past technical decisions

### 2. During Work (TEST-FIRST ALWAYS)
- Follow the test-first workflow:
  1. Read Rust implementation and tests
  2. Port tests to Bun test format
  3. Run tests (expect RED - verify failing for right reasons)
  4. Implement tool to satisfy tests
  5. Iterate until tests GREEN
- Document decisions in decision-log.md as you make them
- If uncertain: make best judgment, optionally write questions to .cody-harness/user-feedback-questions.md (file on disk, not in prompt), keep moving

### 3. At Session End (MUST DO)
- Update codys-log.md with:
  - What was completed (be specific, include test counts)
  - Current status (what you're in the middle of)
  - Next steps (what to do next session)
  - Any blockers or questions
- Ensure all decisions logged in decision-log.md

## Your Current Mission

**Feature 9: Continuous Run Endpoint + list_dir Fix**

**Part 1 - Continuous Run API (Primary):**
- Replace shell-script harness with production API endpoint
- POST /api/runs/continuous - Start continuous run, return run ID
- GET /api/runs/:id/stream - SSE endpoint for real-time events from Redis Stream
- POST /api/runs/:id/control - Send control messages (pause/resume/stop)
- GET /api/runs/:id/status - Get current run state
- Redis Streams for event persistence and replay
- In-process worker for subprocess execution
- State machine: QUEUED → RUNNING → PAUSED → COMPLETED/FAILED

**Part 2 - list_dir Pagination Fix (Secondary):**
- Fix list_dir tool pagination ordering
- Implement global alphabetic sort before pagination (Option A from design doc)
- Replace current hybrid BFS/sort behavior with predictable ordering

**Success Criteria:** All API endpoints working, Redis integration complete, state machine valid, runs execute and stream to UI, list_dir pagination stable across pages, all tests passing.

## Key Principles (DO NOT SKIP)

- **Test-first ALWAYS**: Write tests → verify red → implement → verify green
- **Follow the design**: Implement according to continuous-run-design.md and list-dir-pagination-options.md
- **Redis Streams**: Use codi:api:* key pattern, persist all events
- **Document everything**: Every decision, every question, every uncertainty
- **Keep moving**: If uncertain, make best judgment, log it, continue
- **Start simple**: Skip optional features (file watching, test parsing) unless time permits

## Completion Signal

When your work is complete and you're ready to stop, create a stop file:

\`\`\`bash
#!/bin/bash
touch .cody-harness/current-epic/.stop
\`\`\`

This will gracefully stop the continuous run loop after the current turn finishes.

---

**NOW: Read the CURRENT STATE section below (your logs), then execute the task. The reference guide follows after.**

---`;

const REFERENCE_FILES = [
  "continuous-run-design.md",
  "continuous-run-endpoint-story.md",
  "list-dir-pagination-options.md",
];

export interface SpawnedProcess {
  stdin: WritableStreamType<Uint8Array> | null;
  stdout: ReadableStreamType<Uint8Array> | null;
  stderr: ReadableStreamType<Uint8Array> | null;
  exited: Promise<number>;
  exitCode: number | null;
  pid: number | null;
  kill(code?: number | NodeJS.Signals): void;
}

export interface ProcessRunnerSpawnOptions {
  cwd: string;
  env: Record<string, string>;
}

export interface ProcessRunner {
  spawn(cmd: string[], options: ProcessRunnerSpawnOptions): SpawnedProcess;
}

export interface DefaultRunTurnHandlerOptions {
  processRunner?: ProcessRunner;
  harnessRoot?: string;
  promptOutputDir?: string;
  now?: () => Date;
  terminationGraceMs?: number;
  subprocessThrottle?: {
    maxBytesPerEvent?: number;
    maxEventsPerInterval?: number;
    intervalMs?: number;
    clock?: () => number;
    sleep?: (ms: number) => Promise<void>;
  };
}

interface SubprocessThrottleConfig {
  maxBytesPerEvent: number;
  maxEventsPerInterval: number;
  intervalMs: number;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
}

export function createDefaultRunTurnHandler(
  options: DefaultRunTurnHandlerOptions = {},
): RunTurnHandler {
  const processRunner = options.processRunner ?? new BunProcessRunner();
  const nowFn = options.now ?? (() => new Date());
  const promptOutputDir = options.promptOutputDir ?? join(tmpdir(), "cody-prompts");
  const throttleConfig: SubprocessThrottleConfig = {
    maxBytesPerEvent: Math.max(1, options.subprocessThrottle?.maxBytesPerEvent ?? 2 * 1024),
    maxEventsPerInterval: Math.max(1, options.subprocessThrottle?.maxEventsPerInterval ?? 10),
    intervalMs: Math.max(1, options.subprocessThrottle?.intervalMs ?? 1000),
    clock: options.subprocessThrottle?.clock ?? (() => Date.now()),
    sleep: options.subprocessThrottle?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  const terminationGraceMs = Math.max(0, options.terminationGraceMs ?? 5_000);

  return async function defaultRunTurn(context: RunTurnContext): Promise<RunTurnResult> {
    if (context.signal.aborted) {
      return {
        status: "cancelled",
        events: [],
        reason: normalizeCancelReason(context.signal.reason),
      };
    }

    const { runId, epicId, config } = context;
    const harnessRoot = options.harnessRoot ?? resolve(config.workingDir, "..", ".cody-harness");
    const epicDir = join(harnessRoot, epicId);
    const codysLogPath = join(epicDir, "codys-log.md");
    const decisionLogPath = join(harnessRoot, "decision-log.md");

    const logTrackers = await Promise.all([
      createLogTracker("codys-log", codysLogPath),
      createLogTracker("decision-log", decisionLogPath),
    ]);

    await mkdir(promptOutputDir, { recursive: true });
    const promptText = await buildPrompt({
      harnessRoot,
      epicDir,
    });
    const promptPath = join(promptOutputDir, `cody-prompt-${runId}.md`);
    await writeFile(promptPath, promptText, "utf8");

    if (context.signal.aborted) {
      return {
        status: "cancelled",
        events: [],
        reason: normalizeCancelReason(context.signal.reason),
      };
    }

    const encoder = new TextEncoder();
    const writerData = encoder.encode(promptText);

    const command = buildCommand(config);
    const env = buildEnv(config.env);
    const cwd = resolve(config.workingDir);

    let spawned: SpawnedProcess;
    try {
      spawned = processRunner.spawn(command, { cwd, env });
    } catch (error) {
      return buildSpawnFailureResult(runId, context.turn, nowFn, error);
    }

    if (!spawned.stdin || !spawned.stdout || !spawned.stderr) {
      return {
        status: "failure",
        events: [],
        error: {
          code: "spawn_failure",
          message: "codex exec stdio pipes unavailable",
        },
      };
    }

    const events: RunEvent[] = [];
    const startedAt = nowFn().toISOString();
    events.push({
      type: "turn_started",
      ts: startedAt,
      runId,
      turn: context.turn,
    });

    const abortState = createAbortState(context.signal, spawned, terminationGraceMs);

    try {
      const writer = spawned.stdin.getWriter();
      await writer.write(writerData);
      await writer.close();
    } catch (error) {
      spawned.kill();
      return {
        status: "failure",
        events,
        error: {
          code: "stdin_write_failed",
          message: `Failed to write prompt to codex exec: ${String(error)}`,
        },
      };
    }

    const stdoutPromise = collectStream(
      spawned.stdout,
      runId,
      context.turn,
      "stdout",
      nowFn,
      throttleConfig,
    );
    const stderrPromise = collectStream(
      spawned.stderr,
      runId,
      context.turn,
      "stderr",
      nowFn,
      throttleConfig,
    );
    if (spawned.pid != null) {
      await context.onPid?.(spawned.pid);
    }

    const exitCode = await spawned.exited;
    abortState.dispose();

    events.push(...await stdoutPromise);
    events.push(...await stderrPromise);
    // Give the event loop a chance to flush pending log writes triggered during the turn.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const logEvents = await collectLogUpdates(logTrackers, runId, nowFn);
    if (logEvents.length > 0) {
      events.push(...logEvents);
    }

    if (abortState.aborted) {
      return {
        status: "cancelled",
        events,
        reason: abortState.reason,
      };
    }

    if (exitCode !== 0) {
      const failureEventTime = nowFn().toISOString();
      events.push({
        type: "turn_failed",
        ts: failureEventTime,
        runId,
        turn: context.turn,
        exitCode,
      });
      const failure: RunFailure = {
        code: "subprocess_exit",
        message: `codex exec exited with code ${exitCode}`,
      };
      return {
        status: "failure",
        events,
        error: failure,
      };
    }

    const completion = await detectCompletion(epicDir, config.completion);
    const tokenUsage = extractTokenUsageFromEvents(events);
    const completionTs = nowFn().toISOString();
    const turnCompletedEvent: RunEvent = {
      type: "turn_completed",
      ts: completionTs,
      runId,
      turn: context.turn,
    };
    if (tokenUsage) {
      turnCompletedEvent.tokenUsage = tokenUsage;
    }

    events.push(turnCompletedEvent);

    const shouldContinue = shouldContinueRun(context, completion);

    const turnResult: RunTurnResult = {
      status: "success",
      events,
      shouldContinue,
      completion,
    };

    if (tokenUsage) {
      turnResult.tokenUsage = tokenUsage;
    }

    return turnResult;
  };
}

async function buildPrompt(options: { harnessRoot: string; epicDir: string }): Promise<string> {
  const { harnessRoot, epicDir } = options;
  const sections: string[] = [];
  sections.push(DEFAULT_TURN_PROMPT);
  sections.push("\n\n=== CURRENT STATE (READ THIS FIRST) ===\n\n");

  const codysLog = await readIfExists(join(epicDir, "codys-log.md"));
  if (codysLog) {
    sections.push("## CODYS-LOG.MD (Project Overview & Current Epic)\n\n");
    sections.push(codysLog.trimEnd());
    sections.push("\n\n");
  }

  const decisionLog = await readIfExists(join(harnessRoot, "decision-log.md"));
  if (decisionLog) {
    sections.push("## DECISION-LOG.MD (Technical Decisions History)\n\n");
    sections.push(decisionLog.trimEnd());
    sections.push("\n\n");
  }

  const referenceDocs = await loadReferenceDocs(epicDir);
  if (referenceDocs.length > 0) {
    sections.push("=== COMPREHENSIVE REFERENCE GUIDE ===\n\n");
    sections.push(referenceDocs.join("\n\n"));
    sections.push("\n\n");
  }

  sections.push("=== BEGIN WORK ===\n\n");
  sections.push("Execute your current task following the test-first process. Update logs before finishing.\n");

  return sections.join("");
}

async function loadReferenceDocs(epicDir: string): Promise<string[]> {
  const docs: string[] = [];
  for (const fileName of REFERENCE_FILES) {
    const fullPath = join(epicDir, fileName);
    const contents = await readIfExists(fullPath);
    if (contents) {
      docs.push(contents.trimEnd());
    }
  }
  return docs;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function buildCommand(config: RunTurnContext["config"]): string[] {
  return [
    "codex",
    "exec",
    "--model",
    config.model,
    "--config",
    `model_reasoning_effort=${config.reasoning}`,
    "--config",
    `approval_policy=${config.approval}`,
    "--sandbox",
    config.sandbox,
    "--skip-git-repo-check",
  ];
}

function buildEnv(overrides: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      base[key] = value;
    }
  }
  for (const [key, value] of Object.entries(overrides)) {
    base[key] = String(value);
  }
  return base;
}

async function collectStream(
  stream: ReadableStreamType<Uint8Array>,
  runId: string,
  turn: number,
  which: "stdout" | "stderr",
  nowFn: () => Date,
  throttle: SubprocessThrottleConfig,
): Promise<RunEvent[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: RunEvent[] = [];

  let telemetryBuffer = "";
  const takeToken = createRateLimiter(throttle);

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    const chunkText = decoder.decode(value, { stream: true });
    if (chunkText.length === 0) {
      continue;
    }
    await emitChunk(chunkText);
    telemetryBuffer = processTelemetryBuffer({
      buffer: telemetryBuffer + chunkText,
      runId,
      nowFn,
      target: events,
    });
  }

  const tail = decoder.decode();
  if (tail.length > 0) {
    await emitChunk(tail);
    telemetryBuffer = processTelemetryBuffer({
      buffer: telemetryBuffer + tail,
      runId,
      nowFn,
      target: events,
    });
  }

  if (telemetryBuffer.trim().length > 0) {
    telemetryBuffer = processTelemetryBuffer({
      buffer: telemetryBuffer,
      runId,
      nowFn,
      target: events,
      flushRemainder: true,
    });
  }

  return events;

  async function emitChunk(text: string): Promise<void> {
    const segments = splitByByteLength(text, throttle.maxBytesPerEvent);
    for (const segment of segments) {
      await takeToken();
      events.push({
        type: "subprocess_output",
        ts: nowFn().toISOString(),
        runId,
        turn,
        stream: which,
        text: segment,
      });
    }
  }
}

function createRateLimiter(config: SubprocessThrottleConfig): () => Promise<void> {
  const capacity = config.maxEventsPerInterval;
  let tokens = capacity;
  let windowEnd = config.clock() + config.intervalMs;

  return async function takeToken(): Promise<void> {
    while (true) {
      const now = config.clock();
      if (now >= windowEnd) {
        tokens = capacity;
        windowEnd = now + config.intervalMs;
      }
      if (tokens > 0) {
        tokens -= 1;
        return;
      }
      const waitMs = Math.max(1, windowEnd - now);
      await config.sleep(waitMs);
    }
  };
}

function splitByByteLength(text: string, maxBytes: number): string[] {
  if (text.length === 0) {
    return [];
  }

  const segments: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of text) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (current.length > 0 && currentBytes + charBytes > maxBytes) {
      segments.push(current);
      current = "";
      currentBytes = 0;
    }

    if (charBytes > maxBytes && current.length === 0) {
      segments.push(char);
      current = "";
      currentBytes = 0;
      continue;
    }

    current += char;
    currentBytes += charBytes;
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

interface ProcessTelemetryBufferOptions {
  buffer: string;
  runId: string;
  nowFn: () => Date;
  target: RunEvent[];
  flushRemainder?: boolean;
}

function processTelemetryBuffer(options: ProcessTelemetryBufferOptions): string {
  const { buffer, runId, nowFn, target, flushRemainder = false } = options;
  let working = buffer;

  const emitFromLine = (line: string) => {
    const telemetryEvents = parseTelemetryLine(line, runId, nowFn);
    if (telemetryEvents.length > 0) {
      target.push(...telemetryEvents);
    }
  };

  while (true) {
    const newlineIdx = working.indexOf("\n");
    if (newlineIdx === -1) {
      break;
    }
    const line = working.slice(0, newlineIdx);
    working = working.slice(newlineIdx + 1);
    emitFromLine(line);
  }

  if (flushRemainder && working.trim().length > 0) {
    emitFromLine(working);
    return "";
  }

  return working;
}

function parseTelemetryLine(line: string, runId: string, nowFn: () => Date): RunEvent[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object") {
    return [];
  }

  const envelope = (parsed as Record<string, unknown>).__cody_event__;
  if (!envelope || typeof envelope !== "object") {
    return [];
  }

  const payload = { ...(envelope as Record<string, unknown>) };
  const rawType = payload.type;
  if (typeof rawType !== "string" || rawType.length === 0) {
    return [];
  }

  delete payload.type;

  const event: RunEvent = {
    type: rawType,
    ts: nowFn().toISOString(),
    runId,
    ...payload,
  };

  return [event];
}

function shouldContinueRun(context: RunTurnContext, completion: CompletionResult): boolean {
  if (typeof context.config.maxTurns === "number" && context.config.maxTurns > 0) {
    if (context.turn >= context.config.maxTurns) {
      return false;
    }
  }
  return !completion.detected;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTokenUsageFromEvents(events: RunEvent[]): TurnTokenUsage | undefined {
  let usage: TurnTokenUsage | undefined;
  for (const event of events) {
    if (event.type === "token_usage") {
      const candidate = normalizeTokenUsagePayload(event);
      if (candidate) {
        usage = candidate;
      }
      continue;
    }
    if (event.type === "turn_completed") {
      const candidate = normalizeTokenUsagePayload((event as { tokenUsage?: unknown }).tokenUsage);
      if (candidate) {
        usage = candidate;
      }
    }
  }
  return usage;
}

function normalizeTokenUsagePayload(raw: unknown): TurnTokenUsage | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const payload = raw as Record<string, unknown>;
  const inputTokens =
    toNumber(
      payload.inputTokens ??
        payload.input_tokens ??
        payload.promptTokens ??
        payload.prompt_tokens,
    ) ?? 0;
  const outputTokens =
    toNumber(
      payload.outputTokens ??
        payload.output_tokens ??
        payload.completionTokens ??
        payload.completion_tokens,
    ) ?? 0;
  const totalTokens =
    toNumber(payload.totalTokens ?? payload.total_tokens) ?? inputTokens + outputTokens;

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

function buildSpawnFailureResult(
  runId: string,
  turn: number,
  nowFn: () => Date,
  error: unknown,
): RunTurnResult {
  const timestamp = nowFn().toISOString();
  const message = `Failed to spawn codex exec: ${formatError(error)}`;
  const events: RunEvent[] = [
    {
      type: "turn_started",
      ts: timestamp,
      runId,
      turn,
    },
    {
      type: "error",
      ts: timestamp,
      runId,
      code: "spawn_error",
      message,
    },
    {
      type: "turn_failed",
      ts: timestamp,
      runId,
      turn,
      error: message,
    },
  ];

  return {
    status: "failure",
    events,
    error: {
      code: "spawn_error",
      message,
    },
  };
}

interface CompletionResult {
  detected: boolean;
  line?: string;
}

async function detectCompletion(epicDir: string, completion: { pattern: string; scanTailLines: number }): Promise<CompletionResult> {
  const logPath = join(epicDir, "codys-log.md");
  const content = await readIfExists(logPath);
  if (!content) {
    return { detected: false };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(completion.pattern, "m");
  } catch {
    return { detected: false };
  }

  const lines = content.split(/\r?\n/);
  const slice = completion.scanTailLines > 0 ? lines.slice(-completion.scanTailLines) : lines;
  for (const line of slice) {
    if (regex.test(line)) {
      return { detected: true, line };
    }
  }
  return { detected: false };
}

function createAbortState(signal: AbortSignal, process: SpawnedProcess, graceMs: number) {
  const state = {
    aborted: false,
    reason: normalizeCancelReason(undefined),
    dispose() {
      signal.removeEventListener("abort", handler);
    },
  } as { aborted: boolean; reason: RunCancelReason; dispose(): void };

  let terminationTriggered = false;

  const handler = () => {
    if (terminationTriggered) {
      return;
    }
    terminationTriggered = true;
    state.aborted = true;
    state.reason = normalizeCancelReason(signal.reason);
    void terminateProcess();
  };

  if (signal.aborted) {
    handler();
    return state;
  }

  signal.addEventListener("abort", handler);
  return state;

  async function terminateProcess(): Promise<void> {
    try {
      process.kill("SIGTERM");
    } catch {
      // ignore failures; process may already be exiting
    }

    const exitedInTime = await Promise.race([
      process.exited
        .then(() => true)
        .catch(() => true),
      delay(graceMs).then(() => false),
    ]);

    if (!exitedInTime) {
      try {
        process.kill("SIGKILL");
      } catch {
        // ignore failures
      }
    }
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function normalizeCancelReason(reason: unknown): RunCancelReason {
  if (reason === "system" || reason === "error") {
    return reason;
  }
  return "manual";
}

type LogKind = "codys-log" | "decision-log";

interface LogTracker {
  kind: LogKind;
  path: string;
  initialContent: string;
  initialLineCount: number;
}

async function createLogTracker(kind: LogKind, path: string): Promise<LogTracker> {
  const initialContent = (await readIfExists(path)) ?? "";
  return {
    kind,
    path,
    initialContent,
    initialLineCount: countLines(initialContent),
  };
}

async function collectLogUpdates(
  trackers: LogTracker[],
  runId: string,
  nowFn: () => Date,
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for (const tracker of trackers) {
    let currentContent = await readIfExists(tracker.path);
    if (currentContent == null) {
      continue;
    }
    if (currentContent === tracker.initialContent) {
      // File writes that land immediately before process exit can race with our initial read.
      // Yield once and re-read so we catch freshly appended log entries.
      await new Promise((resolve) => setTimeout(resolve, 0));
      currentContent = (await readIfExists(tracker.path)) ?? tracker.initialContent;
      if (currentContent === tracker.initialContent) {
        continue;
      }
    }
    const deltaText = computeLogDelta(tracker.initialContent, currentContent);
    if (deltaText.length === 0 && currentContent === tracker.initialContent) {
      continue;
    }
    const currentLineCount = countLines(currentContent);
    const addedLines = Math.max(0, currentLineCount - tracker.initialLineCount);
    const addedBytes = Buffer.byteLength(deltaText, "utf8");
    events.push({
      type: "log_updated",
      ts: nowFn().toISOString(),
      runId,
      kind: tracker.kind,
      path: tracker.path,
      delta: {
        addedBytes,
        addedLines,
        tail: computeLogTail(currentContent, 20),
      },
    });
  }
  return events;
}

function computeLogDelta(previous: string, current: string): string {
  if (previous.length > 0 && current.startsWith(previous)) {
    return current.slice(previous.length);
  }
  return current;
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  const newlineMatches = content.match(/\r?\n/g);
  if (!newlineMatches) {
    return 1;
  }
  if (content.endsWith("\n") || content.endsWith("\r\n")) {
    return newlineMatches.length;
  }
  return newlineMatches.length + 1;
}

function computeLogTail(content: string, maxLines: number): string {
  if (maxLines <= 0 || content.length === 0) {
    return "";
  }
  const lines = content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  const tail = lines.slice(-maxLines);
  return tail.join("\n");
}

class BunProcessRunner implements ProcessRunner {
  spawn(cmd: string[], options: ProcessRunnerSpawnOptions): SpawnedProcess {
    const subprocess = Bun.spawn({
      cmd,
      cwd: options.cwd,
      env: options.env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    return {
      stdin: subprocess.stdin ?? null,
      stdout: subprocess.stdout ?? null,
      stderr: subprocess.stderr ?? null,
      exited: subprocess.exited,
      exitCode: subprocess.exitCode,
      pid: typeof subprocess.pid === "number" ? subprocess.pid : null,
      kill(code?: number | NodeJS.Signals) {
        subprocess.kill(code);
      },
    };
  }
}
