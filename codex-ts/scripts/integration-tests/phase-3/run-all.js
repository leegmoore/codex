import { testResponsesApi } from "./test-responses-api.js";
import { testChatApi } from "./test-chat-api.js";
import { testMessagesApi } from "./test-messages-api.js";
import { testOpenRouter } from "./test-openrouter.js";
import { testThinkingControls } from "./test-thinking-controls.js";
import { testTemperatureControls } from "./test-temperature.js";

const tests = [
  { name: "OpenAI Responses API", fn: testResponsesApi },
  { name: "OpenAI Chat API", fn: testChatApi },
  { name: "Anthropic Messages API", fn: testMessagesApi },
  { name: "OpenRouter Chat API", fn: testOpenRouter },
  { name: "Thinking Controls", fn: testThinkingControls },
  { name: "Temperature Controls", fn: testTemperatureControls },
];

export async function runAllIntegrationTests() {
  const results = [];
  for (const test of tests) {
    try {
      await test.fn();
      results.push({ name: test.name, status: "PASS" });
    } catch (error) {
      results.push({ name: test.name, status: "FAIL", error });
      console.error(`\n✗ ${test.name} failed:`, error.message ?? error);
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  console.log("\n=== Phase 3 Integration Summary ===");
  results.forEach((result) => {
    const icon = result.status === "PASS" ? "✓" : "✗";
    console.log(`${icon} ${result.name}`);
  });
  console.log(`\n${passed}/${results.length} tests passed`);

  if (passed !== results.length) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && process.argv[1].endsWith("run-all.js")) {
  runAllIntegrationTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

