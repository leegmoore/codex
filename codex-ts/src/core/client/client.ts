/**
 * Model client for OpenAI Responses API and Chat Completions API.
 *
 * This module provides the ModelClient class which abstracts over
 * the two different OpenAI APIs (Responses and Chat) and provides
 * a unified interface for streaming model responses.
 *
 * Ported from: codex-rs/core/src/client.rs
 *
 * Phase 4.1 Note: This is a simplified implementation focusing on
 * core structure and types. Full HTTP streaming will be implemented
 * in Phase 4.5+ when HTTP infrastructure is ready.
 *
 * TODO(Phase 4.5+): Add full stream() implementation with HTTP
 * TODO(Phase 4.5+): Add retry logic with exponential backoff
 * TODO(Phase 4.5+): Add rate limit handling
 * TODO(Phase 4.5+): Add SSE parsing for both Responses and Chat APIs
 * TODO(Phase 4.5+): Add error response parsing
 * TODO(Phase 4.5+): Add usage limit detection
 */

import {
  getFullUrl,
  type ModelProviderInfo,
  WireApi as WireApiEnum,
} from "./model-provider-info.js";
import type { CodexAuth } from "../auth/stub-auth.js";
import type { ReasoningEffort } from "../../protocol/config-types.js";
import { ReasoningSummary } from "../../protocol/config-types.js";
import type { Prompt, ResponseEvent } from "./client-common.js";
import type { ContentItem, ResponseItem } from "../../protocol/models.js";
import { streamMessages as streamAnthropicMessages } from "./messages/index.js";
import {
  sendResponsesRequest,
  DEFAULT_RESPONSES_INSTRUCTIONS,
} from "./responses/client.js";
import { createChatCompletionRequest } from "./chat-completions.js";
import { createToolsJsonForChatCompletionsApi } from "./tool-converters.js";

/**
 * Response stream type - async generator of response events.
 */
export type ResponseStream = AsyncGenerator<ResponseEvent, void, unknown>;

/**
 * Options for creating a ModelClient.
 */
export interface ResponsesApiOptions {
  /** Model provider configuration */
  provider: ModelProviderInfo;

  /** Model identifier (e.g., "gpt-4", "gpt-3.5-turbo") */
  modelSlug: string;

  /** Optional authentication */
  auth?: CodexAuth;

  /** Optional reasoning effort level */
  reasoningEffort?: ReasoningEffort;

  /** Optional reasoning summary mode (defaults to 'auto') */
  reasoningSummary?: ReasoningSummary;
}

/**
 * Model client for streaming responses from OpenAI APIs.
 *
 * Supports both:
 * - Responses API (WireApi.Responses)
 * - Chat Completions API (WireApi.Chat)
 *
 * The client automatically selects the appropriate API based on the
 * provider's wire_api configuration.
 */
export class ModelClient {
  private readonly provider: ModelProviderInfo;
  private readonly modelSlug: string;
  private readonly auth?: CodexAuth;
  private readonly reasoningEffort?: ReasoningEffort;
  private readonly reasoningSummary: ReasoningSummary;

  constructor(options: ResponsesApiOptions) {
    this.provider = options.provider;
    this.modelSlug = options.modelSlug;
    this.auth = options.auth;
    this.reasoningEffort = options.reasoningEffort;
    this.reasoningSummary = options.reasoningSummary ?? ReasoningSummary.Auto;
  }

  /**
   * Get the model provider configuration.
   */
  getProvider(): ModelProviderInfo {
    return this.provider;
  }

  /**
   * Get the model slug.
   */
  getModelSlug(): string {
    return this.modelSlug;
  }

  /**
   * Get the wire API type.
   */
  getWireApi(): WireApiEnum {
    return this.provider.wireApi;
  }

  /**
   * Get the authentication (if configured).
   */
  getAuth(): CodexAuth | undefined {
    return this.auth;
  }

  /**
   * Get the reasoning effort level.
   */
  getReasoningEffort(): ReasoningEffort | undefined {
    return this.reasoningEffort;
  }

  /**
   * Get the reasoning summary mode.
   */
  getReasoningSummary(): ReasoningSummary {
    return this.reasoningSummary;
  }

  /**
   * Stream a model response.
   *
   * This method automatically selects between Responses API, Chat API, and
   * Messages API based on the provider's wire_api configuration.
   *
   * @param prompt - The prompt to send to the model
   * @returns A stream of response events
   */
  async stream(prompt: Prompt): Promise<ResponseStream> {
    // Route to appropriate API based on wire protocol
    switch (this.provider.wireApi) {
      case WireApiEnum.Responses:
        return this.streamResponses(prompt);
      case WireApiEnum.Chat:
        return this.streamChat(prompt);
      case WireApiEnum.Messages:
        return this.streamMessages(prompt);
      default:
        throw new Error(`Unsupported wire API: ${this.provider.wireApi}`);
    }
  }

