import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { ConversationManager } from "../../../dist/core/conversation-manager.js";
import { SessionSource } from "../../../dist/core/rollout.js";
import { createDefaultConfig } from "../../../dist/core/config.js";
import { createAuthManagerFromCliConfig } from "../../../dist/cli/config.js";
import { createCliModelClientFactory } from "../../../dist/cli/client-factory.js";

loadEnv({ override: true });

const CODEx_HOME = process.env.CODY_HOME ?? path.join(os.homedir(), ".cody");
const WORKDIR = process.cwd();

function buildCliConfig(provider, api, model, apiKey) {
  return {
    provider: { name: provider, api, model },
    auth: {
      method: "api-key",
      openai_key: provider === "openai" ? apiKey : undefined,
      anthropic_key: provider === "anthropic" ? apiKey : undefined,
      openrouter_key: provider === "openrouter" ? apiKey : undefined,
    },
  };
}

async function createManager(cliConfig) {
  const authManager = createAuthManagerFromCliConfig(cliConfig);
  const modelClientFactory = createCliModelClientFactory(cliConfig);
  return new ConversationManager(
    authManager,
    SessionSource.CLI,
    modelClientFactory,
  );
}

export function logHeading(title) {
  console.log(`\n=== ${title} ===`);
}

export function summarizeMessages(messages) {
  if (messages.length === 0) {
    return "(no assistant messages received)";
  }
  if (messages.length === 1) {
    return messages[0];
  }
  return messages.map((msg, idx) => `${idx + 1}. ${msg}`).join("\n");
}

export function isMain(metaUrl) {
  const entry = process.argv[1]
    ? pathToFileURL(path.resolve(process.argv[1])).href
    : "";
  return metaUrl === entry;
}

function redactedKey(value) {
  if (!value) return "(missing)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-3)}`;
}

export async function runProviderTest({
  provider,
  api,
  model,
  envKey,
  prompt,
  title,
  onConfig,
}) {
  const apiKey = process.env[envKey];
  if (!apiKey) {
    throw new Error(
      `Missing ${envKey}. Set the environment variable before running ${title}.`,
    );
  }

  console.log(
    `Using ${envKey}=${redactedKey(apiKey)} for ${provider}/${api}`,
  );

  const cliConfig = buildCliConfig(provider, api, model, apiKey);
  const manager = await createManager(cliConfig);
  const config = createDefaultConfig(CODEx_HOME, WORKDIR);
  config.model = model;
  config.modelProviderId = provider;
  config.modelProviderApi = api;
  if (typeof onConfig === "function") {
    await onConfig(config);
  }

  const { conversation } = await manager.newConversation(config);
  await conversation.sendMessage(prompt);

  const messages = [];
  const reasoningEvents = [];

  while (true) {
    const event = await conversation.nextEvent();
    switch (event.msg.type) {
      case "agent_message":
        messages.push(event.msg.message);
        break;
      case "agent_reasoning":
      case "agent_reasoning_delta":
      case "agent_reasoning_raw_content":
      case "agent_reasoning_raw_content_delta":
        reasoningEvents.push(event.msg);
        break;
      case "error":
        throw new Error(event.msg.message);
      case "task_complete":
        if (event.msg.last_agent_message) {
          messages.push(event.msg.last_agent_message);
        }
        return { messages, reasoningEvents };
      default:
        break;
    }
  }
}

