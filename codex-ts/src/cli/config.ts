import { promises as fs } from "fs";
import { dirname, join } from "path";
import os from "os";
import * as TOML from "smol-toml";
import * as IarnaToml from "@iarna/toml";
import {
  CONFIG_TOML_FILE,
  OPENAI_DEFAULT_MODEL,
  createDefaultConfig,
  type Config,
} from "../core/config.js";
import { ConfigurationError } from "../core/errors.js";
import { AuthManager, CodexAuth } from "../core/auth/index.js";
import type { AskForApproval, SandboxPolicy } from "../protocol/protocol.js";
import { ReasoningEffort, ReasoningSummary } from "../protocol/config-types.js";
import {
  createReadOnlyPolicy,
  createDangerFullAccessPolicy,
  createWorkspaceWritePolicy,
} from "../protocol/protocol.js";
import {
  getApiDefinition,
  getDefaultApi,
  getDefaultModel,
  getProviderDefinition,
  listProviders,
  type ProviderApi,
  type ProviderName,
} from "./providers.js";

export type { ProviderApi, ProviderName } from "./providers.js";

export interface CliProviderConfig {
  name: ProviderName;
  api: ProviderApi;
  model: string;
  temperature?: number;
}

export interface CliAuthConfig {
  method: "api-key" | string;
  openai_key?: string;
  anthropic_key?: string;
  openrouter_key?: string;
}

export interface CliConfig {
  provider: CliProviderConfig;
  auth: CliAuthConfig;
}

export interface LoadedCliConfig {
  cli: CliConfig;
  core: Config;
  codexHome: string;
  cwd: string;
}

export interface LoadCliConfigOptions {
  codexHome?: string;
  cwd?: string;
  configPath?: string;
}

export interface ResolvedCliConfigPaths {
  codexHome: string;
  cwd: string;
  configPath: string;
}

export function resolveCliConfigPaths(
  options: LoadCliConfigOptions = {},
): ResolvedCliConfigPaths {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const cwd = options.cwd ?? process.cwd();
  const configPath = options.configPath ?? join(codexHome, CONFIG_TOML_FILE);
  return { codexHome, cwd, configPath };
}

const DEFAULT_PROVIDER_NAME: ProviderName = "openai";
const DEFAULT_PROVIDER_API =
  getDefaultApi(DEFAULT_PROVIDER_NAME) ?? "responses";
const DEFAULT_PROVIDER: CliProviderConfig = {
  name: DEFAULT_PROVIDER_NAME,
  api: DEFAULT_PROVIDER_API,
  model:
    getDefaultModel(DEFAULT_PROVIDER_NAME, DEFAULT_PROVIDER_API) ??
    OPENAI_DEFAULT_MODEL,
  temperature: undefined,
};

