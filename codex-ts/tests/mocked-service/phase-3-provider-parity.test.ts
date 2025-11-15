import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_TOML_FILE } from "../../src/core/config.js";
import { ConversationManager } from "../../src/core/conversation-manager.js";
import { SessionSource } from "../../src/core/rollout.js";
import type { ModelClient } from "../../src/core/client/client.js";
import type { ModelClientFactory } from "../../src/core/client/model-client-factory.js";
import type { Config } from "../../src/core/config.js";
import { ConfigurationError } from "../../src/core/errors.js";
import {
  registerSetProviderCommand,
  registerSetApiCommand,
  registerListProvidersCommand,
} from "../../src/cli/commands/providers.js";
import { createMockConfig } from "../mocks/config.js";
import { createMockAuthManager } from "../mocks/auth-manager.js";
import {
  createMockResponsesClient,
  createMockChatClient,
  createMockMessagesClient,
} from "../mocks/provider-clients.js";

describe("Phase 3: Multi-Provider Support", () => {
  describe("CLI provider commands", () => {
    const originalCodexHome = process.env.CODY_HOME;
    let tempHome: string;

    beforeEach(async () => {
      tempHome = await mkdtemp(join(tmpdir(), "cody-phase3-"));
      process.env.CODY_HOME = tempHome;
      const configPath = join(tempHome, CONFIG_TOML_FILE);
      await writeFile(
        configPath,
        [
          "[provider]",
          'name = "openai"',
          'api = "responses"',
          'model = "gpt-4o-mini"',
          "",
          "[auth]",
          'method = "api-key"',
          'openai_key = "sk-openai-test"',
          "",
        ].join("\n"),
      );
    });

    afterEach(async () => {
      process.env.CODY_HOME = originalCodexHome;
      if (tempHome) {
        await rm(tempHome, { recursive: true, force: true });
      }
    });

    function buildProgram() {
      const program = new Command();
      registerSetProviderCommand(program);
      registerSetApiCommand(program);
      registerListProvidersCommand(program);
      program.exitOverride();
      return program;
    }

    it("updates provider and persists config", async () => {
      const program = buildProgram();
      await program.parseAsync([
        "node",
        "cody",
        "set-provider",
        "anthropic",
        "--api",
        "messages",
        "--model",
        "claude-3-haiku",
      ]);

      const configPath = join(tempHome, CONFIG_TOML_FILE);
      const contents = await readFile(configPath, "utf-8");
      expect(contents).toContain('name = "anthropic"');
      expect(contents).toContain('api = "messages"');
      expect(contents).toContain('model = "claude-3-haiku"');
    });

    it("rejects unsupported provider/api combinations", async () => {
      const program = buildProgram();
      await expect(
        program.parseAsync([
          "node",
          "cody",
          "set-provider",
          "anthropic",
          "--api",
          "chat",
        ]),
      ).rejects.toThrow(/does not support api/i);
    });

    it("lists providers with current selection highlighted", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = buildProgram();

      await program.parseAsync(["node", "cody", "list-providers"]);

      const joined = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
      expect(joined).toContain("→ openai/responses");
      expect(joined).toContain("openai/chat");
      expect(joined).toContain("anthropic/messages");
      logSpy.mockRestore();
    });

    it("switches API for current provider", async () => {
      const program = buildProgram();
      await program.parseAsync(["node", "cody", "set-api", "chat"]);

      const configPath = join(tempHome, CONFIG_TOML_FILE);
      const contents = await readFile(configPath, "utf-8");
      expect(contents).toContain('api = "chat"');
    });

    it("rejects unsupported API for current provider", async () => {
      const program = buildProgram();
      await program.parseAsync([
        "node",
        "cody",
        "set-provider",
        "anthropic",
        "--api",
        "messages",
      ]);

      await expect(
        program.parseAsync(["node", "cody", "set-api", "chat"]),
      ).rejects.toThrow(/does not support api/i);
    });

    it("persists temperature when provided via set-provider", async () => {
      const program = buildProgram();
      await program.parseAsync([
        "node",
        "cody",
        "set-provider",
        "openai",
        "--api",
        "responses",
        "--model",
        "gpt-5-mini",
        "--temperature",
        "0.45",
      ]);

      const configPath = join(tempHome, CONFIG_TOML_FILE);
      const contents = await readFile(configPath, "utf-8");
      expect(contents).toContain('temperature = 0.45');
    });

    it("allows clearing temperature via set-api default", async () => {
      const program = buildProgram();
      // first set a temperature
      await program.parseAsync([
        "node",
        "cody",
        "set-provider",
        "openai",
        "--api",
        "responses",
        "--model",
        "gpt-4o-mini",
        "--temperature",
        "0.3",
      ]);
      // now clear to default
      await program.parseAsync([
        "node",
        "cody",
        "set-api",
        "responses",
        "--temperature",
        "default",
      ]);

      const configPath = join(tempHome, CONFIG_TOML_FILE);
      const contents = await readFile(configPath, "utf-8");
      expect(contents).not.toContain("temperature =");
    });
  });

  describe("Provider parity (mocked)", () => {
    function assistantResponse(text: string) {
      return [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        },
      ];
    }

    function createFactory(
      mapping: Record<string, ModelClient>,
    ): ModelClientFactory {
      return async ({ config }) => {
        const key = `${config.modelProviderId}:${config.modelProviderApi}`;
        const client = mapping[key];
        if (!client) {
          throw new ConfigurationError(
            `Unsupported provider/api combination: ${key}`,
          );
        }
        return client;
      };
    }

    async function createConversation(
      config: Config,
      factory: ModelClientFactory,
    ) {
      const manager = new ConversationManager(
        createMockAuthManager(),
        SessionSource.CLI,
        factory,
      );
      return manager.newConversation(config);
    }

    it("routes openai responses configs to Responses client", async () => {
      const responses = createMockResponsesClient([
        assistantResponse("Hello from responses"),
      ]);
      const chat = createMockChatClient([]);
      const messages = createMockMessagesClient([]);
      const factory = createFactory({
        "openai:responses": responses.client,
        "openai:chat": chat.client,
        "anthropic:messages": messages.client,
      });

      const config = createMockConfig({
        modelProviderId: "openai",
        modelProviderApi: "responses",
      });

      const { conversation } = await createConversation(config, factory);
      await conversation.sendMessage("Hi");
      const event = await conversation.nextEvent();
      expect(event.msg.type).toBe("agent_message");
      expect(responses.sendMessage).toHaveBeenCalledTimes(1);
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });

    it("routes openai chat configs to Chat client", async () => {
      const responses = createMockResponsesClient([]);
      const chat = createMockChatClient([
        assistantResponse("Chat API reply"),
      ]);
      const messages = createMockMessagesClient([]);
      const factory = createFactory({
        "openai:responses": responses.client,
        "openai:chat": chat.client,
        "anthropic:messages": messages.client,
      });

      const config = createMockConfig({
        modelProviderId: "openai",
        modelProviderApi: "chat",
      });

      const { conversation } = await createConversation(config, factory);
      await conversation.sendMessage("Hi via chat");
      await conversation.nextEvent();
      expect(chat.sendMessage).toHaveBeenCalledTimes(1);
      expect(responses.sendMessage).not.toHaveBeenCalled();
    });

    it("routes anthropic messages configs to Messages client", async () => {
      const responses = createMockResponsesClient([]);
      const chat = createMockChatClient([]);
      const messages = createMockMessagesClient([
        assistantResponse("Anthropic hello"),
      ]);
      const factory = createFactory({
        "openai:responses": responses.client,
        "openai:chat": chat.client,
        "anthropic:messages": messages.client,
      });

      const config = createMockConfig({
        modelProviderId: "anthropic",
        modelProviderApi: "messages",
        model: "claude-3-haiku",
      });

      const { conversation } = await createConversation(config, factory);
      await conversation.sendMessage("hey Claude");
      await conversation.nextEvent();
      expect(messages.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("rejects unsupported provider/api combination", async () => {
      const factory = createFactory({});
      const config = createMockConfig({
        modelProviderId: "anthropic",
        modelProviderApi: "chat",
      });
      const manager = new ConversationManager(
        createMockAuthManager(),
        SessionSource.CLI,
        factory,
      );

      await expect(manager.newConversation(config)).rejects.toThrow(
        ConfigurationError,
      );
    });
  });
});

