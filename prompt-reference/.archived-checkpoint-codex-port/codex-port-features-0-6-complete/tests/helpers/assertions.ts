import { expect } from "bun:test";

export async function expectErrorMessage<T>(
  promise: Promise<T>,
  message: string | RegExp,
): Promise<void> {
  await expect(promise).rejects.toThrow(message);
}
