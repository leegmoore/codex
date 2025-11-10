import { describe, expect, it } from "bun:test";

describe("TOOL_REGISTRY", () => {
  it("contains all expected tool handlers", async () => {
    const { TOOL_REGISTRY } = await import("../../src/tools/registry");

    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      "apply_patch",
      "grep_files",
      "list_dir",
      "read_file",
      "shell",
    ]);
  });
});
