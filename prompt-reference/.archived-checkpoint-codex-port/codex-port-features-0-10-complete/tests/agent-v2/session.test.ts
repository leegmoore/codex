import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ResponseItem } from "../../src/protocol/types";

const ORIGINAL_DATA_DIR = process.env.CODEX_PORT_DATA_DIR;

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "codex-v2-session-test-"));
  process.env.CODEX_PORT_DATA_DIR = dataDir;
});

afterEach(async () => {
  process.env.CODEX_PORT_DATA_DIR = ORIGINAL_DATA_DIR;
  await rm(dataDir, { recursive: true, force: true });
});

async function listSessionFiles(baseDir: string): Promise<string[]> {
  try {
    const files = await readdir(join(baseDir, "sessions"));
    return files.sort();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function makeUserItem(text: string): ResponseItem {
  return {
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
  };
}

describe("agent-v2 session persistence", () => {
  it("creates a session file and reloads it with ResponseItem[] payloads", async () => {
    const { createSession, loadSession } = await import("../../src/agent-v2/session");

    const session = await createSession("rollout-123", {
      instructions: "system prompt",
      now: () => new Date("2025-10-26T12:00:00Z"),
    });

    expect(session.session).toEqual({
      id: "rollout-123",
      instructions: "system prompt",
      timestamp: "2025-10-26T12:00:00.000Z",
    });
    expect(session.items).toEqual([]);

    await stat(session.filePath);
    const files = await listSessionFiles(dataDir);
    expect(files).toEqual(["rollout-2025-10-26-rollout-123.json"]);

    const reloaded = await loadSession("rollout-123");
    expect(reloaded.session).toEqual(session.session);
    expect(reloaded.items).toEqual([]);
  });

  it("persists ResponseItem arrays on save", async () => {
    const { createSession, loadSession, saveSession } = await import("../../src/agent-v2/session");

    const session = await createSession("persist-items", {
      now: () => new Date("2025-10-26T13:00:00Z"),
    });

    session.items.push(makeUserItem("inspect foo.ts"));

    await saveSession(session);

    const reloaded = await loadSession("persist-items");
    expect(reloaded.items).toEqual([makeUserItem("inspect foo.ts")]);
  });

  it("appends history entries as JSON lines", async () => {
    const { createSession, appendHistory } = await import("../../src/agent-v2/session");

    await createSession("history-v2", {
      now: () => new Date("2025-10-26T14:00:00Z"),
    });

    const timestamp = new Date("2025-10-26T14:05:06Z");
    await appendHistory("history-v2", "first message", timestamp);

    const content = await readFile(join(dataDir, "history.jsonl"), "utf-8");
    const [line] = content.trim().split("\n");
    expect(JSON.parse(line)).toEqual({
      session_id: "history-v2",
      ts: Math.floor(timestamp.getTime() / 1000),
      text: "first message",
    });
  });

  it("lists sessions sorted by timestamp desc", async () => {
    const { createSession, listSessions } = await import("../../src/agent-v2/session");

    await createSession("older", {
      now: () => new Date("2025-10-26T08:00:00Z"),
    });
    await createSession("newer", {
      now: () => new Date("2025-10-26T09:00:00Z"),
      instructions: "recent",
    });

    const summaries = await listSessions();
    expect(summaries.map((s) => s.id)).toEqual(["newer", "older"]);
    expect(summaries[0].instructions).toBe("recent");
  });

  it("reads history with optional filtering and limit", async () => {
    const { createSession, appendHistory, readHistory } = await import("../../src/agent-v2/session");

    await createSession("history-a", { now: () => new Date("2025-10-26T10:00:00Z") });
    await createSession("history-b", { now: () => new Date("2025-10-26T10:30:00Z") });

    await appendHistory("history-a", "one", new Date("2025-10-26T10:01:00Z"));
    await appendHistory("history-b", "two", new Date("2025-10-26T10:02:00Z"));
    await appendHistory("history-a", "three", new Date("2025-10-26T10:03:00Z"));

    const allEntries = await readHistory();
    expect(allEntries).toEqual([
      { session_id: "history-a", ts: 1_761_472_860, text: "one" },
      { session_id: "history-b", ts: 1_761_472_920, text: "two" },
      { session_id: "history-a", ts: 1_761_472_980, text: "three" },
    ]);

    const filtered = await readHistory("history-a");
    expect(filtered).toEqual([
      { session_id: "history-a", ts: 1_761_472_860, text: "one" },
      { session_id: "history-a", ts: 1_761_472_980, text: "three" },
    ]);

    const limited = await readHistory(undefined, { limit: 2 });
    expect(limited).toEqual([
      { session_id: "history-b", ts: 1_761_472_920, text: "two" },
      { session_id: "history-a", ts: 1_761_472_980, text: "three" },
    ]);
  });
});