  async sendMessage(prompt: Prompt): Promise<ResponseItem[]> {
    switch (this.provider.wireApi) {
      case WireApiEnum.Responses:
        return this.sendResponses(prompt);
      case WireApiEnum.Chat:
        return this.sendChat(prompt);
      case WireApiEnum.Messages:
        return this.sendMessagesApi(prompt);
      default:
        throw new Error(
          `sendMessage() not implemented for wire API ${this.provider.wireApi}`,
        );
    }
  }

  /**
   * Stream using the Responses API.
   *
   * TODO(Phase 4.5+): Implement Responses API streaming
   *
   * @param prompt - The prompt to send
   * @returns A stream of response events
   */
  private async streamResponses(_prompt: Prompt): Promise<ResponseStream> {
    throw new Error("Responses streaming not yet implemented");
  }

  /**
   * Stream using the Chat Completions API.
   *
   * TODO(Phase 4.5+): Implement Chat API streaming
   *
   * @param prompt - The prompt to send
   * @returns A stream of response events
   */
  private async streamChat(_prompt: Prompt): Promise<ResponseStream> {
    // TODO(Phase 4.5+): Implement Chat API streaming
    throw new Error(
      "streamChat() not yet implemented - deferred to Phase 4.5+",
    );
  }

  /**
   * Stream using the Anthropic Messages API.
   *
   * @param prompt - The prompt to send
   * @returns A stream of response events
   */
  private async streamMessages(prompt: Prompt): Promise<ResponseStream> {
    const apiKey = await this.getApiKeyForMessages();
    const config = {
      apiKey,
      baseUrl: this.getAnthropicBaseUrl(),
      anthropicVersion: this.getAnthropicVersion(),
      beta: this.getAnthropicBetaFlags(),
    };

    const promptExtras = prompt as unknown as Record<string, unknown>;
    const options = {
      temperature: promptExtras.temperature as number | undefined,
      topP: promptExtras.topP as number | undefined,
      topK: promptExtras.topK as number | undefined,
      stopSequences: promptExtras.stopSequences as string[] | undefined,
      traceId: promptExtras.traceId as string | undefined,
      toolChoice: promptExtras.toolChoice as
        | "auto"
        | "none"
        | "any"
        | undefined,
    };

    return streamAnthropicMessages(prompt, config, this.modelSlug, options);
  }

  private async sendResponses(prompt: Prompt): Promise<ResponseItem[]> {
    const apiKey = await this.getOpenAiApiKey();
    return sendResponsesRequest(prompt, {
      provider: this.provider,
      model: this.modelSlug,
      apiKey,
      reasoningEffort: this.reasoningEffort,
      reasoningSummary: this.reasoningSummary,
    });
  }

  private async sendChat(prompt: Prompt): Promise<ResponseItem[]> {
    const apiKey = await this.getGenericApiKey(
      this.provider.envKey ?? "OPENAI_API_KEY",
    );
    const endpoint = getFullUrl(this.provider, this.auth);
    const headers = this.buildChatHeaders(apiKey);
    const tools = createToolsJsonForChatCompletionsApi(prompt.tools);
    const systemInstructions =
      prompt.baseInstructionsOverride ?? DEFAULT_RESPONSES_INSTRUCTIONS;
    const request = createChatCompletionRequest(
      prompt,
      this.modelSlug,
      systemInstructions,
      tools,
    );

    if (prompt.outputSchema) {
      request.response_format = {
        type: "json_schema",
        json_schema: {
          name: "codex_output_schema",
          schema: prompt.outputSchema,
          strict: true,
        },
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });

    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(
        `Chat API request failed (${response.status}): ${rawBody}`,
      );
    }

