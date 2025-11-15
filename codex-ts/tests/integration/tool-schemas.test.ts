import { describe, it, expect } from "vitest";
import { toolRegistry } from "../../src/tools/registry.js";

function getSpec(name: string) {
  const spec = toolRegistry
    .getToolSpecs()
    .find((entry) => entry.type === "function" && entry.name === name);
  expect(spec, `expected spec for ${name}`).toBeDefined();
  return spec!;
}

describe("Tool Schemas", () => {
  it("ensures every registered tool exposes a parameter schema", () => {
    const specs = toolRegistry.getToolSpecs();
    expect(specs.length).toBeGreaterThan(0);

    for (const spec of specs) {
      expect(spec.parameters, `missing parameters for ${spec.name}`).toBeDefined();
      expect(spec.parameters.type).toBe("object");
      const props = spec.parameters.properties;
      expect(props, `missing properties for ${spec.name}`).toBeDefined();
      expect(Object.keys(props as Record<string, unknown>).length).toBeGreaterThan(0);
    }
  });

  it("defines exec schema", () => {
    const exec = getSpec("exec");
    expect(exec.parameters.required).toContain("command");
    const props = exec.parameters.properties as Record<string, { type?: string }>;
    expect(props.command.type).toBe("array");
  });

  it("defines readFile schema", () => {
    const readFile = getSpec("readFile");
    const props = readFile.parameters.properties as Record<string, { type?: string }>;
    expect(props.filePath.type).toBe("string");
  });

  it("defines writeFile schema", () => {
    const writeFile = getSpec("writeFile");
    const props = writeFile.parameters.properties as Record<string, { type?: string }>;
    expect(props.fileKey.type).toBe("string");
    expect(props.path.type).toBe("string");
  });
});
