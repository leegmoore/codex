import { logHeading, runProviderTest, summarizeMessages, isMain } from "./shared.js";

export async function testOpenRouter() {
  logHeading("OpenRouter (Gemini 2.0 Flash)");
  const prompt = "Say hello from the Gemini model in one concise sentence.";
  const { messages } = await runProviderTest({
    provider: "openrouter",
    api: "chat",
    model: process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001",
    envKey: "OPENROUTER_API_KEY",
    prompt,
    title: "OpenRouter Chat API",
  });
  console.log("Prompt:", prompt);
  console.log("Response:", summarizeMessages(messages));
}

if (isMain(import.meta.url)) {
  testOpenRouter().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

