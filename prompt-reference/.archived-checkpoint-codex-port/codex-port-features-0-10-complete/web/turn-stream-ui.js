const NOOP = () => {};

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function normalizeString(value) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function isToolFailure(output) {
  if (!isObject(output)) {
    return false;
  }
  return output.success === false && typeof output.content === "string";
}

export function createTurnStreamUiApplier(handlers = {}) {
  const {
    onUserMessage = NOOP,
    onAssistantDelta = NOOP,
    onAssistantMessage = NOOP,
    onToolCall = NOOP,
    onToolResult = NOOP,
    onAssistantInfo = NOOP,
    onUsage = NOOP,
    onReasoning = NOOP,
    onReasoningPart = NOOP,
    onWebSearch = NOOP,
    onRateLimits = NOOP,
    onUnknownAction = NOOP,
  } = handlers ?? {};

  return function applyActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) {
      return;
    }

    for (const action of actions) {
      if (!action || typeof action.type !== "string") {
        continue;
      }

      switch (action.type) {
        case "user_message":
          onUserMessage(normalizeString(action.text));
          break;
        case "assistant_delta":
          onAssistantDelta(normalizeString(action.text));
          break;
        case "assistant_message":
          onAssistantMessage(
            normalizeString(action.text),
            action.final !== false,
          );
          break;
        case "tool_call": {
          const payload = {
            ...action,
            tool: typeof action.tool === "string" ? action.tool : "tool",
            callId:
              typeof action.callId === "string"
                ? action.callId
                : normalizeString(action.callId),
          };
          onToolCall(payload);
          break;
        }
        case "tool_result": {
          const payload = {
            ...action,
            callId: normalizeString(action.callId),
          };
          onToolResult(payload);
          if (isToolFailure(action.output)) {
            const message = isObject(action.output)
              ? normalizeString(action.output.content)
              : "";
            onAssistantInfo(`Tool error: ${message}`.trim());
          }
          break;
        }
        case "usage":
          onUsage(isObject(action.usage) ? action.usage : null);
          break;
        case "error":
          onAssistantInfo(`Error: ${normalizeString(action.message)}`.trim());
          break;
        case "reasoning_delta": {
          const kind =
            action.kind === "summary" || action.kind === "content"
              ? action.kind
              : "summary";
          onReasoning(kind, normalizeString(action.text));
          break;
        }
        case "reasoning_part":
          onReasoningPart();
          break;
        case "web_search_begin":
          onWebSearch(normalizeString(action.callId));
          break;
        case "rate_limits":
          onRateLimits(action.snapshot ?? null);
          break;
        default:
          onUnknownAction(action);
          break;
      }
    }
  };
}
