import {
  appendFile,
  mkdir,
  readFile as readFileFs,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { ResponseItem } from "../protocol/types";

export interface SessionMetadata {
  id: string;
  timestamp: string;
  instructions: string;
}

export interface SessionData {
  session: SessionMetadata;
  items: ResponseItem[];
  filePath: string;
}

export interface SessionSummary {
  id: string;
  timestamp: string;
  instructions: string;
  path: string;
}

export interface HistoryEntry {
  session_id: string;
  ts: number;
  text: string;
}

export interface ReadHistoryOptions {
  limit?: number;
}

export interface CreateSessionOptions {
  instructions?: string;
  now?: () => Date;
}

const HISTORY_FILE = "history.jsonl";

export async function createSession(
  id: string,
  options: CreateSessionOptions = {},
): Promise<SessionData> {
  const sessionsDir = await ensureSessionsDir();
  const now = options.now?.() ?? new Date();
  const timestamp = now.toISOString();
  const filePath = buildSessionPath(sessionsDir, id, timestamp);

  if (await fileExists(filePath)) {
    throw new Error(`Session already exists: ${id}`);
  }

  const metadata: SessionMetadata = {
    id,
    timestamp,
    instructions: options.instructions ?? "",
  };

  const items: ResponseItem[] = [];
  await writeSessionFile(filePath, metadata, items);

  return {
    session: metadata,
    items,
    filePath,
  };
}

export async function loadSession(id: string): Promise<SessionData> {
  const filePath = await resolveSessionPath(id);
  if (!filePath) {
    throw new Error(`Session not found: ${id}`);
  }

  const { session, items } = await readSessionFile(filePath);
  return {
    session,
    items,
    filePath,
  };
}

export async function saveSession(session: SessionData): Promise<void> {
  await writeSessionFile(session.filePath, session.session, session.items);
}

export async function appendHistory(
  sessionId: string,
  message: string,
  timestamp: Date = new Date(),
): Promise<void> {
  const dataDir = await ensureDataDir();
  const historyPath = join(dataDir, HISTORY_FILE);
  const entry = {
    session_id: sessionId,
    ts: Math.floor(timestamp.getTime() / 1000),
    text: message,
  };
  await appendFile(historyPath, `${JSON.stringify(entry)}\n`, "utf-8");
}

export async function listSessions(): Promise<SessionSummary[]> {
  const sessionsDir = join(getDataDir(), "sessions");
  let files: string[];

  try {
    files = await readdir(sessionsDir);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const summaries: SessionSummary[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }

    const filePath = join(sessionsDir, file);
    try {
      const { session } = await readSessionFile(filePath);
      summaries.push({
        id: session.id,
        timestamp: session.timestamp,
        instructions: session.instructions,
        path: filePath,
      });
    } catch {
      // Ignore malformed session files; parity with Rust behaviour.
    }
  }

  summaries.sort((a, b) => {
    const aTime = Date.parse(a.timestamp);
    const bTime = Date.parse(b.timestamp);

    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
      return bTime - aTime;
    }

    if (Number.isNaN(aTime) && Number.isNaN(bTime)) {
      return a.id.localeCompare(b.id);
    }

    if (Number.isNaN(aTime)) {
      return 1;
    }

    return -1;
  });

  return summaries;
}

export async function readHistory(
  sessionId?: string,
  options: ReadHistoryOptions = {},
): Promise<HistoryEntry[]> {
  const historyPath = join(getDataDir(), HISTORY_FILE);
  let raw: string;

  try {
    raw = await readFileFs(historyPath, "utf-8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const entries: HistoryEntry[] = [];
  const targetSession = typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as Partial<HistoryEntry>;
      if (targetSession && parsed.session_id !== targetSession) {
        continue;
      }

      const entrySession = typeof parsed.session_id === "string" ? parsed.session_id : "";
      if (!entrySession) {
        continue;
      }

      const ts =
        typeof parsed.ts === "number" && Number.isFinite(parsed.ts)
          ? Math.trunc(parsed.ts)
          : 0;

      const text =
        typeof parsed.text === "string" ? parsed.text : String(parsed.text ?? "");

      entries.push({
        session_id: entrySession,
        ts,
        text,
      });
    } catch {
      // Skip malformed lines; matches Rust behaviour.
    }
  }

  const limit = normalizeLimit(options.limit);
  if (limit === null) {
    return entries;
  }

  return entries.slice(Math.max(entries.length - limit, 0));
}

async function ensureDataDir(): Promise<string> {
  const dataDir = getDataDir();
  await mkdir(dataDir, { recursive: true });
  return dataDir;
}

async function ensureSessionsDir(): Promise<string> {
  const dataDir = await ensureDataDir();
  const sessionsDir = join(dataDir, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  return sessionsDir;
}

function getDataDir(): string {
  return process.env.CODEX_PORT_DATA_DIR ?? join(process.cwd(), ".codex");
}

function buildSessionPath(baseDir: string, id: string, timestamp: string): string {
  const datePart = timestamp.slice(0, 10);
  return join(baseDir, `rollout-${datePart}-${id}.json`);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function resolveSessionPath(id: string): Promise<string | null> {
  const sessionsDir = join(getDataDir(), "sessions");
  let files: string[];

  try {
    files = await readdir(sessionsDir);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  for (const file of files) {
    if (file.endsWith(`-${id}.json`)) {
      return join(sessionsDir, file);
    }
  }

  return null;
}

async function writeSessionFile(
  filePath: string,
  session: SessionMetadata,
  items: ResponseItem[],
): Promise<void> {
  const payload = {
    session,
    items,
  };
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function readSessionFile(filePath: string): Promise<{
  session: SessionMetadata;
  items: ResponseItem[];
}> {
  const raw = await readFileFs(filePath, "utf-8");
  const parsed = JSON.parse(raw) as {
    session?: Partial<SessionMetadata>;
    items?: ResponseItem[];
  };

  const session = normalizeSessionMetadata(parsed.session, filePath);
  const items = Array.isArray(parsed.items) ? parsed.items : [];

  return { session, items };
}

function normalizeSessionMetadata(
  session: Partial<SessionMetadata> | undefined,
  filePath: string,
): SessionMetadata {
  const fallbackTimestamp = inferTimestampFromFilename(filePath);
  return {
    id: typeof session?.id === "string" ? session.id : inferIdFromFilename(filePath),
    timestamp:
      typeof session?.timestamp === "string"
        ? session.timestamp
        : fallbackTimestamp ?? new Date().toISOString(),
    instructions: typeof session?.instructions === "string" ? session.instructions : "",
  };
}

function inferIdFromFilename(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? filePath;
  const withoutExt = fileName.replace(/\.json$/, "");
  const parts = withoutExt.split("-");
  return parts.length >= 2 ? parts.slice(2).join("-") : fileName;
}

function inferTimestampFromFilename(filePath: string): string | null {
  const fileName = filePath.split("/").pop() ?? "";
  const match = fileName.match(/^rollout-(\d{4}-\d{2}-\d{2})-/);
  if (!match) {
    return null;
  }
  return `${match[1]}T00:00:00.000Z`;
}

function normalizeLimit(value: number | undefined): number | null {
  if (typeof value !== "number") {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  const limit = Math.trunc(value);
  if (limit <= 0) {
    return null;
  }

  return limit;
}
