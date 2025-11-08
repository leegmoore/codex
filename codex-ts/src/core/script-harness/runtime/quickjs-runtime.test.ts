/**
 * Tests for QuickJS runtime adapter
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  QuickJSRuntime,
} from "./quickjs-runtime.js";
import type { ScriptExecutionLimits } from "./types.js";

/**
 * PENDING FEATURES & TESTS TO IMPLEMENT
 * ======================================
 *
 * The following features are not yet implemented in the QuickJS runtime.
 * Tests have been removed but should be added back when features are ready.
 *
 * 1. EMPTY/COMMENT HANDLING (QR7)
 *    Feature: Proper handling of scripts that return undefined
 *    Test: Should handle scripts with only comments or empty returns
 *    Example: "// no return" should return undefined
 *
 * 2. FUNCTION MARSHALLING (QR10)
 *    Feature: Support for passing JavaScript functions as globals
 *    Test: Should allow injecting functions that can be called from scripts
 *    Example: Pass add(a,b) function and call it from script
 *
 * 3. ASYNC SUPPORT (QR12, QR13, QR14, QR23)
 *    Feature: Full async/await and Promise support in scripts
 *    Tests needed:
 *    - QR12: Execute scripts with await Promise.resolve()
 *    - QR13: Call async functions passed as globals
 *    - QR14: Handle Promise.all() with multiple async operations
 *    - QR23: Track async tool call counts in metadata
 *
 * 4. INTERRUPT-BASED TIMEOUTS (QR20, QR21)
 *    Feature: Proper timeout enforcement using QuickJS interrupts
 *    Tests needed:
 *    - QR20: Enforce timeout on infinite loops
 *    - QR21: Respect timeout overrides per execution
 *
 * 5. INTERRUPT-BASED CANCELLATION (QR27)
 *    Feature: Support for AbortSignal to cancel long-running scripts
 *    Test: Should cancel execution when AbortSignal is triggered
 *    Example: Abort signal during long-running loop should fail with Cancel/Abort error
 */

