import { logHeading, runProviderTest, summarizeMessages, isMain } from "./shared.js";

const TEMPERATURE_MODEL =
  process.env.OPENAI_TEMPERATURE_MODEL ??
  process.env.OPENAI_TEMP_MODEL ??
  "gpt-4o-mini";

async function runWithTemperature(temp) {
  const prompt = "Write a creative sentence about coding.";
  const result = await runProviderTest({
    provider: "openai",
    api: "chat",
    model: TEMPERATURE_MODEL,
    envKey: "OPENAI_API_KEY",
    prompt,
    title: `OpenAI Chat Temperature ${temp}`,
    onConfig: (config) => {
      config.modelTemperature = temp;
    },
  });
  const summary = summarizeMessages(result.messages);
  console.log(`Temperature ${temp}: ${summary}`);
  return summary;
}

export async function testTemperatureControls() {
  logHeading("Temperature Sweep (OpenAI Chat)");
  const outputs = [];
  for (const temp of [0.2, 0.7, 1.0]) {
    const summary = await runWithTemperature(temp);
    outputs.push({ temp, summary });
  }

  const uniqueCount = new Set(outputs.map((item) => item.summary)).size;
  if (uniqueCount === 1) {
    console.warn(
      "All temperature sweeps produced identical text. Consider rerunning for additional variance.",
    );
  }
}

if (isMain(import.meta.url)) {
  testTemperatureControls().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

