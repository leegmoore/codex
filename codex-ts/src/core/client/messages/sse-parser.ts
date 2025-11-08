/**
 * SSE (Server-Sent Events) parser for Anthropic Messages API
 *
 * Parses streaming SSE responses from Anthropic into typed event objects.
 *
 * Design reference: MESSAGES_API_INTEGRATION_DESIGN_CODEX.md Section 2.3
 */

import type { AnthropicSseEvent } from "./types.js";

/**
 * Parse an SSE stream from Anthropic into typed events.
 *
 * This async generator consumes a ReadableStream<Uint8Array> and yields
 * parsed AnthropicSseEvent objects.
 *
 * @param stream - ReadableStream from fetch response body
 * @yields AnthropicSseEvent objects
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<AnthropicSseEvent, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events (separated by \n\n)
      const events = buffer.split("\n\n");

      // Keep the last incomplete event in the buffer
      buffer = events.pop() || "";

      // Parse and yield each complete event
      for (const eventText of events) {
        if (eventText.trim().length === 0) {
          continue;
        }

        const event = parseSseEvent(eventText);
        if (event) {
          yield event;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE event from text format.
 *
 * SSE format:
 * event: <event_name>
 * data: <json_data>
 *
 * @param eventText - Raw SSE event text
 * @returns Parsed AnthropicSseEvent or null if invalid
 */
function parseSseEvent(eventText: string): AnthropicSseEvent | null {
  const lines = eventText.split("\n");
  let eventType: string | null = null;
  let data: string | null = null;

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data = line.slice(5).trim();
    }
  }

  if (!eventType || !data) {
    return null;
  }

  // Parse the JSON data
  let parsedData: unknown;
  try {
    parsedData = JSON.parse(data);
  } catch (err) {
    console.error("[sse-parser] Failed to parse JSON data:", data, err);
    return null;
  }

  // Convert to typed AnthropicSseEvent based on event type
  switch (eventType) {
    case "message_start":
      return {
        type: "message_start",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        message: parsedData as any,
      };

    case "content_block_start":
      return {
        type: "content_block_start",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        index: (parsedData as any).index,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content_block: (parsedData as any).content_block,
      };

    case "content_block_delta":
      return {
        type: "content_block_delta",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        index: (parsedData as any).index,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delta: (parsedData as any).delta,
      };

    case "content_block_stop":
      return {
        type: "content_block_stop",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        index: (parsedData as any).index,
      };

    case "message_delta":
      return {
        type: "message_delta",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delta: (parsedData as any).delta,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        usage: (parsedData as any).usage,
      };

    case "message_stop":
      return {
        type: "message_stop",
      };

    case "ping":
      return {
        type: "ping",
      };

    case "error":
      return {
        type: "error",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error: (parsedData as any).error,
      };

    default:
      console.warn(`[sse-parser] Unknown SSE event type: ${eventType}`);
      return null;
  }
}

/**
 * Create a ReadableStream from SSE text for testing.
 *
 * This utility is exported for test support.
 *
 * @param sseText - Raw SSE formatted text
 * @returns ReadableStream of bytes
 */
export function createSseStream(sseText: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(sseText);

  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
