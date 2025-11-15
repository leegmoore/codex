import { logHeading, runProviderTest, summarizeMessages, isMain } from "./shared.js";

export async function testMessagesApi() {
  logHeading("Anthropic Messages API");
  const prompt = "List three tools available in Cody CLI.";
  const { messages } = await runProviderTest({
    provider: "anthropic",
    api: "messages",
    model: process.env.ANTHROPIC_MODEL ?? "claude-3-haiku",
    envKey: "ANTHROPIC_API_KEY",
    prompt,
    title: "Anthropic Messages API",
  });
  console.log("Prompt:", prompt);
  console.log("Response:", summarizeMessages(messages));
}

if (isMain(import.meta.url)) {
  testMessagesApi().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

