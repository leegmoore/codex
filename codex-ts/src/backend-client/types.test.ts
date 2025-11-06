import { describe, test, expect } from "vitest";
import {
  type CodeTaskDetailsResponse,
  unifiedDiff,
  assistantTextMessages,
  userTextPrompt,
  assistantErrorMessage,
} from "./types";
import { readFileSync } from "fs";
import { join } from "path";

function fixture(name: string): CodeTaskDetailsResponse {
  const path = join(
    __dirname,
    "__fixtures__",
    `task_details_with_${name}.json`,
  );
  const json = readFileSync(path, "utf-8");
  return JSON.parse(json);
}

describe("CodeTaskDetailsResponse", () => {
  test("unified_diff_prefers_current_diff_task_turn", () => {
    const details = fixture("diff");
    const diff = unifiedDiff(details);
    expect(diff).toBeDefined();
    expect(diff).toContain("diff --git");
  });

  test("unified_diff_falls_back_to_pr_output_diff", () => {
    const details = fixture("error");
    const diff = unifiedDiff(details);
    expect(diff).toBeDefined();
    expect(diff).toContain("lib.rs");
  });

  test("assistant_text_messages_extracts_text_content", () => {
    const details = fixture("diff");
    const messages = assistantTextMessages(details);
    expect(messages).toEqual(["Assistant response"]);
  });

  test("user_text_prompt_joins_parts_with_spacing", () => {
    const details = fixture("diff");
    const prompt = userTextPrompt(details);
    expect(prompt).toBe("First line\n\nSecond line");
  });

  test("assistant_error_message_combines_code_and_message", () => {
    const details = fixture("error");
    const msg = assistantErrorMessage(details);
    expect(msg).toBe("APPLY_FAILED: Patch could not be applied");
  });
});
