import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import fastifyCors from "@fastify/cors";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createSession as createSessionDefault,
  loadSession as loadSessionDefault,
  listSessions as listSessionsDefault,
  readHistory as readHistoryDefault,
  type ReadHistoryOptions,
} from "./agent/session";
import { runTurnStream as runTurnStreamDefault, type TurnStreamItem } from "./agent/turn";
import {
  runTurnStreamV2 as runTurnStreamV2Default,
  type TurnStreamV2Item,
} from "./agent-v2/turn";
import { TOOL_REGISTRY } from "./tools/registry";
import { createRunsRedis, type RunsRedis } from "./runs/redis";
import {
  createBackgroundRunsService,
  DEFAULT_STREAM_START_ID,
  RunStreamTrimmedError,
  type BackgroundRunsService,
  type StreamRunEventsOptions,
} from "./runs/run-service";
import type { ContinuousRunConfig } from "./runs/types";

export interface CreateServerOptions {
  logger?: FastifyServerOptions["logger"];
  generateId?: () => string;
  createSession?: typeof createSessionDefault;
  loadSession?: typeof loadSessionDefault;
  listSessions?: typeof listSessionsDefault;
  readHistory?: typeof readHistoryDefault;
  runTurnStream?: typeof runTurnStreamDefault;
  runTurnStreamV2?: typeof runTurnStreamV2Default;
  runsService?: BackgroundRunsService;
  runsStreamKeepaliveMs?: number;
}

interface TurnRequestBody {
  sessionId?: unknown;
  message?: unknown;
}

interface CreateSessionBody {
  instructions?: unknown;
}

