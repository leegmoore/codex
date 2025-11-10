import { describe, test, expect, afterEach } from "bun:test";
import { join } from "node:path";

import { createTempDir, createTempFile, cleanupTempDirs } from "../helpers/fixtures";
import { expectErrorMessage } from "../helpers/assertions";
import { readFile } from "../../src/tools/readFile";

describe("readFile", () => {
  afterEach(async () => {
    await cleanupTempDirs();
  });

  test("reads lines from the start of a file", async () => {
    const dir = await createTempDir();
    const file = await createTempFile(dir, "sample.txt", "first\nsecond\nthird\n");

    const result = await readFile({ filePath: file, offset: 1, limit: 2 });

    expect(result.success).toBe(true);
    expect(result.content).toBe("L1: first\nL2: second");
  });

  test("respects offset and limit", async () => {
    const dir = await createTempDir();
    const file = await createTempFile(dir, "sample.txt", "first\nsecond\nthird\nfourth\n");

    const result = await readFile({ filePath: file, offset: 2, limit: 2 });
    expect(result.content).toBe("L2: second\nL3: third");
  });

  test("normalizes CRLF line endings", async () => {
    const dir = await createTempDir();
    const file = await createTempFile(dir, "sample.txt", "first\r\nsecond\r\n");

    const result = await readFile({ filePath: file, offset: 1, limit: 5 });

    expect(result.content).toBe("L1: first\nL2: second");
  });

  test("truncates long lines to max length", async () => {
    const dir = await createTempDir();
    const longLine = "x".repeat(600);
    const file = await createTempFile(dir, "long.txt", `${longLine}\n`);

    const result = await readFile({ filePath: file });
    const [line] = result.content.split("\n");
    expect(line).toBe(`L1: ${"x".repeat(500)}`);
  });

  test("preserves utf-8 characters at boundaries", async () => {
    const dir = await createTempDir();
    const emojis = "😀".repeat(600);
    const file = await createTempFile(dir, "emoji.txt", `${emojis}\n`);

    const result = await readFile({ filePath: file });
    const [line] = result.content.split("\n");
    const [, content] = line.split(": ", 2);
    expect(Array.from(content).length).toBe(500);
    expect(content.endsWith("😀")).toBe(true);
  });

  test("errors when offset exceeds file length", async () => {
    const dir = await createTempDir();
    const file = await createTempFile(dir, "sample.txt", "only one line\n");

    await expectErrorMessage(
      readFile({ filePath: file, offset: 5, limit: 1 }),
      "offset exceeds file length",
    );
  });

  test("validates parameters", async () => {
    const dir = await createTempDir();
    const file = await createTempFile(dir, "sample.txt", "content\n");

    await expectErrorMessage(
      readFile({ filePath: file, offset: 0, limit: 1 }),
      "offset must be a 1-indexed line number",
    );

    await expectErrorMessage(
      readFile({ filePath: file, offset: 1, limit: 0 }),
      "limit must be greater than zero",
    );

    await expectErrorMessage(
      readFile({ filePath: "relative/path", offset: 1, limit: 1 }),
      "file_path must be an absolute path",
    );
  });

  test("errors when file cannot be read", async () => {
    const missing = join("/tmp", `missing-${Date.now()}.txt`);

    await expectErrorMessage(
      readFile({ filePath: missing }),
      new RegExp(`^failed to read file: ENOENT`),
    );
  });
});
