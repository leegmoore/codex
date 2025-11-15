import { logHeading, runProviderTest, summarizeMessages, isMain } from "./shared.js";

export async function testResponsesApi() {
  logHeading("OpenAI Responses API");
  const prompt = "Say hello in one sentence.";
  const { messages } = await runProviderTest({
    provider: "openai",
    api: "responses",
    model: process.env.OPENAI_RESPONSES_MODEL ?? "gpt-4o-mini",
    envKey: "OPENAI_API_KEY",
    prompt,
    title: "OpenAI Responses API",
  });
  console.log("Prompt:", prompt);
  console.log("Response:", summarizeMessages(messages));
}

if (isMain(import.meta.url)) {
  testResponsesApi().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

