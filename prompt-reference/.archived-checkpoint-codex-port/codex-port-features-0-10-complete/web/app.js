import { createTurnStreamState } from "./turn-stream-state.js";
import { createTurnStreamUiApplier } from "./turn-stream-ui.js";
import { createRateLimitDisplay } from "./rate-limit-display.js";

const appRoot = document.getElementById("app");

if (!appRoot) {
  throw new Error("App root not found");
}

appRoot.innerHTML = `
  <header class="app-header">
    <h1>Codex Port Agent</h1>
    <p class="usage" id="usage-summary"></p>
    <p class="rate-limits" id="rate-limit-summary"></p>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <div class="session-list">
        <button id="new-session">New Session</button>
        <select id="session-select"></select>
      </div>
      <div class="history">
        <h2>Recent Messages</h2>
        <div class="history-list" id="history"></div>
      </div>
    </aside>
    <main class="main">
      <div class="conversation" id="conversation"></div>
      <div class="composer">
        <textarea id="message-input" placeholder="Describe what you need..."></textarea>
        <button id="send-button">Send</button>
      </div>
    </main>
  </div>
`;

const state = {
  sessionId: null,
  streaming: false,
  assistantStreamElement: null,
};

let activeStreamState = createTurnStreamState();
const toolBlocks = new Map();

const sessionSelect = document.getElementById("session-select");
const newSessionButton = document.getElementById("new-session");
const conversation = document.getElementById("conversation");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const usageSummary = document.getElementById("usage-summary");
const rateLimitSummary = document.getElementById("rate-limit-summary");
const historyList = document.getElementById("history");
const updateRateLimitDisplay =
  rateLimitSummary instanceof HTMLElement
    ? createRateLimitDisplay(rateLimitSummary)
    : () => {};

function resetActiveStreamState() {
  activeStreamState = createTurnStreamState();
  if (state.assistantStreamElement instanceof HTMLElement) {
    state.assistantStreamElement.classList.remove("streaming");
  }
  state.assistantStreamElement = null;
  toolBlocks.clear();
}

function setStreaming(active) {
  state.streaming = active;
  sendButton.disabled = active || !state.sessionId;
  messageInput.disabled = active || !state.sessionId;
}

function resetComposer() {
  messageInput.value = "";
  messageInput.focus();
}

function clearConversation() {
  conversation.innerHTML = "";
  usageSummary.textContent = "";
  updateRateLimitDisplay(null);
  resetActiveStreamState();
  toolBlocks.clear();
}

function appendMessage(role, text, options = {}) {
  const element = document.createElement("div");
  element.classList.add("message");
  element.classList.add(role === "user" ? "user" : "assistant");
  if (Array.isArray(options.classes)) {
    for (const className of options.classes) {
      element.classList.add(className);
    }
  }
  if (options.streaming) {
    element.classList.add("streaming");
  }
  element.textContent = text;
  conversation.appendChild(element);
  conversation.scrollTop = conversation.scrollHeight;
  return element;
}

function ensureToolBlock(callId) {
  const key = callId ?? "";
  if (toolBlocks.has(key)) {
    return toolBlocks.get(key);
  }

  const wrapper = document.createElement("div");
  wrapper.classList.add("message", "tool-group");

  const header = document.createElement("div");
  header.classList.add("tool-summary");

  const title = document.createElement("div");
  title.classList.add("tool-title");

  const status = document.createElement("span");
  status.classList.add("tool-status");

  const body = document.createElement("div");
  body.classList.add("tool-body");

  const details = document.createElement("details");
  details.classList.add("tool-details");
  const summaryElement = document.createElement("summary");
  summaryElement.textContent = "View details";
  details.appendChild(summaryElement);

  const requestSection = createCollapsibleSection("Request");
  const resultSection = createCollapsibleSection("Result");

  details.appendChild(requestSection.section);
  details.appendChild(resultSection.section);

  header.appendChild(title);
  header.appendChild(status);
  body.appendChild(details);

  wrapper.appendChild(header);
  wrapper.appendChild(body);

  conversation.appendChild(wrapper);
  conversation.scrollTop = conversation.scrollHeight;

  const block = {
    wrapper,
    header,
    title,
    status,
    details,
    requestSection,
    resultSection,
    toolName: null,
  };

  toolBlocks.set(key, block);
  return block;
}

