import type {
  ModelProviderApi,
  ModelProviderName,
} from "../core/model-provider-types.js";

export type ProviderName = ModelProviderName;
export type ProviderApi = ModelProviderApi;

export interface ProviderApiDefinition {
  name: ProviderApi;
  label: string;
  defaultModel: string;
}

export interface ProviderDefinition {
  name: ProviderName;
  label: string;
  defaultApi: ProviderApi;
  apis: ProviderApiDefinition[];
}

const PROVIDERS: ProviderDefinition[] = [
  {
    name: "openai",
    label: "OpenAI",
    defaultApi: "responses",
    apis: [
      {
        name: "responses",
        label: "Responses API",
        defaultModel: "gpt-5.1-codex-mini",
      },
      {
        name: "chat",
        label: "Chat Completions",
        defaultModel: "gpt-5-mini-2025-08-07",
      },
    ],
  },
  {
    name: "anthropic",
    label: "Anthropic",
    defaultApi: "messages",
    apis: [
      {
        name: "messages",
        label: "Messages API",
        defaultModel: "claude-sonnet-4-5",
      },
    ],
  },
  {
    name: "openrouter",
    label: "OpenRouter",
    defaultApi: "chat",
    apis: [
      {
        name: "chat",
        label: "Chat Completions",
        defaultModel: "google/gemini-2.0-flash-001",
      },
    ],
  },
];

const PROVIDER_MAP = new Map<ProviderName, ProviderDefinition>(
  PROVIDERS.map((provider) => [provider.name, provider]),
);

export function listProviders(): ProviderDefinition[] {
  return PROVIDERS;
}

export function getProviderDefinition(
  name: string,
): ProviderDefinition | undefined {
  return PROVIDER_MAP.get(name as ProviderName);
}

export function getApiDefinition(
  providerName: string,
  apiName: string,
): ProviderApiDefinition | undefined {
  const provider = getProviderDefinition(providerName);
  if (!provider) {
    return undefined;
  }
  return provider.apis.find((api) => api.name === apiName);
}

export function getDefaultApi(providerName: string): ProviderApi | undefined {
  return getProviderDefinition(providerName)?.defaultApi;
}

export function getDefaultModel(
  providerName: string,
  apiName: string,
): string | undefined {
  return getApiDefinition(providerName, apiName)?.defaultModel;
}
