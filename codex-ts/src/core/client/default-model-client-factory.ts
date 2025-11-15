import { ModelClient } from "./client.js";
import {
  builtInModelProviders,
  WireApi,
  type ModelProviderInfo,
} from "./model-provider-info.js";
import type { ModelClientFactory } from "./model-client-factory.js";
import type { Config } from "../config.js";
import type { AuthManager } from "../auth/index.js";
import type { CodexAuth as RuntimeCodexAuth } from "../auth/index.js";
import { CodexAuth as StubCodexAuth } from "../auth/stub-auth.js";
import { ConfigurationError } from "../errors.js";

export function createDefaultModelClientFactory(): ModelClientFactory {
  return ({ config, authManager }) => {
    const provider = resolveProviderInfo(config);
    const auth = getAuthForProvider(authManager, config);

    return new ModelClient({
      provider,
      modelSlug: config.model,
      auth,
      reasoningEffort: config.modelReasoningEffort ?? undefined,
      reasoningSummary: config.modelReasoningSummary,
    });
  };
}

function resolveProviderInfo(config: Config): ModelProviderInfo {
  const providers = builtInModelProviders();
  const base = providers[config.modelProviderId];
  if (!base) {
    const supported = Object.keys(providers).join(", ");
    throw new ConfigurationError(
      `Unknown provider "${config.modelProviderId}". Supported providers: ${supported}`,
    );
  }

  const api = config.modelProviderApi;
  if (config.modelProviderId === "openai") {
    if (api === "responses") return { ...base, wireApi: WireApi.Responses };
    if (api === "chat") return { ...base, wireApi: WireApi.Chat };
    throw new ConfigurationError(
      `Provider "openai" does not support API "${api}".`,
    );
  }

  if (config.modelProviderId === "anthropic") {
    if (api !== "messages") {
      throw new ConfigurationError(
        `Provider "anthropic" does not support API "${api}". Use "messages".`,
      );
    }
    return { ...base, wireApi: WireApi.Messages };
  }

  if (config.modelProviderId === "openrouter") {
    if (api !== "chat") {
      throw new ConfigurationError(
        `Provider "openrouter" only supports the "chat" API.`,
      );
    }
    return { ...base, wireApi: WireApi.Chat };
  }

  throw new ConfigurationError(
    `Provider "${config.modelProviderId}" is not supported in this build.`,
  );
}

function getAuthForProvider(authManager: AuthManager, config: Config) {
  const auth = authManager.auth() as RuntimeCodexAuth | undefined;
  if (!auth) {
    throw new ConfigurationError(
      `No credentials configured for provider "${config.modelProviderId}". Run 'cody login' or set an API key.`,
    );
  }
  return auth as unknown as StubCodexAuth;
}