function createCollapsibleSection(label) {
  const section = document.createElement("section");
  section.classList.add("tool-section");

  const details = document.createElement("details");
  details.classList.add("tool-subdetails");
  const summaryHeader = document.createElement("summary");
  summaryHeader.textContent = label;
  details.appendChild(summaryHeader);

  const content = document.createElement("div");
  content.classList.add("tool-content");
  details.appendChild(content);

  section.appendChild(details);

  return { section, content, summary: details };
}

function updateToolSummary(block, payload) {
  if (payload.tool) {
    block.toolName = payload.tool;
  }
  const parts = [`Tool: ${block.toolName ?? payload.tool ?? "tool"}`];
  if (payload.callId) {
    parts.push(`#${payload.callId}`);
  }
  block.title.textContent = parts.join(" ");

  updateToolStatus(block, payload.status ?? "pending");
}

function updateToolStatus(block, status) {
  block.status.textContent = status;
  block.status.classList.remove("pending", "success", "error");
  block.status.classList.add(
    status === "success" ? "success" : status === "error" ? "error" : "pending",
  );
  block.status.setAttribute("aria-label", `Tool status: ${status}`);
}

function renderToolCall(payload) {
  const block = ensureToolBlock(payload.callId);
  updateToolSummary(block, {
    tool: payload.tool,
    callId: payload.callId,
    status: block.status.textContent || "pending",
  });

  const formatted = formatToolValue(payload.arguments, payload.rawArguments);
  block.requestSection.content.innerHTML = "";
  block.requestSection.content.appendChild(formatted);
  block.requestSection.summary.open = false;
  block.details.open = false;
}

function renderToolResult(payload) {
  const block = ensureToolBlock(payload.callId);
  const success = normalizeToolSuccess(payload.output);
  updateToolSummary(block, {
    tool: block.toolName ?? payload.tool ?? payload.callId ?? "tool",
    callId: payload.callId,
    status: success ? "success" : "error",
  });

  const displayValue =
    isObject(payload.output) && payload.output.structured_content !== undefined
      ? payload.output.structured_content
      : isObject(payload.output) && payload.output.content !== undefined
        ? payload.output.content
        : payload.output;

  const formatted = formatToolValue(displayValue, payload.output);
  block.resultSection.content.innerHTML = "";
  block.resultSection.content.appendChild(formatted);
  block.resultSection.summary.open = !success;
  block.details.open = block.details.open || !success;
}

function renderAssistantDelta(text) {
  if (!text) {
    return;
  }

  if (!(state.assistantStreamElement instanceof HTMLElement)) {
    state.assistantStreamElement = appendMessage("assistant", text, {
      streaming: true,
    });
    return;
  }

  state.assistantStreamElement.textContent = text;
  conversation.scrollTop = conversation.scrollHeight;
}

function renderAssistantMessage(text, final = true) {
  if (!text) {
    return;
  }

  if (state.assistantStreamElement instanceof HTMLElement) {
    state.assistantStreamElement.textContent = text;
    state.assistantStreamElement.classList.remove("streaming");
    state.assistantStreamElement = null;
    conversation.scrollTop = conversation.scrollHeight;
    return;
  }

  const element = appendMessage("assistant", text, { streaming: !final });
  if (!final) {
    state.assistantStreamElement = element;
  }
}

function renderReasoning(kind, text) {
  if (!text) {
    return;
  }

  const element = document.createElement("div");
  element.classList.add("message", "assistant", "reasoning");
  const label = kind === "summary" ? "Thought" : "Reasoning";
  element.innerHTML = `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(text)}`;
  conversation.appendChild(element);
  conversation.scrollTop = conversation.scrollHeight;
}

function renderReasoningPart() {
  // No-op for now; placeholder for future UI.
}

