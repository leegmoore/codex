import { describe, test, expect, afterEach } from "bun:test";
import { join } from "node:path";

import { createTempDir, createTempFile, cleanupTempDirs } from "../helpers/fixtures";
import { expectErrorMessage } from "../helpers/assertions";
import { runShell } from "../../src/tools/shell";

describe("runShell", () => {
  afterEach(async () => {
    await cleanupTempDirs();
  });

  test("executes a command and returns output", async () => {
    const result = await runShell({ command: ["bash", "-lc", "echo hello"] });
    expect(result.success).toBe(true);
    expect(result.content).toBe("hello\n");
  });

  test("runs command in specified workdir", async () => {
    const dir = await createTempDir();
    await createTempFile(dir, "file.txt", "content");

    const result = await runShell({
      command: ["bash", "-lc", "ls"],
      workdir: dir,
    });

    expect(result.content.split("\n")[0]).toBe("file.txt");
  });

  test("validates inputs and surfaces failures", async () => {
    await expectErrorMessage(
      runShell({ command: [] }),
      "command must not be empty",
    );

    await expectErrorMessage(
      runShell({ command: ["bash", "-lc", "echo hi"], timeoutMs: 0 }),
      "timeout must be greater than zero",
    );

    const missing = join("/tmp", `missing-${Date.now()}`);
    await expectErrorMessage(
      runShell({ command: ["bash", "-lc", "echo"], workdir: missing }),
      new RegExp(`^unable to access workdir \\\`${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\\``),
    );

    await expectErrorMessage(
      runShell({ command: ["bash", "-lc", "exit 5"] }),
      "command failed with exit code 5",
    );
  });

  test("times out long running commands", async () => {
    await expectErrorMessage(
      runShell({ command: ["bash", "-lc", "sleep 1"], timeoutMs: 50 }),
      "command timed out after 30 seconds",
    );
  });
});
