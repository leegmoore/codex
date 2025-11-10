import { RedisClient } from "bun";

import type { RunControlMessage, RunEvent } from "./types";

const DEFAULT_STREAM_MAXLEN = 50_000;
const RUN_LOCK_REFRESH_SCRIPT = `
  local current = redis.call('GET', KEYS[1])
  if not current then return 0 end
  if current ~= ARGV[1] then return -1 end
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
  return 1
`;
const RUN_LOCK_RELEASE_SCRIPT = `
  local current = redis.call('GET', KEYS[1])
  if not current then return 0 end
  if current ~= ARGV[1] then return -1 end
  redis.call('DEL', KEYS[1])
  return 1
`;

export interface RunsRedisOptions {
  url?: string;
  client?: RedisClient;
  streamMaxLen?: number;
}

export interface ReadRunEventsOptions {
  blockMs?: number;
  count?: number;
}

export interface RunStreamEntry<TEvent extends RunEvent = RunEvent> {
  id: string;
  event: TEvent;
}

export interface RunControlEntry {
  id: string;
  message: RunControlMessage;
}

export interface RunIndexEntry {
  runId: string;
  score: number;
}

export interface RunEventsStreamInfo {
  length: number;
  firstEntryId: string | null;
  lastEntryId: string | null;
}

export interface RunsRedis {
  client: RedisClient;
  appendRunEvent(runId: string, event: RunEvent): Promise<string>;
  readRunEvents(runId: string, lastId: string, options?: ReadRunEventsOptions): Promise<RunStreamEntry[]>;
  setRunMeta(runId: string, values: Record<string, string | number | boolean | null | undefined>): Promise<void>;
  getRunMeta(runId: string): Promise<Record<string, string>>;
  appendRunControlMessage(runId: string, message: RunControlMessage): Promise<string>;
  readRunControlMessages(
    runId: string,
    lastId: string,
    options?: ReadRunEventsOptions,
  ): Promise<RunControlEntry[]>;
  acquireRunLock(runId: string, workerId: string, ttlMs: number): Promise<boolean>;
  refreshRunLock(runId: string, workerId: string, ttlMs: number): Promise<boolean>;
  releaseRunLock(runId: string, workerId: string): Promise<void>;
  addRunToIndex(runId: string, score: number): Promise<void>;
  listRunsFromIndex(limit: number): Promise<RunIndexEntry[]>;
  deleteRunData(runId: string): Promise<void>;
  getRunEventsInfo(runId: string): Promise<RunEventsStreamInfo | null>;
  close(): Promise<void>;
}