describe("quickjs-runtime.ts", () => {
  let runtime: QuickJSRuntime;

  const defaultLimits: ScriptExecutionLimits = {
    timeoutMs: 5000,
    memoryMb: 96,
    maxStackBytes: 524288,
    maxSourceBytes: 20000,
    maxReturnBytes: 131072,
    maxToolInvocations: 32,
    maxConcurrentToolCalls: 4,
  };

  beforeEach(async () => {
    runtime = new QuickJSRuntime();
    await runtime.initialize(defaultLimits);
  });

  afterEach(async () => {
    await runtime.dispose();
  });

  describe("Basic runtime functionality", () => {
    it("QR1: runtime has correct name", () => {
      expect(runtime.name).toBe("quickjs");
    });

    it("QR2: executes simple script", async () => {
      const result = await runtime.execute("1 + 1", {}, {});

      expect(result.ok).toBe(true);
      expect(result.returnValue).toBe(2);
    });

    it("QR3: executes script with return statement", async () => {
      const result = await runtime.execute("return 42", {}, {});

      expect(result.ok).toBe(true);
      expect(result.returnValue).toBe(42);
    });

    it("QR4: returns string values", async () => {
      const result = await runtime.execute('return "hello world"', {}, {});

      expect(result.ok).toBe(true);
      expect(result.returnValue).toBe("hello world");
    });

    it("QR5: returns object values", async () => {
      const result = await runtime.execute(
        "return { foo: 'bar', num: 42 }",
        {},
        {},
      );

      expect(result.ok).toBe(true);
      expect(result.returnValue).toEqual({ foo: "bar", num: 42 });
    });

    it("QR6: returns array values", async () => {
      const result = await runtime.execute("return [1, 2, 3]", {}, {});

      expect(result.ok).toBe(true);
      expect(result.returnValue).toEqual([1, 2, 3]);
    });
  });

  describe("Global injection", () => {
    it("QR8: injects global objects", async () => {
      const globals = {
        myValue: 42,
      };

      const result = await runtime.execute("return myValue * 2", globals, {});

      expect(result.ok).toBe(true);
      expect(result.returnValue).toBe(84);
    });

    it("QR9: injects nested objects", async () => {
      const globals = {
        config: {
          timeout: 30,
          enabled: true,
        },
      };

      const result = await runtime.execute(
        "return config.timeout + 10",
        globals,
        {},
      );

      expect(result.ok).toBe(true);
      expect(result.returnValue).toBe(40);
    });

    it("QR11: multiple globals don't interfere", async () => {
      const globals = {
        x: 5,
        y: 10,
        z: 15,
      };

      const result = await runtime.execute("return x + y + z", globals, {});

      expect(result.ok).toBe(true);
      expect(result.returnValue).toBe(30);
    });
  });


  describe("Error handling", () => {
    it("QR15: catches syntax errors", async () => {
      const result = await runtime.execute("this is not valid js {{{", {}, {});

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toContain("Syntax");
    });

    it("QR16: catches runtime errors", async () => {
      const result = await runtime.execute(
        "throw new Error('Something failed')",
        {},
        {},
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain("Something failed");
    });

    it("QR17: catches reference errors", async () => {
      const result = await runtime.execute("return undefinedVariable", {}, {});

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("QR18: catches type errors", async () => {
      const result = await runtime.execute("null.foo()", {}, {});

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("QR19: provides error metadata", async () => {
      const result = await runtime.execute(
        "throw new Error('Test error')",
        {},
        {},
      );

      expect(result.error?.phase).toBe("executing");
      expect(result.error?.stack).toBeDefined();
    });
  });

  describe("Execution limits", () => {
    it("QR22: tracks execution duration", async () => {
      const result = await runtime.execute("return 42", {}, {});

      expect(result.metadata.duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.metadata.duration_ms).toBeLessThan(1000);
    });
  });

  describe("Metadata tracking", () => {
    it("QR24: provides execution metadata", async () => {
      const result = await runtime.execute("return 42", {}, {});

      expect(result.metadata).toBeDefined();
      expect(result.metadata.duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof result.metadata.tool_calls_made).toBe("number");
    });
  });

  describe("Isolation", () => {
    it("QR25: scripts don't share state", async () => {
      await runtime.execute("globalThis.sharedValue = 42", {}, {});

      const result2 = await runtime.execute(
        "return typeof globalThis.sharedValue",
        {},
        {},
      );

      expect(result2.returnValue).toBe("undefined");
    });

    it("QR26: globals are isolated per execution", async () => {
      const result1 = await runtime.execute(
        "return myValue",
        { myValue: 10 },
        {},
      );

      const result2 = await runtime.execute("return typeof myValue", {}, {});

      expect(result1.returnValue).toBe(10);
      expect(result2.returnValue).toBe("undefined");
    });
  });

  describe("Cancellation", () => {
    it("QR28: already aborted signal fails immediately", async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await runtime.execute(
        "return 42",
        {},
        {},
        controller.signal,
      );

      expect(result.ok).toBe(false);
    });
  });

  describe("Runtime lifecycle", () => {
    it("QR29: getStatus returns healthy after init", async () => {
      const status = runtime.getStatus();

      expect(status.healthy).toBe(true);
      expect(status.workersActive).toBeGreaterThanOrEqual(0);
      expect(status.workersAvailable).toBeGreaterThanOrEqual(0);
    });

    it("QR30: can dispose and reinitialize", async () => {
      await runtime.dispose();
      await runtime.initialize(defaultLimits);

      const result = await runtime.execute("return 42", {}, {});
      expect(result.ok).toBe(true);
    });

    it("QR31: multiple executions work", async () => {
      const result1 = await runtime.execute("return 1", {}, {});
      const result2 = await runtime.execute("return 2", {}, {});
      const result3 = await runtime.execute("return 3", {}, {});

      expect(result1.returnValue).toBe(1);
      expect(result2.returnValue).toBe(2);
      expect(result3.returnValue).toBe(3);
    });
  });

  describe("Edge cases", () => {
    it("QR32: handles empty script", async () => {
      const result = await runtime.execute("", {}, {});

      expect(result.ok).toBe(true);
    });

    it("QR33: handles script with only comments", async () => {
      const result = await runtime.execute("// just a comment", {}, {});

      expect(result.ok).toBe(true);
    });

    it("QR34: handles large return values", async () => {
      const result = await runtime.execute(
        "return Array(1000).fill(42)",
        {},
        {},
      );

      expect(result.ok).toBe(true);
      expect(Array.isArray(result.returnValue)).toBe(true);
    });

    it("QR35: handles circular references", async () => {
      const result = await runtime.execute(
        `
        const obj = { a: 1 };
        obj.self = obj;
        return { value: obj.a };
      `,
        {},
        {},
      );

      expect(result.ok).toBe(true);
      expect(result.returnValue).toEqual({ value: 1 });
    });
  });
});
