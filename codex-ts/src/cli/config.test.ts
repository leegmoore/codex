import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { loadCliConfig } from "./config.js";
import { ConfigurationError } from "../core/errors.js";
import { ReasoningEffort, ReasoningSummary } from "../protocol/config-types.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "codex-cli-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("loadCliConfig", () => {
  it("loads provider and auth details", async () => {
    const toml = `
[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
    await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

    const loaded = await loadCliConfig({ codexHome: tempDir, cwd: tempDir });
    expect(loaded.cli.provider.model).toBe("gpt-4o-mini");
    expect(loaded.core.model).toBe("gpt-4o-mini");
    expect(loaded.cli.auth.openai_key).toBe("sk-test-123");
  });

  it("loads provider temperature when specified", async () => {
    const toml = `
[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"
temperature = 0.6

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
    await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

    const loaded = await loadCliConfig({ codexHome: tempDir, cwd: tempDir });
    expect(loaded.cli.provider.temperature).toBe(0.6);
    expect(loaded.core.modelTemperature).toBe(0.6);
  });

  it("rejects provider temperature outside valid range", async () => {
    const toml = `
[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"
temperature = 5

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
    await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

    await expect(
      loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
    ).rejects.toThrow(/Temperature must be between 0 and 2/);
  });

  it("throws when config file is missing", async () => {
    await expect(
      loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
    ).rejects.toThrow(ConfigurationError);
  });

  describe("approval_policy loading", () => {
    it("loads approval_policy='never' correctly", async () => {
      const toml = `
approval_policy = "never"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.approvalPolicy).toBe("never");
      expect(loaded.core.didUserSetCustomApprovalPolicyOrSandboxMode).toBe(
        true,
      );
    });

    it("loads approval_policy='on-request' correctly", async () => {
      const toml = `
approval_policy = "on-request"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.approvalPolicy).toBe("on-request");
      expect(loaded.core.didUserSetCustomApprovalPolicyOrSandboxMode).toBe(
        true,
      );
    });

    it("throws error for invalid approval_policy", async () => {
      const toml = `
approval_policy = "invalid-value"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(ConfigurationError);
      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(/Invalid approval_policy/);
      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(/Valid values are/);
    });

    it('rejects approval_policy="untrusted" with deferral note', async () => {
      const toml = `
approval_policy = "untrusted"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(/'untrusted' policy is deferred to a future release/i);
    });

    it("uses default when approval_policy is not set", async () => {
      const toml = `
[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.approvalPolicy).toBe("on-failure"); // default
      expect(loaded.core.didUserSetCustomApprovalPolicyOrSandboxMode).toBe(
        false,
      );
    });
  });

  describe("sandbox_policy loading", () => {
    it("loads sandbox_policy='read-only' correctly", async () => {
      const toml = `
sandbox_policy = "read-only"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.sandboxPolicy).toEqual({ mode: "read-only" });
      expect(loaded.core.didUserSetCustomApprovalPolicyOrSandboxMode).toBe(
        true,
      );
    });

    it("loads sandbox_policy='full-access' correctly", async () => {
      const toml = `
sandbox_policy = "full-access"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.sandboxPolicy).toEqual({
        mode: "danger-full-access",
      });
      expect(loaded.core.didUserSetCustomApprovalPolicyOrSandboxMode).toBe(
        true,
      );
    });

    it("loads sandbox_policy='workspace-write' correctly", async () => {
      const toml = `
sandbox_policy = "workspace-write"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.sandboxPolicy).toEqual({
        mode: "workspace-write",
        writable_roots: [],
        network_access: false,
        exclude_tmpdir_env_var: false,
        exclude_slash_tmp: false,
      });
      expect(loaded.core.didUserSetCustomApprovalPolicyOrSandboxMode).toBe(
        true,
      );
    });

    it("throws error for invalid sandbox_policy", async () => {
      const toml = `
sandbox_policy = "invalid-value"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(ConfigurationError);
      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(/Invalid sandbox_policy/);
    });
  });

  describe("model_reasoning_effort loading", () => {
    it("loads model_reasoning_effort='low' correctly", async () => {
      const toml = `
model_reasoning_effort = "low"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.modelReasoningEffort).toBe(ReasoningEffort.Low);
    });

    it("loads model_reasoning_effort='high' correctly", async () => {
      const toml = `
model_reasoning_effort = "high"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.modelReasoningEffort).toBe(ReasoningEffort.High);
    });

    it("throws error for invalid model_reasoning_effort", async () => {
      const toml = `
model_reasoning_effort = "invalid-value"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(ConfigurationError);
      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(/Invalid model_reasoning_effort/);
    });
  });

  describe("model_reasoning_summary loading", () => {
    it("loads model_reasoning_summary='concise' correctly", async () => {
      const toml = `
model_reasoning_summary = "concise"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.modelReasoningSummary).toBe(ReasoningSummary.Concise);
    });

    it("loads model_reasoning_summary='detailed' correctly", async () => {
      const toml = `
model_reasoning_summary = "detailed"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.modelReasoningSummary).toBe(ReasoningSummary.Detailed);
    });

    it("treats model_reasoning_summary=true as concise", async () => {
      const toml = `
model_reasoning_summary = true

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.modelReasoningSummary).toBe(ReasoningSummary.Concise);
    });

    it("treats model_reasoning_summary=false as none", async () => {
      const toml = `
model_reasoning_summary = false

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      const loaded = await loadCliConfig({
        codexHome: tempDir,
        cwd: tempDir,
      });
      expect(loaded.core.modelReasoningSummary).toBe(ReasoningSummary.None);
    });

    it("throws error for invalid model_reasoning_summary", async () => {
      const toml = `
model_reasoning_summary = "invalid-value"

[provider]
name = "openai"
api = "responses"
model = "gpt-4o-mini"

[auth]
method = "api-key"
openai_key = "sk-test-123"
`;
      await writeFile(join(tempDir, "config.toml"), toml, "utf-8");

      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(ConfigurationError);
      await expect(
        loadCliConfig({ codexHome: tempDir, cwd: tempDir }),
      ).rejects.toThrow(/Invalid model_reasoning_summary/);
    });
  });
});
