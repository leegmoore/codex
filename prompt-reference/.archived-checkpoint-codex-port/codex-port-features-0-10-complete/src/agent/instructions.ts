import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface InstructionsOptions {
  includeApplyPatchTool?: boolean;
}

interface ModelDefinition {
  readonly match: (model: string) => boolean;
  readonly baseInstructions: string;
  readonly needsApplyPatchHelper: boolean;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const promptsDir = join(moduleDir, "../prompts");

const BASE_PROMPT = loadPrompt("prompt.md");
const GPT5_CODEX_PROMPT = loadPrompt("gpt_5_codex_prompt.md");
const APPLY_PATCH_HELPER = loadPrompt("apply_patch_instructions.md");

const MODEL_DEFINITIONS: ModelDefinition[] = [
  {
    match: (model) => model.startsWith("gpt-5-codex"),
    baseInstructions: GPT5_CODEX_PROMPT,
    needsApplyPatchHelper: false,
  },
  {
    match: (model) => model.startsWith("codex-"),
    baseInstructions: GPT5_CODEX_PROMPT,
    needsApplyPatchHelper: false,
  },
  {
    match: (model) => model.startsWith("gpt-5"),
    baseInstructions: BASE_PROMPT,
    needsApplyPatchHelper: true,
  },
  {
    match: (model) => model.startsWith("gpt-4.1"),
    baseInstructions: BASE_PROMPT,
    needsApplyPatchHelper: true,
  },
  {
    match: (model) => model.startsWith("gpt-4o"),
    baseInstructions: BASE_PROMPT,
    needsApplyPatchHelper: true,
  },
  {
    match: (model) => model.startsWith("gpt-3.5"),
    baseInstructions: BASE_PROMPT,
    needsApplyPatchHelper: true,
  },
  {
    match: (model) => model.startsWith("o3") || model.startsWith("o4-mini"),
    baseInstructions: BASE_PROMPT,
    needsApplyPatchHelper: true,
  },
  {
    match: (model) => model.startsWith("codex-mini-latest"),
    baseInstructions: BASE_PROMPT,
    needsApplyPatchHelper: true,
  },
  {
    match: () => true,
    baseInstructions: BASE_PROMPT,
    needsApplyPatchHelper: false,
  },
];

function loadPrompt(fileName: string): string {
  return readFileSync(join(promptsDir, fileName), "utf-8").trimEnd();
}

function resolveModelDefinition(model: string): ModelDefinition {
  const match = MODEL_DEFINITIONS.find((definition) => definition.match(model));
  return match ?? MODEL_DEFINITIONS[MODEL_DEFINITIONS.length - 1]!;
}

export function getModelInstructions(
  model: string,
  options: InstructionsOptions = {},
): string {
  const definition = resolveModelDefinition(model);
  const includeApplyPatch = definition.needsApplyPatchHelper && !options.includeApplyPatchTool;
  if (!includeApplyPatch) {
    return definition.baseInstructions;
  }
  return `${definition.baseInstructions}\n${APPLY_PATCH_HELPER}`;
}