export async function createRunsRedis(options: RunsRedisOptions = {}): Promise<RunsRedis> {
  const { client: providedClient, url, streamMaxLen = DEFAULT_STREAM_MAXLEN } = options;
  const client = providedClient ?? (url ? new RedisClient(url) : new RedisClient());

  if (!client.connected) {
    await client.connect();
  }

  async function appendRunEvent(runId: string, event: RunEvent): Promise<string> {
    if (event.runId !== runId) {
      throw new Error(`event.runId (${event.runId}) does not match runId (${runId})`);
    }

    const args = [
      runEventsStreamKey(runId),
      "MAXLEN",
      "~",
      streamMaxLen.toString(),
      "*",
      "type",
      event.type,
      "ts",
      event.ts,
      "runId",
      event.runId,
      "payload",
      JSON.stringify(event),
    ];

    const result = await client.send("XADD", args);
    if (typeof result !== "string") {
      throw new Error("failed to append run event");
    }
    return result;
  }

  async function readRunEvents(
    runId: string,
    lastId: string,
    options: ReadRunEventsOptions = {},
  ): Promise<RunStreamEntry[]> {
    const args: string[] = [];
    if (options.blockMs !== undefined) {
      args.push("BLOCK", options.blockMs.toString());
    }
    if (options.count !== undefined) {
      args.push("COUNT", options.count.toString());
    }
    args.push("STREAMS", runEventsStreamKey(runId), lastId);

    const response = await client.send("XREAD", args);
    if (response == null) {
      return [];
    }

    const decoded = decodeStreamResponse<RunEvent>(response);
    return decoded.map(({ id, payload }) => ({
      id,
      event: payload,
    }));
  }

  async function setRunMeta(
    runId: string,
    values: Record<string, string | number | boolean | null | undefined>,
  ): Promise<void> {
    const entries: string[] = [];
    for (const [field, value] of Object.entries(values)) {
      if (value === undefined) {
        continue;
      }
      entries.push(field, serializeMetaValue(value));
    }

    if (entries.length === 0) {
      return;
    }

    await client.send("HSET", [runMetaKey(runId), ...entries]);
  }

  async function getRunMeta(runId: string): Promise<Record<string, string>> {
    const raw = await client.send("HGETALL", [runMetaKey(runId)]);
    if (raw == null) {
      return {};
    }

    const meta: Record<string, string> = {};
    if (Array.isArray(raw)) {
      for (let idx = 0; idx < raw.length; idx += 2) {
        const key = raw[idx];
        const value = raw[idx + 1];
        if (typeof key === "string" && typeof value === "string") {
          meta[key] = value;
        }
      }
      return meta;
    }

    if (typeof raw === "object") {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === "string") {
          meta[key] = value;
        } else if (value != null) {
          meta[key] = String(value);
        }
      }
    }
    return meta;
  }

  async function appendRunControlMessage(runId: string, message: RunControlMessage): Promise<string> {
    if (message.runId !== runId) {
      throw new Error(`message.runId (${message.runId}) does not match runId (${runId})`);
    }

    const args = [
      runControlStreamKey(runId),
      "MAXLEN",
      "~",
      streamMaxLen.toString(),
      "*",
      "type",
      message.type,
      "ts",
      message.ts,
      "runId",
      message.runId,
      "payload",
      JSON.stringify(message),
    ];

    const result = await client.send("XADD", args);
    if (typeof result !== "string") {
      throw new Error("failed to append run control message");
    }
    return result;
  }

  async function readRunControlMessages(
    runId: string,
    lastId: string,
    options: ReadRunEventsOptions = {},
  ): Promise<RunControlEntry[]> {
    const args: string[] = [];
    if (options.blockMs !== undefined) {
      args.push("BLOCK", options.blockMs.toString());
    }
    if (options.count !== undefined) {
      args.push("COUNT", options.count.toString());
    }
    args.push("STREAMS", runControlStreamKey(runId), lastId);

    const response = await client.send("XREAD", args);
    if (response == null) {
      return [];
    }

    const decoded = decodeStreamResponse<RunControlMessage>(response);
    return decoded.map(({ id, payload }) => ({
      id,
      message: payload,
    }));
  }

  async function acquireRunLock(runId: string, workerId: string, ttlMs: number): Promise<boolean> {
    const result = await client.send("SET", [
      runLockKey(runId),
      workerId,
      "NX",
      "PX",
      ttlMs.toString(),
    ]);
    return result === "OK";
  }

  async function refreshRunLock(runId: string, workerId: string, ttlMs: number): Promise<boolean> {
    const result = await client.send("EVAL", [
      RUN_LOCK_REFRESH_SCRIPT,
      "1",
      runLockKey(runId),
      workerId,
      ttlMs.toString(),
    ]);
    return normalizeInteger(result) === 1;
  }

  async function releaseRunLock(runId: string, workerId: string): Promise<void> {
    await client.send("EVAL", [
      RUN_LOCK_RELEASE_SCRIPT,
      "1",
      runLockKey(runId),
      workerId,
    ]);
  }

  async function addRunToIndex(runId: string, score: number): Promise<void> {
    await client.send("ZADD", [runIndexKey(), score.toString(), runId]);
  }

  async function listRunsFromIndex(limit: number): Promise<RunIndexEntry[]> {
    if (limit <= 0) {
      return [];
    }

    const response = await client.send("ZREVRANGE", [
      runIndexKey(),
      "0",
      String(limit - 1),
      "WITHSCORES",
    ]);

    const entries: RunIndexEntry[] = [];

    if (Array.isArray(response)) {
      for (const entry of response) {
        if (Array.isArray(entry) && entry.length >= 2) {
          const [runId, score] = entry;
          if (typeof runId === "string") {
            entries.push({
              runId,
              score: typeof score === "number" ? score : Number.parseFloat(String(score)),
            });
          }
        }
      }

      if (entries.length > 0) {
        return entries;
      }

      for (let idx = 0; idx < response.length; idx += 2) {
        const runId = response[idx];
        const score = response[idx + 1];
        if (typeof runId === "string") {
          entries.push({
            runId,
            score: typeof score === "number" ? score : Number.parseFloat(String(score)),
          });
        }
      }
    }

    return entries;
  }

  async function getRunEventsInfo(runId: string): Promise<RunEventsStreamInfo | null> {
    const response = await client.send("XINFO", ["STREAM", runEventsStreamKey(runId)]);
    if (!response) {
      return null;
    }

    let length = 0;
    let firstEntryId: string | null = null;
    let lastEntryId: string | null = null;

    if (Array.isArray(response)) {
      for (let idx = 0; idx < response.length; idx += 2) {
        const field = response[idx];
        const value = response[idx + 1];

        if (field === "length") {
          length = normalizeInteger(value);
          continue;
        }
        if (field === "first-entry") {
          firstEntryId = extractEntryId(value);
          continue;
        }
        if (field === "last-entry") {
          lastEntryId = extractEntryId(value);
        }
      }
    }

    return {
      length,
      firstEntryId,
      lastEntryId,
    };
  }

  async function deleteRunData(runId: string): Promise<void> {
    await client.send("DEL", [
      runEventsStreamKey(runId),
      runMetaKey(runId),
      runControlStreamKey(runId),
      runLockKey(runId),
    ]);
    await client.send("ZREM", [runIndexKey(), runId]);
  }

  async function close(): Promise<void> {
    client.close();
  }

  return {
    client,
    appendRunEvent,
    readRunEvents,
    setRunMeta,
    getRunMeta,
    appendRunControlMessage,
    readRunControlMessages,
    acquireRunLock,
    refreshRunLock,
    releaseRunLock,
    addRunToIndex,
    listRunsFromIndex,
    deleteRunData,
    getRunEventsInfo,
    close,
  };
}

