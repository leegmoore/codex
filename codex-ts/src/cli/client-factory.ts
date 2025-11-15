import { ModelClient } from "../core/client/client.js";
import {
  builtInModelProviders,
  WireApi,
  type ModelProviderInfo,
} from "../core/client/model-provider-info.js";
import type { ModelClientFactory } from "../core/client/model-client-factory.js";
import { ConfigurationError } from "../core/errors.js";
import type { CliConfig } from "./config.js";
import { CodexAuth } from "../core/auth/stub-auth.js";

export function createCliModelClientFactory(
  cliConfig: CliConfig,
): ModelClientFactory {
  const providerInfo = resolveProviderInfo(cliConfig);
  const apiKey = resolveApiKey(cliConfig);
  if (!apiKey) {
    throw new ConfigurationError(
      `API key for provider ${cliConfig.provider.name} is required. Configure it under [auth] in ~/.cody/config.toml.`,
    );
  }
  const auth = CodexAuth.fromApiKey(apiKey);

  return ({ config }) => {
    return new ModelClient({
      provider: providerInfo,
      modelSlug: cliConfig.provider.model,
      auth,
      reasoningEffort: config.modelReasoningEffort ?? undefined,
      reasoningSummary: config.modelReasoningSummary,
    });
  };
}

function resolveProviderInfo(cliConfig: CliConfig): ModelProviderInfo {
  const providers = builtInModelProviders();
  const base = providers[cliConfig.provider.name];
  if (!base) {
    throw new ConfigurationError(
      `Unknown model provider: ${cliConfig.provider.name}`,
    );
  }

  if (cliConfig.provider.name === "openai") {
    const wireApi =
      cliConfig.provider.api === "chat" ? WireApi.Chat : WireApi.Responses;
    return { ...base, wireApi };
  }

  if (cliConfig.provider.name === "anthropic") {
    if (cliConfig.provider.api !== "messages") {
      throw new ConfigurationError(
        `Provider "anthropic" does not support API "${cliConfig.provider.api}". Use "messages".`,
      );
    }
    return { ...base, wireApi: WireApi.Messages };
  }

  if (cliConfig.provider.name === "openrouter") {
    if (cliConfig.provider.api !== "chat") {
      throw new ConfigurationError(
        `Provider "openrouter" only supports the "chat" API.`,
      );
    }
    return { ...base, wireApi: WireApi.Chat };
  }

  throw new ConfigurationError(
    `Unsupported provider: ${cliConfig.provider.name}`,
  );
}

function resolveApiKey(cliConfig: CliConfig): string | undefined {
  switch (cliConfig.provider.name) {
    case "openai":
      return cliConfig.auth.openai_key;
    case "anthropic":
      return cliConfig.auth.anthropic_key;
    case "openrouter":
      return cliConfig.auth.openrouter_key;
    default:
      return undefined;
  }
}