const applyActions = createTurnStreamUiApplier({
  onUserMessage(text) {
    appendMessage("user", text);
  },
  onAssistantDelta(text) {
    renderAssistantDelta(text);
  },
  onAssistantMessage(text, final) {
    renderAssistantMessage(text, final);
  },
  onToolCall(payload) {
    renderToolCall(payload);
  },
  onToolResult(payload) {
    renderToolResult(payload);
  },
  onAssistantInfo(text) {
    appendMessage("assistant", text);
  },
  onUsage(usage) {
    updateUsage(usage);
  },
  onReasoning(kind, text) {
    renderReasoning(kind, text);
  },
  onReasoningPart() {
    renderReasoningPart();
  },
  onWebSearch(callId) {
    renderToolCall({
      type: "tool_call",
      tool: "web_search",
      callId,
      arguments: { callId },
      rawArguments: JSON.stringify({ callId }),
    });
  },
  onRateLimits(snapshot) {
    updateRateLimitDisplay(snapshot);
  },
});

function showHistoryMessage(text) {
  if (!historyList) {
    return;
  }
  historyList.innerHTML = "";
  const element = document.createElement("div");
  element.classList.add("history-empty");
  element.textContent = text;
  historyList.appendChild(element);
}

function renderHistory(entries) {
  if (!historyList) {
    return;
  }

  historyList.innerHTML = "";

  if (!entries.length) {
    showHistoryMessage("No history yet");
    return;
  }

  const sorted = entries.slice().sort((a, b) => a.ts - b.ts);
  for (const entry of sorted.reverse()) {
    const item = document.createElement("div");
    item.classList.add("history-entry");

    const timestamp = document.createElement("time");
    const date = new Date((entry.ts ?? 0) * 1000);
    timestamp.dateTime = date.toISOString();
    timestamp.textContent = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const text = document.createElement("span");
    text.textContent =
      typeof entry.text === "string" ? entry.text : String(entry.text ?? "");

    item.appendChild(timestamp);
    item.appendChild(text);
    historyList.appendChild(item);
  }
}

async function loadHistory(sessionId) {
  if (!historyList) {
    return;
  }

  if (!sessionId) {
    showHistoryMessage("No session selected");
    return;
  }

  try {
    const response = await fetch(
      `/api/history?sessionId=${encodeURIComponent(sessionId)}&limit=50`,
    );
    if (!response.ok) {
      throw new Error(`Failed to load history: ${response.status}`);
    }

    const entries = await response.json();
    renderHistory(Array.isArray(entries) ? entries : []);
  } catch (error) {
    console.error("Failed to load history", error);
    showHistoryMessage("Unable to load history");
  }
}

function updateUsage(usage) {
  if (!usage) {
    usageSummary.textContent = "";
    return;
  }

  const { input_tokens, output_tokens, total_tokens } = usage;
  usageSummary.textContent = `Usage · input ${input_tokens ?? 0} · output ${output_tokens ?? 0} · total ${total_tokens ?? 0}`;
}

function formatToolValue(value, fallback) {
  if (value instanceof HTMLElement) {
    return value;
  }

  if (value === undefined || value === null) {
    if (fallback === undefined) {
      return createPreElement("(empty)");
    }
    return formatToolValue(fallback, undefined);
  }

  if (typeof value === "string") {
    return createPreElement(unescapeNewlines(value));
  }

  if (Array.isArray(value) || isObject(value)) {
    try {
      return createPreElement(JSON.stringify(value, null, 2));
    } catch (error) {
      return createPreElement(String(error ?? value));
    }
  }

  return createPreElement(String(value));
}

function formatValue(value) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(error ?? value);
  }
}

function createPreElement(text) {
  const pre = document.createElement("pre");
  pre.textContent = text;
  return pre;
}

function unescapeNewlines(text) {
  if (typeof text !== "string") {
    return text;
  }
  return text.replace(/\\n/g, "\n");
}