export async function createServer(
  options: CreateServerOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  const generateId = options.generateId ?? randomUUID;
  const createSession = options.createSession ?? createSessionDefault;
  const loadSession = options.loadSession ?? loadSessionDefault;
  const listSessions = options.listSessions ?? listSessionsDefault;
  const readHistory = options.readHistory ?? readHistoryDefault;
  const runTurnStream = options.runTurnStream ?? runTurnStreamDefault;
  const runTurnStreamV2 = options.runTurnStreamV2 ?? runTurnStreamV2Default;
  let runsService = options.runsService;
  let runsRedis: RunsRedis | null = null;
  const runsStreamKeepaliveMs =
    typeof options.runsStreamKeepaliveMs === "number"
      ? Math.max(0, options.runsStreamKeepaliveMs)
      : 15_000;

  if (!runsService) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      app.log.info("continuous run service disabled: REDIS_URL not configured");
    } else {
      try {
        runsRedis = await createRunsRedis({ url: redisUrl });
        runsService = createBackgroundRunsService({ runsRedis });
      } catch (error) {
        app.log.warn({ err: error }, "continuous run service disabled: redis unavailable");
        runsRedis = null;
        runsService = undefined;
      }
    }
  }

  await app.register(fastifyCors, {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
  });

  app.addHook("onClose", async () => {
    if (runsService && typeof runsService.shutdown === "function") {
      try {
        await runsService.shutdown();
      } catch (error) {
        app.log.warn({ err: error }, "failed to shutdown background runs service");
      }
    }
    if (runsRedis) {
      await runsRedis.close();
      runsRedis = null;
    }
  });

  const webDir = resolveWebDir();

  app.get("/", async (_request, reply) => {
    reply.type("text/html");
    return reply.send(await readStaticFile(webDir, "index.html"));
  });

  app.get("/app.js", async (_request, reply) => {
    reply.type("application/javascript");
    return reply.send(await readStaticFile(webDir, "app.js"));
  });

  app.get("/styles.css", async (_request, reply) => {
    reply.type("text/css");
    return reply.send(await readStaticFile(webDir, "styles.css"));
  });

  const webModules = [
    "turn-stream-state.js",
    "turn-stream-ui.js",
    "rate-limit-display.js",
  ];

  for (const moduleFile of webModules) {
    app.get(`/${moduleFile}`, async (_request, reply) => {
      reply.type("application/javascript");
      return reply.send(await readStaticFile(webDir, moduleFile));
    });
  }

  app.post("/api/sessions", async (request) => {
    const body = (request.body ?? {}) as CreateSessionBody;
    const instructions =
      typeof body.instructions === "string" ? body.instructions : "";

    const sessionId = generateId();
    await createSession(sessionId, { instructions });

    return { sessionId };
  });

  app.get("/api/sessions", async () => {
    return listSessions();
  });

  app.get("/api/sessions/:id", async (request, reply) => {
    const params = request.params as { id: string };

    try {
      return await loadSession(params.id);
    } catch (error) {
      reply.status(404);
      return { error: formatError(error) };
    }
  });

  app.get("/api/history", async (request) => {
    const query = request.query as { sessionId?: string; limit?: string };
    const sessionId =
      typeof query.sessionId === "string" && query.sessionId.length > 0
        ? query.sessionId
        : undefined;

    const options: ReadHistoryOptions = {};
    const limitValue =
      typeof query.limit === "string" && query.limit.length > 0
        ? Number.parseInt(query.limit, 10)
        : Number.NaN;
    if (Number.isFinite(limitValue) && limitValue > 0) {
      options.limit = limitValue;
    }

    return readHistory(sessionId, options);
  });

  app.post("/api/runs/continuous", async (request, reply) => {
    if (!runsService) {
      reply.status(503);
      return {
        error: {
          code: "service_unavailable",
          message: "Continuous run service is not configured",
        },
      };
    }

    const body = (request.body ?? {}) as {
      epicId?: unknown;
      config?: unknown;
    };

    const epicId = typeof body.epicId === "string" && body.epicId.trim().length > 0 ? body.epicId.trim() : null;
    if (!epicId) {
      reply.status(400);
      return {
        error: {
          code: "invalid_request",
          message: "epicId is required",
        },
      };
    }

    if (!isContinuousRunConfig(body.config)) {
      reply.status(400);
      return {
        error: {
          code: "invalid_request",
          message: "config is invalid",
        },
      };
    }

    try {
      const result = await runsService.startContinuousRun({
        epicId,
        config: body.config,
      });
      reply.status(202);
      return result;
    } catch (error) {
      reply.status(500);
      return {
        error: {
          code: "internal_error",
          message: formatError(error),
        },
      };
    }
  });

  app.get("/api/runs", async (request, reply) => {
    if (!runsService) {
      reply.status(503);
      return {
        error: {
          code: "service_unavailable",
          message: "Continuous run service is not configured",
        },
      };
    }

    const query = request.query as { limit?: string } | undefined;
    const limitValue =
      query && typeof query.limit === "string" && query.limit.trim().length > 0
        ? Number.parseInt(query.limit, 10)
        : Number.NaN;
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 100) : 20;

    const runs = await runsService.listRuns({ limit });
    return { runs };
  });

  app.get("/api/runs/:id", async (request, reply) => {
    if (!runsService) {
      reply.status(503);
      return {
        error: {
          code: "service_unavailable",
          message: "Continuous run service is not configured",
        },
      };
    }

    const params = request.params as { id: string };
    const run = await runsService.getRun(params.id);
    if (!run) {
      reply.status(404);
      return {
        error: {
          code: "not_found",
          message: `Run not found: ${params.id}`,
        },
      };
    }
    return run;
  });

  app.get("/api/runs/:id/status", async (request, reply) => {
    if (!runsService) {
      reply.status(503);
      return {
        error: {
          code: "service_unavailable",
          message: "Continuous run service is not configured",
        },
      };
    }

    const params = request.params as { id: string };
    const run = await runsService.getRun(params.id);
    if (!run) {
      reply.status(404);
      return {
        error: {
          code: "not_found",
          message: `Run not found: ${params.id}`,
        },
      };
    }
    return run;
  });

  app.post("/api/runs/:id/control", async (request, reply) => {
    if (!runsService) {
      reply.status(503);
      return {
        error: {
          code: "service_unavailable",
          message: "Continuous run service is not configured",
        },
      };
    }

    const params = request.params as { id: string };
    const body = (request.body ?? {}) as { action?: unknown };
    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";

    if (!isSupportedControlAction(action)) {
      reply.status(400);
      return {
        error: {
          code: "invalid_request",
          message: `Unsupported action: ${action || "<empty>"}`,
        },
      };
    }

    if (action === "pause") {
      return runsService.requestPause(params.id);
    }
    if (action === "resume") {
      return runsService.requestResume(params.id);
    }
    return runsService.requestCancel(params.id);
  });

  app.get("/api/runs/:id/stream", async (request, reply) => {
    if (!runsService) {
      reply.status(503);
      return {
        error: {
          code: "service_unavailable",
          message: "Continuous run service is not configured",
        },
      };
    }

    const params = request.params as { id: string };
    const query = request.query as { from?: string } | undefined;
    const lastEventIdHeader = request.headers["last-event-id"];

    const streamOptions: StreamRunEventsOptions = {
      from:
        query && typeof query.from === "string" && query.from.length > 0 ? query.from : DEFAULT_STREAM_START_ID,
      lastEventId: typeof lastEventIdHeader === "string" && lastEventIdHeader.length > 0 ? lastEventIdHeader : undefined,
    };
    const controller = new AbortController();
    streamOptions.signal = controller.signal;

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.hijack();

    const handleDisconnect = () => {
      controller.abort();
    };
    reply.raw.on("close", handleDisconnect);
    reply.raw.on("error", handleDisconnect);

    let keepaliveTimer: NodeJS.Timeout | null = null;
    if (runsStreamKeepaliveMs > 0) {
      keepaliveTimer = setInterval(() => {
        if (reply.raw.writableEnded) {
          return;
        }
        try {
          reply.raw.write(`:keepalive\n\n`);
        } catch {
          // ignore write errors; connection is likely closed
        }
      }, runsStreamKeepaliveMs);
      if (typeof keepaliveTimer.unref === "function") {
        keepaliveTimer.unref();
      }
    }

    try {
      for await (const entry of runsService.streamRunEvents(params.id, streamOptions)) {
        if (entry.id) {
          reply.raw.write(`id: ${entry.id}\n`);
        }
        reply.raw.write(`data: ${JSON.stringify(entry.event)}\n\n`);
      }
    } catch (error) {
      if (error instanceof RunStreamTrimmedError || (error as { code?: string })?.code === "RUN_STREAM_TRIMMED") {
        reply.raw.statusCode = 410;
        reply.raw.write(
          `data: ${JSON.stringify({
            type: "error",
            code: "stream_trimmed",
            error: formatError(error),
            lastEventId: (error as RunStreamTrimmedError).lastSeenId,
            earliestEventId: (error as RunStreamTrimmedError).earliestAvailableId ?? null,
          })}\n\n`,
        );
      } else {
        reply.raw.write(`data: ${JSON.stringify({ type: "error", error: formatError(error) })}\n\n`);
      }
    } finally {
      reply.raw.off("close", handleDisconnect);
      reply.raw.off("error", handleDisconnect);
      controller.abort();
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
      }
    }

    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  });

  app.post("/api/turns", async (request, reply) => {
    const body = (request.body ?? {}) as TurnRequestBody;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const message = typeof body.message === "string" ? body.message : "";

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.hijack();

    const sendEvent = (payload: TurnStreamItem | { type: "error"; error: string }) => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (!sessionId || !message) {
      sendEvent({
        type: "error",
        error: "Missing sessionId or message",
      });
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return;
    }

    try {
      for await (const item of runTurnStream(sessionId, message)) {
        sendEvent(item);
      }
    } catch (error) {
      sendEvent({ type: "error", error: formatError(error) });
    }

    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  });

  app.post("/api/turns/v2", async (request, reply) => {
    const body = (request.body ?? {}) as TurnRequestBody;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const message = typeof body.message === "string" ? body.message : "";

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.hijack();

    const sendEvent = (payload: TurnStreamV2Item | { type: "error"; error: string }) => {
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    if (!sessionId || !message) {
      sendEvent({
        type: "error",
        error: "Missing sessionId or message",
      });
      reply.raw.write("data: [DONE]\n\n");
      reply.raw.end();
      return;
    }

    try {
      for await (const item of runTurnStreamV2(sessionId, message)) {
        sendEvent(item);
      }
    } catch (error) {
      sendEvent({ type: "error", error: formatError(error) });
    }

    reply.raw.write("data: [DONE]\n\n");
    reply.raw.end();
  });

  app.post("/api/tools/:name", async (request, reply) => {
    const params = request.params as { name: string };
    const toolName = params.name as keyof typeof TOOL_REGISTRY;
    const tool = TOOL_REGISTRY[toolName];

    if (!tool) {
      reply.status(404);
      return { error: `Unknown tool: ${params.name}` };
    }

    const input = (request.body ?? {}) as unknown;

    try {
      const result = await tool(input);
      return { result };
    } catch (error) {
      reply.status(400);
      return { error: formatError(error) };
    }
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({ error: "Not Found" });
  });

  return app;
}

