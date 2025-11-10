const STREAM_EVENT_TYPES = new Set([
  "output_text.delta",
  "reasoning_summary.delta",
  "reasoning_content.delta",
  "reasoning_summary.part_added",
  "web_search_call.begin",
  "rate_limits",
  "usage",
  "error",
]);

const MESSAGE_CONTENT_TYPES = new Set([
  "output_text",
  "text",
  "input_text",
  "reasoning_text",
  "summary_text",
]);

export function createTurnStreamState() {
  let assistantBuffer = "";

  return {
    handleSessionItem(item) {
      return handleResponseItem(item, { source: "session" });
    },

    handleEvent(event) {
      if (!isObject(event) || typeof event.type !== "string") {
        return [];
      }

      switch (event.type) {
        case "output_text.delta":
          return handleAssistantDelta(event.delta);
        case "reasoning_summary.delta":
          return handleReasoningDelta("summary", event.delta);
        case "reasoning_content.delta":
          return handleReasoningDelta("content", event.delta);
        case "reasoning_summary.part_added":
          return [{ type: "reasoning_part" }];
        case "web_search_call.begin":
          return [{ type: "web_search_begin", callId: event.callId }];
        case "rate_limits":
          return [{ type: "rate_limits", snapshot: event.snapshot }];
        case "usage":
          return [{ type: "usage", usage: event.usage ?? null }];
        case "error":
          return [{ type: "error", message: formatErrorMessage(event.error) }];
        default:
          if (STREAM_EVENT_TYPES.has(event.type)) {
            return [];
          }
          return handleResponseItem(event, { source: "stream" });
      }
    },
  };

  function handleAssistantDelta(delta) {
    if (typeof delta !== "string" || delta.length === 0) {
      return [];
    }

    assistantBuffer += delta;
    return [{ type: "assistant_delta", text: assistantBuffer }];
  }

  function handleReasoningDelta(kind, text) {
    if (typeof text !== "string" || text.length === 0) {
      return [];
    }
    return [{ type: "reasoning_delta", kind, text }];
  }

  function handleResponseItem(item, { source }) {
    if (!isObject(item) || typeof item.type !== "string") {
      return [];
    }

    switch (item.type) {
      case "message": {
        return handleMessageItem(item, source);
      }
      case "function_call":
      case "custom_tool_call":
      case "local_shell_call":
        return [buildToolCallAction(item)];
      case "function_call_output":
      case "custom_tool_call_output":
        return [buildToolResultAction(item)];
      case "reasoning": {
        const summaryText = Array.isArray(item.summary)
          ? item.summary.map((entry) => (typeof entry?.text === "string" ? entry.text : "")).join("")
          : "";
        if (!summaryText) {
          return [];
        }
        return [{ type: "reasoning_delta", kind: "summary", text: summaryText }];
      }
      case "web_search_call": {
        const callId = item.call_id ?? item.id ?? "";
        return [{ type: "web_search_begin", callId }];
      }
      default:
        return [];
    }
  }

  function handleMessageItem(item, source) {
    const text = extractMessageText(item.content);
    if (!text) {
      return [];
    }

    if (item.role === "user") {
      return [{ type: "user_message", text }];
    }

    if (item.role === "assistant") {
      assistantBuffer = "";
      return [{ type: "assistant_message", text, final: source === "stream" || source === "session" }];
    }

    return [];
  }
}

function extractMessageText(content) {
  if (!Array.isArray(content)) {
    return "";
  }

  const parts = [];
  for (const entry of content) {
    if (!isObject(entry)) {
      continue;
    }
    const type = typeof entry.type === "string" ? entry.type : "";
    if (!MESSAGE_CONTENT_TYPES.has(type)) {
      continue;
    }
    if (typeof entry.text === "string") {
      parts.push(entry.text);
    }
  }

  return parts.join("");
}

function buildToolCallAction(item) {
  switch (item.type) {
    case "function_call":
      return buildFunctionCallAction(item.name, item.call_id, item.arguments);
    case "custom_tool_call":
      return buildFunctionCallAction(item.name, item.call_id, item.input);
    case "local_shell_call":
      return buildLocalShellCallAction(item);
    default:
      return {
        type: "tool_call",
        tool: typeof item.name === "string" ? item.name : "tool",
        callId: typeof item.call_id === "string" ? item.call_id : "",
        arguments: item,
        rawArguments: JSON.stringify(item ?? null),
        sourceType: item.type,
      };
  }
}

function buildFunctionCallAction(name, callId, rawArguments) {
  const parsed = tryParseJson(rawArguments);
  return {
    type: "tool_call",
    tool: typeof name === "string" ? name : "tool",
    callId: typeof callId === "string" ? callId : "",
    arguments: parsed.ok ? parsed.value : rawArguments,
    rawArguments: typeof rawArguments === "string" ? rawArguments : JSON.stringify(rawArguments),
    sourceType: "function_call",
  };
}

function buildLocalShellCallAction(item) {
  const callId = typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : "";
  const action = isObject(item.action) ? item.action : {};
  const normalized = {
    ...action,
  };
  return {
    type: "tool_call",
    tool: "local_shell",
    callId,
    arguments: normalized,
    rawArguments: JSON.stringify(item.action ?? null),
    sourceType: "local_shell_call",
  };
}

function buildToolResultAction(item) {
  if (item.type === "custom_tool_call_output") {
    return {
      type: "tool_result",
      callId: item.call_id,
      output: {
        content: item.output,
      },
      sourceType: "custom_tool_call_output",
    };
  }

  return {
    type: "tool_result",
    callId: item.call_id,
    output: item.output,
    sourceType: "function_call_output",
  };
}

function tryParseJson(value) {
  if (typeof value !== "string") {
    return { ok: false, value };
  }

  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (_error) {
    return { ok: false, value };
  }
}

function formatErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return JSON.stringify(error);
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}
