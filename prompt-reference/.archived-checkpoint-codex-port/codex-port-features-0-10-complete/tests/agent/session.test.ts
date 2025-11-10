import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_DATA_DIR = process.env.CODEX_PORT_DATA_DIR;

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "codex-session-test-"));
  process.env.CODEX_PORT_DATA_DIR = dataDir;
});

afterEach(async () => {
  process.env.CODEX_PORT_DATA_DIR = ORIGINAL_DATA_DIR;
  await rm(dataDir, { recursive: true, force: true });
});

function expectIsoTimestamp(value: string, expectedIso: string) {
  expect(value).toBe(expectedIso);
}

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

describe("session persistence", () => {
  it("creates a session file with metadata and loads it", async () => {
    const { createSession, loadSession } = await import("../../src/agent/session");

    const now = new Date("2025-10-22T15:30:00Z");
    const session = await createSession("session-123", {
      instructions: "system instructions",
      now: () => now,
    });

    expect(session.session.id).toBe("session-123");
    expectIsoTimestamp(session.session.timestamp, "2025-10-22T15:30:00.000Z");
    expect(session.session.instructions).toBe("system instructions");
    expect(session.items).toEqual([]);

    await stat(session.filePath);
    const files = await listSessionFiles(dataDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toBe("rollout-2025-10-22-session-123.json");

    const loaded = await loadSession("session-123");
    expect(loaded.session).toEqual(session.session);
    expect(loaded.items).toEqual([]);
  });

  it("saves changes to the session file", async () => {
    const { createSession, loadSession, saveSession } = await import("../../src/agent/session");

    const session = await createSession("save-test", {
      instructions: "initial",
      now: () => new Date("2025-10-22T10:00:00Z"),
    });

    session.items.push({
      role: "user",
      content: [{ type: "input_text", text: "hello world" }],
    });

    await saveSession(session);

    const reloaded = await loadSession("save-test");
    expect(reloaded.items).toEqual(session.items);
  });

  it("appends history entries as JSON lines", async () => {
    const { createSession, appendHistory } = await import("../../src/agent/session");

    await createSession("history-session", {
      instructions: "history",
      now: () => new Date("2025-10-22T11:00:00Z"),
    });

    const timestamp = new Date("2025-10-22T11:15:30Z");
    await appendHistory("history-session", "first message", timestamp);

    const historyPath = join(dataDir, "history.jsonl");
    const content = await readFile(historyPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toEqual({
      session_id: "history-session",
      ts: Math.floor(timestamp.getTime() / 1000),
      text: "first message",
    });
  });

  it("lists sessions sorted by recency", async () => {
    const { createSession, listSessions } = await import("../../src/agent/session");

    await createSession("old-session", {
      instructions: "older",
      now: () => new Date("2025-10-21T09:00:00Z"),
    });
    await createSession("new-session", {
      instructions: "newer",
      now: () => new Date("2025-10-22T09:00:00Z"),
    });

    const summaries = await listSessions();
    expect(summaries.map((s) => s.id)).toEqual(["new-session", "old-session"]);
    expect(summaries[0].instructions).toBe("newer");
  });

  it("reads the full history file", async () => {
    const { createSession, appendHistory, readHistory } = await import("../../src/agent/session");

    await createSession("history-a", {
      instructions: "A",
      now: () => new Date("2025-10-22T09:00:00Z"),
    });
    await createSession("history-b", {
      instructions: "B",
      now: () => new Date("2025-10-22T10:00:00Z"),
    });

    await appendHistory("history-a", "first message", new Date("2025-10-22T09:05:00Z"));
    await appendHistory("history-b", "second message", new Date("2025-10-22T10:15:30Z"));

    const entries = await readHistory();
    expect(entries).toEqual([
      {
        session_id: "history-a",
        ts: 1_761_123_900,
        text: "first message",
      },
      {
        session_id: "history-b",
        ts: 1_761_128_130,
        text: "second message",
      },
    ]);
  });

  it("filters history by session id", async () => {
    const { createSession, appendHistory, readHistory } = await import("../../src/agent/session");

    await createSession("filter-history", {
      instructions: "filter",
      now: () => new Date("2025-10-22T12:00:00Z"),
    });

    await appendHistory("filter-history", "first", new Date("2025-10-22T12:01:00Z"));
    await appendHistory("other-session", "skip", new Date("2025-10-22T12:02:00Z"));
    await appendHistory("filter-history", "second", new Date("2025-10-22T12:03:00Z"));

    const entries = await readHistory("filter-history");
    expect(entries).toEqual([
      {
        session_id: "filter-history",
        ts: 1_761_134_460,
        text: "first",
      },
      {
        session_id: "filter-history",
        ts: 1_761_134_580,
        text: "second",
      },
    ]);
  });

  it("limits history entries to the most recent N messages", async () => {
    const { createSession, appendHistory, readHistory } = await import("../../src/agent/session");

    await createSession("limit-history", {
      instructions: "limit",
      now: () => new Date("2025-10-22T12:30:00Z"),
    });

    await appendHistory("limit-history", "first", new Date("2025-10-22T12:31:00Z"));
    await appendHistory("limit-history", "second", new Date("2025-10-22T12:32:00Z"));
    await appendHistory("limit-history", "third", new Date("2025-10-22T12:33:00Z"));

    const limited = await readHistory(undefined, { limit: 2 });
    expect(limited).toEqual([
      {
        session_id: "limit-history",
        ts: 1_761_136_320,
        text: "second",
      },
      {
        session_id: "limit-history",
        ts: 1_761_136_380,
        text: "third",
      },
    ]);

    const filteredLimit = await readHistory("limit-history", { limit: 1 });
    expect(filteredLimit).toEqual([
      {
        session_id: "limit-history",
        ts: 1_761_136_380,
        text: "third",
      },
    ]);
  });
});