export function runEventsStreamKey(runId: string): string {
  return `codi:api:run:${runId}:events`;
}

export function runControlStreamKey(runId: string): string {
  return `codi:api:run:${runId}:ctl`;
}

export function runLockKey(runId: string): string {
  return `codi:api:run:${runId}:lock`;
}

export function runMetaKey(runId: string): string {
  return `codi:api:run:${runId}:meta`;
}

export function runIndexKey(): string {
  return "codi:api:runs:index";
}

function serializeMetaValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }
  return String(value);
}

function normalizeInteger(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function extractEntryId(value: unknown): string | null {
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
}

function decodeStreamResponse<TPayload>(response: unknown): Array<{ id: string; payload: TPayload }> {
  const entries: Array<{ id: string; payload: TPayload }> = [];

  if (Array.isArray(response)) {
    for (const element of response) {
      collectStreamEntries(entries, element);
    }
    return entries;
  }

  if (typeof response === "object" && response !== null) {
    for (const element of Object.values(response as Record<string, unknown>)) {
      collectStreamEntries(entries, element);
    }
  }

  return entries;
}

function collectStreamEntries<TPayload>(target: Array<{ id: string; payload: TPayload }>, element: unknown): void {
  if (!Array.isArray(element)) {
    return;
  }

  if (element.length === 2 && Array.isArray(element[1])) {
    processRecordArray(target, element[1]);
    return;
  }

  processRecordArray(target, element);
}

function processRecordArray<TPayload>(target: Array<{ id: string; payload: TPayload }>, records: unknown[]): void {
  for (const record of records) {
    if (!Array.isArray(record) || record.length < 2) {
      continue;
    }
    const [id, fields] = record;
    if (typeof id !== "string" || !Array.isArray(fields)) {
      continue;
    }

    const payload = extractFieldValue(fields, "payload");
    if (typeof payload !== "string") {
      continue;
    }

    let decoded: TPayload;
    try {
      decoded = JSON.parse(payload) as TPayload;
    } catch {
      continue;
    }

    target.push({ id, payload: decoded });
  }
}

function extractFieldValue(fields: unknown[], targetField: string): unknown {
  for (let idx = 0; idx < fields.length; idx += 2) {
    const field = fields[idx];
    const value = fields[idx + 1];
    if (field === targetField) {
      return value;
    }
  }
  return undefined;
}
