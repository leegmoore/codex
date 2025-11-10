import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const ORIGINAL_HOME = process.env.HOME;

async function withTempHome(fn: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "codex-auth-"));
  process.env.HOME = home;
  try {
    await fn(home);
  } finally {
    process.env.HOME = ORIGINAL_HOME;
    await rm(home, { recursive: true, force: true });
  }
}

describe("loadAuth", () => {
  it("loads OAuth access token when available", async () => {
    await withTempHome(async (home) => {
      const authDir = join(home, ".codex");
      await mkdir(authDir, { recursive: true });
      const authPath = join(authDir, "auth.json");
      await writeFile(
        authPath,
        JSON.stringify({ tokens: { access_token: "oauth-token" } }, null, 2),
        "utf-8",
      );

      const { loadAuth } = await import("../../src/client/auth");
      const token = await loadAuth();
      expect(token).toBe("oauth-token");
    });
  });

  it("throws when auth file missing", async () => {
    await withTempHome(async () => {
      const { loadAuth } = await import("../../src/client/auth");
      await expect(loadAuth()).rejects.toThrow(
        "No authentication found in ~/.codex/auth.json",
      );
    });
  });

  it("throws when auth file lacks credentials", async () => {
    await withTempHome(async (home) => {
      const authDir = join(home, ".codex");
      await mkdir(authDir, { recursive: true });
      const authPath = join(authDir, "auth.json");
      await writeFile(authPath, JSON.stringify({ foo: "bar" }, null, 2), "utf-8");

      const { loadAuth } = await import("../../src/client/auth");
      await expect(loadAuth()).rejects.toThrow(
        "No authentication found in ~/.codex/auth.json",
      );
    });
  });

  it("exposes account id via loadAuthInfo when available", async () => {
    await withTempHome(async (home) => {
      const authDir = join(home, ".codex");
      await mkdir(authDir, { recursive: true });
      const authPath = join(authDir, "auth.json");
      await writeFile(
        authPath,
        JSON.stringify(
          {
            tokens: {
              access_token: "oauth-token",
              account_id: "account-123",
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const { loadAuthInfo } = await import("../../src/client/auth");
      const info = await loadAuthInfo();
      expect(info).toEqual({
        token: "oauth-token",
        accountId: "account-123",
      });
    });
  });
});
