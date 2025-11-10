import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  createRunsRedis,
  runControlStreamKey,
  runEventsStreamKey,
  runIndexKey,
  runMetaKey,
  type RunControlEntry,
  type RunIndexEntry,
  type RunStreamEntry,
} from "../../src/runs/redis";
import type { RunControlMessage, RunEvent } from "../../src/runs/types";

const DEFAULT_BLOCK_MS = 50;
const redisUrl = process.env.REDIS_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis("runs redis helpers", () => {
  let runsRedis: Awaited<ReturnType<typeof createRunsRedis>>;
  let runId: string;

  beforeAll(async () => {
    runsRedis = await createRunsRedis({
      url: redisUrl,
    });
  });

  afterAll(async () => {
    await runsRedis.close();
  });

  afterEach(async () => {
    if (runId) {
      await runsRedis.deleteRunData(runId);
      runId = "";
    }
  });

  test("appendRunEvent stores events that can be read back", async () => {
    runId = `test-${randomUUID()}`;
    const event: RunEvent = {
      type: "run_started",
      ts: new Date().toISOString(),
      runId,
      config: {
        model: "gpt-5-codex",
      },
    };

    const appendedId = await runsRedis.appendRunEvent(runId, event);
    expect(appendedId).toBeDefined();

    const entries = await runsRedis.readRunEvents(runId, "0-0", {
      blockMs: DEFAULT_BLOCK_MS,
      count: 10,
    });

    expect(entries).toEqual<RunStreamEntry[]>([
      {
        id: appendedId,
        event,
      },
    ]);
  });

  test("setRunMeta merges updates and getRunMeta returns strings", async () => {
    runId = `test-${randomUUID()}`;
    await runsRedis.setRunMeta(runId, {
      status: "running",
      currentTurn: 1,
    });

    await runsRedis.setRunMeta(runId, {
      currentTurn: 2,
      updatedAt: "2025-10-27T12:34:56.000Z",
    });

    const meta = await runsRedis.getRunMeta(runId);
    expect(meta).toEqual({
      status: "running",
      currentTurn: "2",
      updatedAt: "2025-10-27T12:34:56.000Z",
    });
  });

  test("run key helpers generate namespaced keys", () => {
    const sampleRunId = "r_123";
    expect(runEventsStreamKey(sampleRunId)).toBe("codi:api:run:r_123:events");
    expect(runMetaKey(sampleRunId)).toBe("codi:api:run:r_123:meta");
    expect(runControlStreamKey(sampleRunId)).toBe("codi:api:run:r_123:ctl");
  });

  test("appendRunControlMessage stores control messages that can be replayed", async () => {
    runId = `test-${randomUUID()}`;
    const control: RunControlMessage = {
      type: "pause",
      ts: new Date().toISOString(),
      runId,
      reason: "manual",
    };

    const appendedId = await runsRedis.appendRunControlMessage(runId, control);
    expect(appendedId).toBeDefined();

    const entries = await runsRedis.readRunControlMessages(runId, "0-0", {
      blockMs: DEFAULT_BLOCK_MS,
      count: 10,
    });

    expect(entries).toEqual<RunControlEntry[]>([
      {
        id: appendedId,
        message: control,
      },
    ]);
  });

  test("addRunToIndex and listRunsFromIndex maintain descending order by score", async () => {
    const firstRunId = `test-${randomUUID()}`;
    const secondRunId = `test-${randomUUID()}`;
    runId = firstRunId;

    await runsRedis.client.send("DEL", [runIndexKey()]);

    const baseScore = Date.now();
    await runsRedis.addRunToIndex(firstRunId, baseScore);
    await runsRedis.addRunToIndex(secondRunId, baseScore + 1000);

    const entries = await runsRedis.listRunsFromIndex(10);
    const filtered = entries.filter((entry) => entry.runId === firstRunId || entry.runId === secondRunId);

    expect(filtered).toEqual<RunIndexEntry[]>([
      { runId: secondRunId, score: baseScore + 1000 },
      { runId: firstRunId, score: baseScore },
    ]);

    expect(runControlStreamKey(firstRunId)).toBe(`codi:api:run:${firstRunId}:control`);
    expect(runIndexKey()).toBe("codi:api:runs:index");

    // cleanup second run id explicitly since afterEach tracks only runId
    await runsRedis.deleteRunData(secondRunId);
  });
});
