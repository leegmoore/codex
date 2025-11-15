import {
  AuthManager,
  CodexAuth,
} from "../../src/core/auth/index.js";

/**
 * Create an AuthManager instance backed by a static API key.
 *
 * @param apiKey - API key to embed in the manager (default: sk-test-123)
 */
export function createMockAuthManager(apiKey = "sk-test-123"): AuthManager {
  const auth = CodexAuth.fromApiKey(apiKey);
  return AuthManager.fromAuthForTesting(auth);
}

