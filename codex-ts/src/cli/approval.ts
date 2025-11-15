import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function promptApproval(
  _toolName: string,
  _args: unknown,
): Promise<boolean> {
  const rl = readline.createInterface({ input, output, terminal: true });
  try {
    for (;;) {
      const answer = (await rl.question("Approve? (y/n): "))
        .trim()
        .toLowerCase();

      if (answer === "y" || answer === "yes") {
        return true;
      }
      if (answer === "n" || answer === "no") {
        return false;
      }
      console.log("Please respond with 'y' or 'n'.");
    }
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_USE_AFTER_CLOSE" ||
      (error as Error).name === "AbortError"
    ) {
      return false;
    }
    throw error;
  } finally {
    rl.close();
  }
}