export async function loadCliConfig(
  options: LoadCliConfigOptions = {},
): Promise<LoadedCliConfig> {
  const { codexHome, cwd, configPath } = resolveCliConfigPaths(options);

  let rawConfig: Record<string, unknown> | undefined;
  try {
    rawConfig = await readConfig(configPath);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to load config: ${(error as Error).message}`,
    );
  }

  const provider = parseCliProvider(rawConfig?.provider);
  const auth = normalizeAuth(rawConfig?.auth);

  const cli: CliConfig = { provider, auth };
  const core = createDefaultConfig(codexHome, cwd);
  core.model = provider.model;
  core.modelProviderId = provider.name;
  core.modelProviderApi = provider.api;
  core.modelTemperature = provider.temperature ?? undefined;

  // Apply config values to core config
  if (rawConfig) {
    const approvalPolicy = normalizeApprovalPolicy(rawConfig.approval_policy);
    if (approvalPolicy !== undefined) {
      core.approvalPolicy = approvalPolicy;
      core.didUserSetCustomApprovalPolicyOrSandboxMode = true;
    }

    const sandboxPolicy = normalizeSandboxPolicy(rawConfig.sandbox_policy);
    if (sandboxPolicy !== undefined) {
      core.sandboxPolicy = sandboxPolicy;
      core.didUserSetCustomApprovalPolicyOrSandboxMode = true;
    }

    const reasoningEffort = normalizeReasoningEffort(
      rawConfig.model_reasoning_effort,
    );
    if (reasoningEffort !== undefined) {
      core.modelReasoningEffort = reasoningEffort;
    }

    const reasoningSummary = normalizeReasoningSummary(
      rawConfig.model_reasoning_summary,
    );
    if (reasoningSummary !== undefined) {
      core.modelReasoningSummary = reasoningSummary;
    }
  }

  return { cli, core, codexHome, cwd };
}

export async function readRawCliConfig(
  options: LoadCliConfigOptions = {},
): Promise<Record<string, unknown> | undefined> {
  const { configPath } = resolveCliConfigPaths(options);
  try {
    return await readConfig(configPath);
  } catch (error) {
    if (
      error instanceof ConfigurationError &&
      /Config file not found/.test(error.message)
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function writeRawCliConfig(
  data: Record<string, unknown>,
  options: LoadCliConfigOptions = {},
): Promise<void> {
  const { configPath } = resolveCliConfigPaths(options);
  await fs.mkdir(dirname(configPath), { recursive: true });
  const serialized = IarnaToml.stringify(data as IarnaToml.JsonMap);
  await fs.writeFile(configPath, `${serialized}\n`, "utf-8");
}

export function createAuthManagerFromCliConfig(
  cliConfig: CliConfig,
): AuthManager {
  if (cliConfig.auth.method !== "api-key") {
    throw new ConfigurationError(
      `Auth method ${cliConfig.auth.method} is not supported in Phase 1`,
    );
  }

  const apiKey = getApiKeyForProvider(cliConfig);
  if (!apiKey) {
    throw new ConfigurationError(
      `API key for provider ${cliConfig.provider.name} is required. Set it in ~/.cody/config.toml or export the appropriate environment variable.`,
    );
  }

  const auth = CodexAuth.fromApiKey(apiKey);
  return AuthManager.fromAuthForTesting(auth);
}

function getApiKeyForProvider(cliConfig: CliConfig): string | undefined {
  switch (cliConfig.provider.name) {
    case "openai":
      return cliConfig.auth.openai_key;
    case "anthropic":
      return cliConfig.auth.anthropic_key;
    case "openrouter":
      return cliConfig.auth.openrouter_key;
  }
}

function defaultCodexHome(): string {
  return process.env.CODY_HOME ?? join(os.homedir(), ".cody");
}

async function readConfig(
  configPath: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const contents = await fs.readFile(configPath, "utf-8");
    const parsed = TOML.parse(contents);
    if (typeof parsed !== "object" || parsed === null) {
      throw new ConfigurationError("config.toml must be a TOML table");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new ConfigurationError(
        `Config file not found at ${configPath}. Create ~/.cody/config.toml first.`,
      );
    }
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(
      `Failed to read config: ${(error as Error).message}`,
    );
  }
}

export function parseCliProvider(value: unknown): CliProviderConfig {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_PROVIDER };
  }

  const table = value as Record<string, unknown>;
  const name =
    (getString(table.name) as ProviderName | undefined) ??
    DEFAULT_PROVIDER.name;
  const provider = getProviderDefinition(name);
  if (!provider) {
    const supported = listProviders()
      .map((p) => p.name)
      .join(", ");
    throw new ConfigurationError(
      `Unknown provider "${name}". Supported providers: ${supported}`,
    );
  }

  const requestedApi = getString(table.api) as ProviderApi | undefined;
  let api: ProviderApi;
  if (requestedApi) {
    if (!getApiDefinition(name, requestedApi)) {
      const supported = provider.apis.map((apiDef) => apiDef.name).join(", ");
      throw new ConfigurationError(
        `Provider "${name}" does not support API "${requestedApi}". Supported APIs: ${supported}`,
      );
    }
    api = requestedApi;
  } else {
    api = provider.defaultApi;
  }

  const model =
    getString(table.model) ??
    getDefaultModel(name, api) ??
    DEFAULT_PROVIDER.model;

  if (!model) {
    throw new ConfigurationError(
      `Model must be specified for provider "${name}" (${api}).`,
    );
  }

  const temperature = parseTemperatureValue(table.temperature);

  return { name, api, model, temperature };
}

function normalizeAuth(value: unknown): CliAuthConfig {
  const envOpenai = process.env.OPENAI_API_KEY?.trim();
  const envAnthropic = process.env.ANTHROPIC_API_KEY?.trim();
  const envOpenRouter = process.env.OPENROUTER_API_KEY?.trim();

  if (!value || typeof value !== "object") {
    if (!envOpenai && !envAnthropic && !envOpenRouter) {
      throw new ConfigurationError(
        "auth section missing and no provider API keys found in environment variables.",
      );
    }
    return {
      method: "api-key",
      openai_key: envOpenai,
      anthropic_key: envAnthropic,
      openrouter_key: envOpenRouter,
    };
  }

  const table = value as Record<string, unknown>;
  const method = getString(table.method) ?? "api-key";
  const resolvedOpenai = getString(table.openai_key) ?? envOpenai;
  const resolvedAnthropic = getString(table.anthropic_key) ?? envAnthropic;
  const resolvedOpenRouter = getString(table.openrouter_key) ?? envOpenRouter;

  if (method !== "api-key") {
    throw new ConfigurationError(
      `Auth method ${method} not supported in Phase 1`,
    );
  }

  if (!resolvedOpenai && !resolvedAnthropic && !resolvedOpenRouter) {
    throw new ConfigurationError(
      "No API keys configured. Provide at least one provider key in auth section or environment variables.",
    );
  }

  return {
    method,
    openai_key: resolvedOpenai?.trim(),
    anthropic_key: resolvedAnthropic?.trim(),
    openrouter_key: resolvedOpenRouter?.trim(),
  };
}

function getString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const str = getString(value);
  if (!str) {
    return undefined;
  }
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTemperatureValue(value: unknown): number | undefined {
  const temperature = getNumber(value);
  if (temperature === undefined) {
    return undefined;
  }
  if (temperature < 0 || temperature > 2) {
    throw new ConfigurationError(
      `Temperature must be between 0 and 2 (received ${temperature}).`,
    );
  }
  return temperature;
}

/**
 * Normalize approval_policy from config to AskForApproval type.
 *
 * Valid values: "never", "on-request", "on-failure"
 *
 * @param value - Raw config value
 * @returns Normalized approval policy or undefined if not set
 * @throws ConfigurationError if value is invalid
 */
function normalizeApprovalPolicy(value: unknown): AskForApproval | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const str = getString(value);
  if (!str) {
    return undefined;
  }

  const normalized = str.toLowerCase().trim();
  const validValues: AskForApproval[] = ["never", "on-request", "on-failure"];

  if (!validValues.includes(normalized as AskForApproval)) {
    throw new ConfigurationError(
      `Invalid approval_policy: "${str}". Valid values are: ${validValues.join(", ")}. Note: 'untrusted' policy is deferred to a future release.`,
    );
  }

  return normalized as AskForApproval;
}

/**
 * Normalize sandbox_policy from config to SandboxPolicy type.
 *
 * Valid values:
 * - "read-only" -> read-only policy
 * - "full-access" or "danger-full-access" -> danger-full-access policy
 * - "workspace-write" -> workspace-write policy with defaults
 *
 * @param value - Raw config value
 * @returns Normalized sandbox policy or undefined if not set
 * @throws ConfigurationError if value is invalid
 */
function normalizeSandboxPolicy(value: unknown): SandboxPolicy | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  // Handle string values
  const str = getString(value);
  if (str) {
    const normalized = str.toLowerCase().trim();
    switch (normalized) {
      case "read-only":
        return createReadOnlyPolicy();
      case "full-access":
      case "danger-full-access":
        return createDangerFullAccessPolicy();
      case "workspace-write":
        return createWorkspaceWritePolicy();
      default:
        throw new ConfigurationError(
          `Invalid sandbox_policy: "${str}". Valid values are: "read-only", "full-access", "workspace-write"`,
        );
    }
  }

  // Handle object values (for workspace-write with options)
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const mode = getString(obj.mode);
    if (mode === "workspace-write") {
      return {
        mode: "workspace-write",
        writable_roots: (obj.writable_roots as string[] | undefined) ?? [],
        network_access: (obj.network_access as boolean | undefined) ?? false,
        exclude_tmpdir_env_var:
          (obj.exclude_tmpdir_env_var as boolean | undefined) ?? false,
        exclude_slash_tmp:
          (obj.exclude_slash_tmp as boolean | undefined) ?? false,
      };
    }
    if (mode === "read-only") {
      return createReadOnlyPolicy();
    }
    if (mode === "danger-full-access") {
      return createDangerFullAccessPolicy();
    }
    throw new ConfigurationError(
      `Invalid sandbox_policy.mode: "${mode}". Valid values are: "read-only", "danger-full-access", "workspace-write"`,
    );
  }

  return undefined;
}

/**
 * Normalize model_reasoning_effort from config to ReasoningEffort enum.
 *
 * Valid values: "minimal", "low", "medium", "high"
 *
 * @param value - Raw config value
 * @returns Normalized reasoning effort or undefined if not set
 * @throws ConfigurationError if value is invalid
 */
function normalizeReasoningEffort(value: unknown): ReasoningEffort | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const str = getString(value);
  if (!str) {
    return undefined;
  }

  const normalized = str.toLowerCase().trim();
  const validValues = Object.values(ReasoningEffort) as string[];

  if (!validValues.includes(normalized)) {
    throw new ConfigurationError(
      `Invalid model_reasoning_effort: "${str}". Valid values are: ${validValues.join(", ")}`,
    );
  }

  return normalized as ReasoningEffort;
}

/**
 * Normalize model_reasoning_summary from config to ReasoningSummary enum.
 *
 * Valid values: "auto", "concise", "detailed", "none"
 *
 * @param value - Raw config value
 * @returns Normalized reasoning summary or undefined if not set
 * @throws ConfigurationError if value is invalid
 */
function normalizeReasoningSummary(
  value: unknown,
): ReasoningSummary | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value ? ReasoningSummary.Concise : ReasoningSummary.None;
  }

  const str = getString(value);
  if (!str) {
    return undefined;
  }

  const normalized = str.toLowerCase().trim();
  const validValues = Object.values(ReasoningSummary) as string[];

  if (!validValues.includes(normalized)) {
    throw new ConfigurationError(
      `Invalid model_reasoning_summary: "${str}". Valid values are: ${validValues.join(", ")}`,
    );
  }

  return normalized as ReasoningSummary;
}