function normalizeToolSuccess(output) {
  if (isObject(output) && typeof output.success === "boolean") {
    return output.success;
  }
  return true;
}

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function escapeHtml(value) {
  const str = typeof value === "string" ? value : String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function refreshSessions(selectedId) {
  const response = await fetch("/api/sessions");
  if (!response.ok) {
    throw new Error(`Failed to list sessions: ${response.status}`);
  }

  const sessions = await response.json();
  sessionSelect.innerHTML = "";

  if (!sessions.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "No sessions";
    sessionSelect.appendChild(placeholder);
    sessionSelect.disabled = true;
    sendButton.disabled = true;
    messageInput.disabled = true;
    showHistoryMessage("No session selected");
    return;
  }

  sessionSelect.disabled = false;
  messageInput.disabled = false;
  sendButton.disabled = false;

  for (const session of sessions) {
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = `${session.id} · ${new Date(session.timestamp).toLocaleString()}`;
    sessionSelect.appendChild(option);
  }

  const targetId = selectedId ?? state.sessionId ?? sessions[0]?.id ?? null;
  if (targetId) {
    sessionSelect.value = targetId;
    await selectSession(targetId);
  }
}

async function selectSession(sessionId) {
  state.sessionId = sessionId;
  if (!sessionId) {
    clearConversation();
    showHistoryMessage("No session selected");
    return;
  }

  try {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}`,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const session = await response.json();
    clearConversation();

    renderSessionItems(session.items ?? []);

    usageSummary.textContent = "";
    await loadHistory(sessionId);
  } catch (error) {
    console.error("Failed to load session", error);
    appendMessage(
      "assistant",
      `Failed to load session: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function renderSessionItems(items) {
  const renderer = createTurnStreamState();
  for (const item of items ?? []) {
    const actions = renderer.handleSessionItem(item);
    applyActions(actions);
  }
}

async function createSession() {
  const instructions = window.prompt("Optional instructions", "");
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ instructions: instructions ?? "" }),
  });

  if (!response.ok) {
    appendMessage("assistant", `Failed to create session: ${response.status}`);
    return;
  }

  const { sessionId } = await response.json();
  await refreshSessions(sessionId);
  resetComposer();
}

async function sendMessage() {
  if (!state.sessionId || !messageInput.value.trim() || state.streaming) {
    return;
  }

  const message = messageInput.value.trim();
  appendMessage("user", message);
  resetComposer();
  setStreaming(true);

  try {
    const turnCompleted = await streamTurn(state.sessionId, message);
    if (turnCompleted && state.sessionId) {
      await loadHistory(state.sessionId);
    }
  } catch (error) {
    appendMessage(
      "assistant",
      `Turn failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    setStreaming(false);
  }
}

async function streamTurn(sessionId, message) {
  resetActiveStreamState();

  const response = await fetch("/api/turns/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ sessionId, message }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return false;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const context = { sawUsage: false, sawError: false };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      processEvent(rawEvent, context);
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  return context.sawUsage && !context.sawError;
}

function processEvent(rawEvent, context) {
  if (!rawEvent.startsWith("data:")) {
    return null;
  }

  const payload = rawEvent.slice(5).trim();
  if (!payload) {
    return null;
  }

  if (payload === "[DONE]") {
    return null;
  }

  try {
    const data = JSON.parse(payload);
    handleStreamPayload(data, context);
  } catch (error) {
    console.error("Failed to parse event", error);
    return null;
  }
}

function handleStreamPayload(data, context) {
  const actions = activeStreamState.handleEvent(data);
  applyActions(actions);
  if (!Array.isArray(actions)) {
    return;
  }

  for (const action of actions) {
    if (!action || typeof action.type !== "string") {
      continue;
    }
    if (action.type === "usage") {
      context.sawUsage = true;
    } else if (action.type === "error") {
      context.sawError = true;
    }
  }
}

newSessionButton?.addEventListener("click", () => {
  createSession().catch((error) => {
    appendMessage(
      "assistant",
      `Failed to create session: ${error.message ?? error}`,
    );
  });
});

sessionSelect?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) {
    return;
  }
  const value = target.value;
  if (value) {
    selectSession(value).catch((error) => {
      appendMessage(
        "assistant",
        `Failed to load session: ${error.message ?? error}`,
      );
    });
  }
});

sendButton?.addEventListener("click", () => {
  sendMessage().catch((error) => {
    appendMessage(
      "assistant",
      `Failed to send message: ${error.message ?? error}`,
    );
  });
});

messageInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage().catch((error) => {
      appendMessage(
        "assistant",
        `Failed to send message: ${error.message ?? error}`,
      );
    });
  }
});

showHistoryMessage("No session selected");

refreshSessions().catch((error) => {
  appendMessage(
    "assistant",
    `Failed to load sessions: ${error.message ?? error}`,
  );
  sessionSelect.disabled = true;
  sendButton.disabled = true;
  messageInput.disabled = true;
  showHistoryMessage("Unable to load history");
});
