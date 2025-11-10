import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { FastifyInstance } from "fastify";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServer, type CreateServerOptions } from "../../src/server";
import type { TurnStreamV2Item } from "../../src/agent-v2/turn";
import type { ResponseItem } from "../../src/protocol/types";

const ORIGINAL_DATA_DIR = process.env.CODEX_PORT_DATA_DIR;

describe("server", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "codex-server-test-"));
    process.env.CODEX_PORT_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.CODEX_PORT_DATA_DIR = ORIGINAL_DATA_DIR;
    await rm(tempDir, { recursive: true, force: true });
  });

  async function buildServer(overrides: CreateServerOptions = {}): Promise<FastifyInstance> {
    const app = await createServer({
      logger: false,
      generateId: () => "test-session",
      ...overrides,
    });
    return app;
  }

  it("creates sessions via the API", async () => {
    const app = await buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { instructions: "system message" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");

    const parsed = response.json<{ sessionId: string }>();
    expect(parsed.sessionId).toBe("test-session");

    const files = await readdir(join(tempDir, "sessions"));
    expect(files.some((file) => file.includes("test-session"))).toBe(true);

    await app.close();
  });

  it("serves newly added web modules", async () => {
    const app = await buildServer();

    const assets = [
      "/turn-stream-state.js",
      "/turn-stream-ui.js",
      "/rate-limit-display.js",
    ];

    for (const asset of assets) {
      const response = await app.inject({ method: "GET", url: asset });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("application/javascript");
      expect(response.body.length).toBeGreaterThan(0);
    }

    await app.close();
  });

  it("lists sessions", async () => {
    const app = await buildServer();

    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { instructions: "system instructions" },
    });

    const response = await app.inject({ method: "GET", url: "/api/sessions" });
    expect(response.statusCode).toBe(200);

    const sessions = response.json<unknown[]>();
    expect(sessions).toHaveLength(1);

    await app.close();
  });

  it("loads a session", async () => {
    const app = await buildServer();

    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { instructions: "load instructions" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/sessions/test-session",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<Record<string, unknown>>().session).toEqual(
      expect.objectContaining({ id: "test-session", instructions: "load instructions" }),
    );

    await app.close();
  });

  it("streams turn results as server-sent events", async () => {
    const stubUsage = {
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
    };

    async function* stubStream() {
      yield {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Hello from assistant" }],
      };
      yield { type: "usage" as const, usage: stubUsage };
    }

    const app = await buildServer({ runTurnStream: stubStream });

    await app.inject({ method: "POST", url: "/api/sessions" });

    const response = await app.inject({
      method: "POST",
      url: "/api/turns",
      headers: { accept: "text/event-stream" },
      payload: { sessionId: "test-session", message: "Run the turn" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = response.body.trim().split("\n\n");
    expect(events).toContain(
      `data: ${JSON.stringify({ role: "assistant", content: [{ type: "text", text: "Hello from assistant" }] })}`,
    );
    expect(events).toContain(`data: ${JSON.stringify({ type: "usage", usage: stubUsage })}`);
    expect(events[events.length - 1]).toBe("data: [DONE]");

    await app.close();
  });

  it("streams v2 turn results as server-sent events", async () => {
    const stubUsage = {
      input_tokens: 7,
      output_tokens: 4,
      total_tokens: 11,
    };

    const assistantItem: ResponseItem = {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Hello from v2 assistant" }],
    };

    async function* stubStreamV2(): AsyncGenerator<TurnStreamV2Item> {
      yield { type: "output_text.delta", delta: "Hello " };
      yield { type: "output_text.delta", delta: "from " };
      yield assistantItem;
      yield { type: "usage", usage: stubUsage };
    }

    const app = await buildServer({
      runTurnStreamV2: stubStreamV2,
    } as CreateServerOptions & { runTurnStreamV2: typeof stubStreamV2 });

    await app.inject({ method: "POST", url: "/api/sessions" });

    const response = await app.inject({
      method: "POST",
      url: "/api/turns/v2",
      headers: { accept: "text/event-stream" },
      payload: { sessionId: "test-session", message: "Run v2 turn" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = response.body.trim().split("\n\n");
    expect(events).toContain(`data: ${JSON.stringify({ type: "output_text.delta", delta: "Hello " })}`);
    expect(events).toContain(`data: ${JSON.stringify({ type: "output_text.delta", delta: "from " })}`);
    expect(events).toContain(`data: ${JSON.stringify(assistantItem)}`);
    expect(events).toContain(`data: ${JSON.stringify({ type: "usage", usage: stubUsage })}`);
    expect(events[events.length - 1]).toBe("data: [DONE]");

    await app.close();
  });

  it("forwards rate limit snapshots via the v2 turn stream", async () => {
    const rateLimits = {
      total_tokens: { limit: 90_000, remaining: 80_000, interval: "1m" },
    };

    async function* stubStreamV2(): AsyncGenerator<TurnStreamV2Item> {
      yield { type: "rate_limits", snapshot: rateLimits };
      yield {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Continuing under limits" }],
      } satisfies ResponseItem;
      yield { type: "usage", usage: null };
    }

    const app = await buildServer({
      runTurnStreamV2: stubStreamV2,
    } as CreateServerOptions & { runTurnStreamV2: typeof stubStreamV2 });

    await app.inject({ method: "POST", url: "/api/sessions" });

    const response = await app.inject({
      method: "POST",
      url: "/api/turns/v2",
      headers: { accept: "text/event-stream" },
      payload: { sessionId: "test-session", message: "Check limits" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = response.body.trim().split("\n\n");
    expect(events).toContain(`data: ${JSON.stringify({ type: "rate_limits", snapshot: rateLimits })}`);

    await app.close();
  });

  it("streams v2 errors when turn execution fails", async () => {
    async function* failingStreamV2(): AsyncGenerator<TurnStreamV2Item> {
      throw new Error("turn v2 failed");
    }

    const app = await buildServer({
      runTurnStreamV2: failingStreamV2,
    } as CreateServerOptions & { runTurnStreamV2: typeof failingStreamV2 });

    await app.inject({ method: "POST", url: "/api/sessions" });

    const response = await app.inject({
      method: "POST",
      url: "/api/turns/v2",
      headers: { accept: "text/event-stream" },
      payload: { sessionId: "test-session", message: "This will fail too" },
    });

    expect(response.statusCode).toBe(200);
    const events = response.body.trim().split("\n\n");
    expect(events).toContain(`data: ${JSON.stringify({ type: "error", error: "turn v2 failed" })}`);
    expect(events[events.length - 1]).toBe("data: [DONE]");

    await app.close();
  });

  it("validates required fields for v2 turns", async () => {
    async function* noopStream(): AsyncGenerator<TurnStreamV2Item, void, unknown> {
      return;
    }

    const app = await buildServer({
      runTurnStreamV2: noopStream,
    } as CreateServerOptions & { runTurnStreamV2: typeof noopStream });

    const response = await app.inject({
      method: "POST",
      url: "/api/turns/v2",
      headers: { accept: "text/event-stream" },
      payload: {},
    });

    const events = response.body.trim().split("\n\n");
    expect(events).toContain(
      `data: ${JSON.stringify({ type: "error", error: "Missing sessionId or message" })}`,
    );
    expect(events[events.length - 1]).toBe("data: [DONE]");

    await app.close();
  });

  it("streams errors when turn execution fails", async () => {
    async function* failingStream(): AsyncGenerator<never> {
      throw new Error("turn failed");
    }

    const app = await buildServer({ runTurnStream: failingStream });

    await app.inject({ method: "POST", url: "/api/sessions" });

    const response = await app.inject({
      method: "POST",
      url: "/api/turns",
      headers: { accept: "text/event-stream" },
      payload: { sessionId: "test-session", message: "This will fail" },
    });

    expect(response.statusCode).toBe(200);
    const events = response.body.trim().split("\n\n");
    expect(events).toContain(`data: ${JSON.stringify({ type: "error", error: "turn failed" })}`);
    expect(events[events.length - 1]).toBe("data: [DONE]");

    await app.close();
  });

  it("sets identical SSE headers for v1 and v2 turn endpoints", async () => {
    async function* emptyStream(): AsyncGenerator<never, void, unknown> {
      return;
    }

    const app = await buildServer({
      runTurnStream: emptyStream,
      runTurnStreamV2: emptyStream,
    } as CreateServerOptions & {
      runTurnStream: typeof emptyStream;
      runTurnStreamV2: typeof emptyStream;
    });

    await app.inject({ method: "POST", url: "/api/sessions" });

    const v1Response = await app.inject({
      method: "POST",
      url: "/api/turns",
      headers: { accept: "text/event-stream" },
      payload: { sessionId: "test-session", message: "compare" },
    });

    const v2Response = await app.inject({
      method: "POST",
      url: "/api/turns/v2",
      headers: { accept: "text/event-stream" },
      payload: { sessionId: "test-session", message: "compare" },
    });

    expect(v1Response.statusCode).toBe(200);
    expect(v2Response.statusCode).toBe(200);

    expect(v1Response.headers["content-type"]).toContain("text/event-stream");
    expect(v1Response.headers["content-type"]).toBe(v2Response.headers["content-type"]);
    expect(v1Response.headers["cache-control"]).toBe("no-cache");
    expect(v1Response.headers["cache-control"]).toBe(v2Response.headers["cache-control"]);
    expect(v1Response.headers["connection"]).toBe("keep-alive");
    expect(v1Response.headers["connection"]).toBe(v2Response.headers["connection"]);

    expect(v1Response.body.trim()).toBe("data: [DONE]");
    expect(v2Response.body.trim()).toBe("data: [DONE]");

    await app.close();
  });

  it("serves the web UI", async () => {
    const app = await buildServer();

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<div id=\"app\"></div>");

    await app.close();
  });

  it("serves the client script", async () => {
    const app = await buildServer();

    const response = await app.inject({ method: "GET", url: "/app.js" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("javascript");

    await app.close();
  });

  it("handles CORS preflight requests", async () => {
    const app = await buildServer();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/turns",
      headers: {
        origin: "http://localhost:4000",
        "access-control-request-method": "POST",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("*");

    await app.close();
  });

  it("returns conversation history entries", async () => {
    const app = await buildServer();
    const { appendHistory } = await import("../../src/agent/session");

    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { instructions: "history" },
    });

    await appendHistory("test-session", "first", new Date("2025-10-22T12:00:00Z"));
    await appendHistory("other-session", "second", new Date("2025-10-22T12:05:00Z"));

    const response = await app.inject({
      method: "GET",
      url: "/api/history",
    });

    expect(response.statusCode).toBe(200);
    const entries = response.json<Array<Record<string, unknown>>>();
    expect(entries).toEqual([
      {
        session_id: "test-session",
        ts: 1_761_134_400,
        text: "first",
      },
      {
        session_id: "other-session",
        ts: 1_761_134_700,
        text: "second",
      },
    ]);

    await app.close();
  });

  it("filters conversation history by session id", async () => {
    const app = await buildServer();
    const { appendHistory } = await import("../../src/agent/session");

    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { instructions: "history filter" },
    });

    await appendHistory("test-session", "keep", new Date("2025-10-22T13:01:00Z"));
    await appendHistory("other-session", "drop", new Date("2025-10-22T13:02:00Z"));

    const response = await app.inject({
      method: "GET",
      url: "/api/history",
      query: { sessionId: "test-session" },
    });

    expect(response.statusCode).toBe(200);
    const entries = response.json<Array<Record<string, unknown>>>();
    expect(entries).toEqual([
      {
        session_id: "test-session",
        ts: 1_761_138_060,
        text: "keep",
      },
    ]);

    await app.close();
  });

  it("limits conversation history when requested", async () => {
    const app = await buildServer();
    const { appendHistory } = await import("../../src/agent/session");

    await app.inject({
      method: "POST",
      url: "/api/sessions",
      payload: { instructions: "history limit" },
    });

    await appendHistory("test-session", "first", new Date("2025-10-22T14:00:00Z"));
    await appendHistory("test-session", "second", new Date("2025-10-22T14:05:00Z"));

    const response = await app.inject({
      method: "GET",
      url: "/api/history",
      query: { limit: "1" },
    });

    expect(response.statusCode).toBe(200);
    const entries = response.json<Array<Record<string, unknown>>>();
    expect(entries).toEqual([
      {
        session_id: "test-session",
        ts: 1_761_141_900,
        text: "second",
      },
    ]);

    await app.close();
  });

  it("invokes tools directly via the API", async () => {
    const app = await buildServer();

    const sampleDir = join(tempDir, "tool-test-dir");
    await mkdir(sampleDir, { recursive: true });
    await writeFile(join(sampleDir, "example.txt"), "hello world");

    const successResponse = await app.inject({
      method: "POST",
      url: "/api/tools/list_dir",
      payload: { dir_path: sampleDir, limit: 10 },
    });

    expect(successResponse.statusCode).toBe(200);
    const successBody = successResponse.json<{ result: { content: string; success: boolean } }>();
    expect(successBody.result.success).toBe(true);
    expect(typeof successBody.result.content).toBe("string");
    expect(successBody.result.content.length).toBeGreaterThan(0);

    const errorResponse = await app.inject({
      method: "POST",
      url: "/api/tools/list_dir",
      payload: {},
    });
    expect(errorResponse.statusCode).toBe(400);

    const missingResponse = await app.inject({
      method: "POST",
      url: "/api/tools/unknown_tool",
      payload: {},
    });
    expect(missingResponse.statusCode).toBe(404);

    await app.close();
  });
});