function isContinuousRunConfig(value: unknown): value is ContinuousRunConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const config = value as Record<string, unknown>;
  const completion = config.completion as Record<string, unknown> | undefined;
  const watch = config.watch as Record<string, unknown> | undefined;

  return (
    typeof config.workingDir === "string" &&
    typeof config.loopDelaySec === "number" &&
    typeof config.model === "string" &&
    typeof config.reasoning === "string" &&
    typeof config.approval === "string" &&
    typeof config.sandbox === "string" &&
    completion != null &&
    typeof completion.pattern === "string" &&
    typeof completion.scanTailLines === "number" &&
    watch != null &&
    isStringArray(watch.include) &&
    isStringArray(watch.exclude) &&
    (config.maxTurns === null || typeof config.maxTurns === "number") &&
    isStringRecord(config.env)
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  for (const val of Object.values(value as Record<string, unknown>)) {
    if (typeof val !== "string") {
      return false;
    }
  }
  return true;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function resolveWebDir(): string {
  const current = dirname(fileURLToPath(import.meta.url));
  return join(current, "../web");
}

async function readStaticFile(baseDir: string, fileName: string): Promise<string> {
  const filePath = join(baseDir, fileName);
  return await readFile(filePath, "utf-8");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return JSON.stringify(error);
}

function isSupportedControlAction(action: string): action is "pause" | "resume" | "cancel" {
  return action === "pause" || action === "resume" || action === "cancel";
}

async function start(): Promise<void> {
  const app = await createServer();
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });
  app.log.info(`Server listening on http://${host}:${port}`);
}

if (import.meta.main) {
  if (process.env.CODEX_SERVER_SCRIPT !== "1") {
    console.error("***YOU MUST START CODEX_PORT WITH PACKAGE.JSON SCRIPT COMMANDS***");
    process.exit(1);
  }
  start().catch((error) => {
    console.error("Failed to start server", error);
    process.exitCode = 1;
  });
}