    let payload: ChatCompletionResponse;
    try {
      payload = JSON.parse(rawBody) as ChatCompletionResponse;
    } catch (error) {
      throw new Error(
        `Failed to parse Chat API response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.mapChatCompletionResponse(payload);
  }

  private async sendMessagesApi(prompt: Prompt): Promise<ResponseItem[]> {
    const apiKey = await this.getApiKeyForMessages();
    const stream = streamAnthropicMessages(
      prompt,
      {
        apiKey,
        baseUrl: this.getAnthropicBaseUrl(),
        anthropicVersion: this.getAnthropicVersion(),
        beta: this.getAnthropicBetaFlags(),
      },
      this.modelSlug,
    );
    return this.collectResponseItemsFromStream(stream);
  }

  private async getOpenAiApiKey(): Promise<string> {
    const token = await this.tryGetAuthToken();
    if (token) {
      return token;
    }

    const envKey = this.provider.envKey ?? "OPENAI_API_KEY";
    const apiKey = process.env[envKey]?.trim();
    if (apiKey) {
      return apiKey;
    }

    throw new Error(
      `Missing API key for provider ${this.provider.name}. Set ${envKey} or configure Codex auth.`,
    );
  }

  private async getGenericApiKey(envKey: string): Promise<string> {
    const token = await this.tryGetAuthToken();
    if (token) {
      return token;
    }

    if (this.provider.experimentalBearerToken) {
      return this.provider.experimentalBearerToken;
    }

    const apiKey = process.env[envKey]?.trim();
    if (apiKey) {
      return apiKey;
    }

    throw new Error(
      `Missing API key for provider ${this.provider.name}. Set ${envKey} or configure Codex auth.`,
    );
  }

  private async getApiKeyForMessages(): Promise<string> {
    const token = await this.tryGetAuthToken();
    if (token) {
      return token;
    }

    if (this.provider.experimentalBearerToken) {
      return this.provider.experimentalBearerToken;
    }

    const envKey = this.provider.envKey || "ANTHROPIC_API_KEY";
    const apiKey = process.env[envKey]?.trim();
    if (apiKey) {
      return apiKey;
    }

    throw new Error(
      `Missing API key for Anthropic. Set ${envKey} environment variable or configure Codex auth.`,
    );
  }

  private async tryGetAuthToken(): Promise<string | undefined> {
    if (!this.auth) {
      return undefined;
    }
    const token = (await this.auth.getToken()).trim();
    return token.length > 0 ? token : undefined;
  }

  private buildChatHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };
    this.applyProviderHeaders(headers);
    return headers;
  }

  private applyProviderHeaders(headers: Record<string, string>): void {
    if (this.provider.httpHeaders) {
      for (const [key, value] of Object.entries(this.provider.httpHeaders)) {
        headers[key] = value;
      }
    }

    if (this.provider.envHttpHeaders) {
      for (const [key, envVar] of Object.entries(
        this.provider.envHttpHeaders,
      )) {
        const value = process.env[envVar];
        if (value) {
          headers[key] = value;
        }
      }
    }
  }

  private getAnthropicBaseUrl(): string | undefined {
    const baseUrl = this.provider.baseUrl;
    if (!baseUrl) {
      return undefined;
    }
    return baseUrl.replace(/\/v1\/?$/, "");
  }

  private getAnthropicVersion(): string | undefined {
    const extensions = this.provider.extensions ?? {};
    const version = extensions.anthropicVersion;
    return typeof version === "string" ? version : undefined;
  }

  private getAnthropicBetaFlags(): string[] | undefined {
    const extensions = this.provider.extensions ?? {};
    const beta = extensions.beta;
    if (!Array.isArray(beta)) {
      return undefined;
    }
    return beta.map((value) => String(value));
  }

  private async collectResponseItemsFromStream(
    stream: ResponseStream,
  ): Promise<ResponseItem[]> {
    const items: ResponseItem[] = [];
    for await (const event of stream) {
      if (
        event.type === "output_item_added" ||
        event.type === "output_item_done"
      ) {
        items.push(event.item);
      }
    }
    return items;
  }

  private mapChatCompletionResponse(
    payload: ChatCompletionResponse,
  ): ResponseItem[] {
    const items: ResponseItem[] = [];
    for (const choice of payload.choices ?? []) {
      const message = choice.message;
      if (!message) {
        continue;
      }

      const role = message.role || "assistant";
      const contentItems = this.convertChatContentToContentItems(
        message.content ?? null,
      );
      if (contentItems.length > 0) {
        items.push({
          type: "message",
          role,
          content: contentItems,
        });
      }

      if (Array.isArray(message.tool_calls)) {
        for (const call of message.tool_calls) {
          const func = call.function;
          if (!func?.name) {
            continue;
          }
          const args =
            typeof func.arguments === "string"
              ? func.arguments
              : JSON.stringify(func.arguments ?? {});
          const callId = call.id || func.name;
          items.push({
            type: "function_call",
            name: func.name,
            call_id: callId,
            arguments: args,
          });
        }
      }
    }
    return items;
  }

  private convertChatContentToContentItems(
    content: string | ChatCompletionContentPart[] | null,
  ): ContentItem[] {
    if (typeof content === "string") {
      const trimmed = content.trim();
      return trimmed
        ? [
            {
              type: "output_text",
              text: content,
            },
          ]
        : [];
    }

    if (!Array.isArray(content)) {
      return [];
    }

    const items: ContentItem[] = [];
    for (const part of content) {
      if (!part) {
        continue;
      }

      if (typeof part === "string") {
        if (part.trim()) {
          items.push({ type: "output_text", text: part });
        }
        continue;
      }

      if (typeof part === "object") {
        const textValue =
          typeof (part as { text?: string }).text === "string"
            ? (part as { text: string }).text
            : undefined;
        if (textValue && textValue.length > 0) {
          items.push({ type: "output_text", text: textValue });
        }
      }
    }

    return items;
  }
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoiceResponse[];
}

interface ChatCompletionChoiceResponse {
  index: number;
  finish_reason: string | null;
  message?: ChatCompletionMessage;
}

interface ChatCompletionMessage {
  role?: string;
  content?: string | ChatCompletionContentPart[] | null;
  tool_calls?: ChatCompletionToolCall[];
}

interface ChatCompletionToolCall {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
}

type ChatCompletionContentPart =
  | {
      type?: string;
      text?: string;
      [key: string]: unknown;
    }
  | string;
