import { logHeading, runProviderTest, summarizeMessages, isMain } from "./shared.js";

export async function testChatApi() {
  logHeading("OpenAI Chat Completions API");
  const prompt = "Explain the difference between Responses and Chat APIs in one sentence.";
  const { messages } = await runProviderTest({
    provider: "openai",
    api: "chat",
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
    envKey: "OPENAI_API_KEY",
    prompt,
    title: "OpenAI Chat API",
  });
  console.log("Prompt:", prompt);
  console.log("Response:", summarizeMessages(messages));
}

if (isMain(import.meta.url)) {
  testChatApi().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

