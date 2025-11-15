import { logHeading, runProviderTest, summarizeMessages, isMain } from "./shared.js";

async function runResponsesThinking() {
  const prompt = "Explain why the sky is blue in two sentences.";
  const result = await runProviderTest({
    provider: "openai",
    api: "responses",
    model: process.env.OPENAI_RESPONSES_MODEL ?? "gpt-4o-mini",
    envKey: "OPENAI_API_KEY",
    prompt,
    title: "OpenAI Responses Thinking Mode",
    onConfig: (config) => {
      config.modelReasoningEffort = "high";
      config.showRawAgentReasoning = true;
    },
  });
  console.log("Prompt:", prompt);
  console.log("Response:", summarizeMessages(result.messages));
  console.log("Reasoning events observed:", result.reasoningEvents.length);
}

async function runMessagesThinking() {
  const prompt = "Explain why the sky is blue in two sentences.";
  const result = await runProviderTest({
    provider: "anthropic",
    api: "messages",
    model: process.env.ANTHROPIC_MODEL ?? "claude-3-haiku",
    envKey: "ANTHROPIC_API_KEY",
    prompt,
    title: "Anthropic Messages Thinking Mode",
    onConfig: (config) => {
      // Placeholder hook for future thinking controls
      config.showRawAgentReasoning = true;
    },
  });
  console.log("Prompt:", prompt);
  console.log("Response:", summarizeMessages(result.messages));
  console.log("Reasoning events observed:", result.reasoningEvents.length);
}

export async function testThinkingControls() {
  logHeading("Thinking Controls - Responses API");
  await runResponsesThinking();
  logHeading("Thinking Controls - Messages API");
  await runMessagesThinking();
}

if (isMain(import.meta.url)) {
  testThinkingControls().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

