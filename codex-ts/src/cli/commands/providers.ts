import type { Command } from "commander";
import { ConfigurationError } from "../../core/errors.js";
import {
  parseCliProvider,
  readRawCliConfig,
  writeRawCliConfig,
  loadCliConfig,
  type CliProviderConfig,
} from "../config.js";
import {
  getApiDefinition,
  getDefaultApi,
  getDefaultModel,
  getProviderDefinition,
  listProviders,
  type ProviderApi,
  type ProviderName,
} from "../providers.js";

interface ProviderOptions {
  api?: string;
  model?: string;
  temperature?: string;
}

export function registerSetProviderCommand(program: Command): void {
  program
    .command("set-provider <provider>")
    .description(
      "Set the active model provider (openai, anthropic, openrouter)",
    )
    .option("--api <api>", "API type to use for the provider")
    .option("--model <model>", "Model identifier to use")
    .option("--temperature <temperature>", "Sampling temperature (0-2)")
    .action(async (providerName: string, options: ProviderOptions) => {
      const updated = await setProvider(providerName, options);
      console.log(`✓ Provider set to ${updated.name} (${updated.api})`);
      console.log(`  Model: ${updated.model}`);
      if (updated.temperature !== undefined) {
        console.log(`  Temperature: ${updated.temperature}`);
      }
    });
}

export function registerSetApiCommand(program: Command): void {
  program
    .command("set-api <api>")
    .description("Switch API type for the current provider")
    .option("--model <model>", "Optional model override for the API")
    .option("--temperature <temperature>", "Sampling temperature (0-2)")
    .action(async (api: string, options: ProviderOptions) => {
      const updated = await setApi(api, options);
      console.log(`✓ API set to ${updated.api} for provider ${updated.name}`);
      console.log(`  Model: ${updated.model}`);
      if (updated.temperature !== undefined) {
        console.log(`  Temperature: ${updated.temperature}`);
      }
    });
}

export function registerListProvidersCommand(program: Command): void {
  program
    .command("list-providers")
    .description("List available provider/API combinations")
    .action(async () => {
      const current = await getCurrentProviderOrDefault();
      console.log("\nAvailable Providers:\n");
      for (const provider of listProviders()) {
        for (const api of provider.apis) {
          const marker =
            current.name === provider.name && current.api === api.name
              ? "→"
              : " ";
          console.log(`${marker} ${provider.name}/${api.name}`);
          console.log(`    Models: ${api.defaultModel}`);
        }
      }
      console.log(
        `\nCurrent: ${current.name}/${current.api} (${current.model})`,
      );
    });
}

async function setProvider(
  providerName: string,
  options: ProviderOptions,
): Promise<CliProviderConfig> {
  const normalizedName = providerName.trim().toLowerCase();
  const provider = getProviderDefinition(normalizedName);
  if (!provider) {
    const supported = listProviders()
      .map((p) => p.name)
      .join(", ");
    throw new ConfigurationError(
      `Unknown provider "${providerName}". Supported providers: ${supported}`,
    );
  }

  const raw = (await readRawCliConfig()) ?? {};
  const current = parseCliProvider(raw.provider);
  const api = resolveApiForProvider(provider.name, current, options.api);
  const model = resolveModelForProvider(
    provider.name,
    api,
    current,
    options.model,
  );
  const temperature = resolveTemperatureForProvider(
    provider.name,
    current,
    options.temperature,
  );

  const updated: CliProviderConfig = { name: provider.name, api, model };
  if (temperature !== undefined) {
    updated.temperature = temperature;
  }
  raw.provider = updated;
  await writeRawCliConfig(raw);
  return updated;
}

async function setApi(
  apiName: string,
  options: ProviderOptions,
): Promise<CliProviderConfig> {
  const raw = (await readRawCliConfig()) ?? {};
  const current = parseCliProvider(raw.provider);
  const normalizedApi = apiName.trim().toLowerCase() as ProviderApi;
  const apiDef = getApiDefinition(current.name, normalizedApi);
  if (!apiDef) {
    const supported = (getProviderDefinition(current.name)?.apis ?? [])
      .map((api) => api.name)
      .join(", ");
    throw new ConfigurationError(
      `Provider "${current.name}" does not support API "${apiName}". Supported APIs: ${supported}`,
    );
  }

  const model =
    options.model?.trim() ||
    getDefaultModel(current.name, apiDef.name) ||
    current.model;
  const temperature = resolveTemperatureForApi(current, options.temperature);

  const updated: CliProviderConfig = {
    name: current.name,
    api: apiDef.name,
    model,
  };
  if (temperature !== undefined) {
    updated.temperature = temperature;
  }
  raw.provider = updated;
  await writeRawCliConfig(raw);
  return updated;
}

async function getCurrentProviderOrDefault(): Promise<CliProviderConfig> {
  try {
    const loaded = await loadCliConfig();
    return loaded.cli.provider;
  } catch (error) {
    if (isMissingConfigError(error)) {
      return parseCliProvider(undefined);
    }
    throw error;
  }
}

function resolveApiForProvider(
  providerName: ProviderName,
  current: CliProviderConfig,
  apiInput?: string,
): ProviderApi {
  if (apiInput) {
    const normalizedApi = apiInput.trim().toLowerCase() as ProviderApi;
    const apiDef = getApiDefinition(providerName, normalizedApi);
    if (!apiDef) {
      const supported = (getProviderDefinition(providerName)?.apis ?? [])
        .map((api) => api.name)
        .join(", ");
      throw new ConfigurationError(
        `Provider "${providerName}" does not support API "${apiInput}". Supported APIs: ${supported}`,
      );
    }
    return apiDef.name;
  }

  if (current.name === providerName) {
    const currentApi = getApiDefinition(providerName, current.api);
    if (currentApi) {
      return current.api;
    }
  }

  const fallback = getDefaultApi(providerName);
  if (!fallback) {
    throw new ConfigurationError(
      `Provider "${providerName}" does not declare a default API.`,
    );
  }
  return fallback;
}

function resolveModelForProvider(
  providerName: ProviderName,
  api: ProviderApi,
  current: CliProviderConfig,
  modelInput?: string,
): string {
  const trimmed = modelInput?.trim();
  if (trimmed) {
    return trimmed;
  }

  if (current.name === providerName && current.api === api && current.model) {
    return current.model;
  }

  return (
    getDefaultModel(providerName, api) ??
    current.model ??
    (() => {
      throw new ConfigurationError(
        `Unable to determine default model for ${providerName}/${api}. Provide --model.`,
      );
    })()
  );
}

function isMissingConfigError(error: unknown): boolean {
  return (
    error instanceof ConfigurationError &&
    /Config file not found/i.test(error.message)
  );
}

function parseTemperatureOption(value?: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (trimmed === "" || normalized === "default" || normalized === "auto") {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new ConfigurationError(
      `Temperature must be a number between 0 and 2 (received "${value}").`,
    );
  }
  return parsed;
}

function resolveTemperatureForProvider(
  providerName: ProviderName,
  current: CliProviderConfig,
  temperatureInput?: string,
): number | undefined {
  const parsed = parseTemperatureOption(temperatureInput);
  if (temperatureInput !== undefined) {
    return parsed;
  }
  if (current.name === providerName) {
    return current.temperature;
  }
  return undefined;
}

function resolveTemperatureForApi(
  current: CliProviderConfig,
  temperatureInput?: string,
): number | undefined {
  const parsed = parseTemperatureOption(temperatureInput);
  if (temperatureInput !== undefined) {
    return parsed;
  }
  return current.temperature;
}
