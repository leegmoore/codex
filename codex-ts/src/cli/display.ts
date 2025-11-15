import type { Conversation } from "../core/conversation.js";
import type { EventMsg } from "../protocol/protocol.js";
import type { ResponseItem } from "../protocol/models.js";

type FunctionCallItem = Extract<ResponseItem, { type: "function_call" }>;
type FunctionCallOutputItem = Extract<
  ResponseItem,
  { type: "function_call_output" }
>;

export const toolRenderers = {
  renderToolCall(call: FunctionCallItem): void {
    const args = parseJson(call.arguments);
    console.log(`\n🔧 Tool: ${call.name}`);
    console.log(`   Args: ${formatValue(args)}`);
  },
  renderToolResult(output: FunctionCallOutputItem): void {
    const payload = output.output;
    const body = payload.content
      ? payload.content
      : payload.content_items
        ? formatValue(payload.content_items)
        : "(no output)";
    const icon = payload.success === false ? "✗" : "✓";
    console.log(`${icon} Result (${output.call_id}): ${body}\n`);
  },
};

export async function renderConversationUntilComplete(
  conversation: Conversation,
): Promise<void> {
  // Loop until the agent indicates completion or abort.
  let done = false;
  while (!done) {
    const event = await conversation.nextEvent();
    done = handleEvent(event.msg);
  }
}

export const renderToolCall = (call: FunctionCallItem): void => {
  toolRenderers.renderToolCall(call);
};

export const renderToolResult = (output: FunctionCallOutputItem): void => {
  toolRenderers.renderToolResult(output);
};

function handleEvent(msg: EventMsg): boolean {
  switch (msg.type) {
    case "raw_response_item":
      if (msg.item.type === "function_call") {
        toolRenderers.renderToolCall(msg.item);
      } else if (msg.item.type === "function_call_output") {
        toolRenderers.renderToolResult(msg.item);
      }
      return false;
    case "agent_message":
      console.log(`Assistant: ${msg.message}`);
      return false;
    case "error":
      console.error(`Error: ${msg.message}`);
      return false;
    case "task_complete":
      return true;
    case "turn_aborted":
      return true;
    default:
      console.warn(`Unhandled event type:`, msg.type);
      return false;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatValue(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
