/**
 * User agent utilities for backend client.
 *
 * Simplified implementation for Phase 4.3.
 * Full implementation in codex-rs/core/src/default_client.rs includes:
 * - Build version from package.json
 * - OS information
 * - Terminal information
 * - User agent suffix
 *
 * TODO(Phase 5): Port full user agent implementation from Rust
 */

/**
 * Get the Codex user agent string.
 *
 * @returns User agent string (simplified for Phase 4.3)
 */
export function getCodexUserAgent(): string {
  // Simplified version for Phase 4.3
  // Full version would include: codex/VERSION (OS; ARCH) Terminal/VERSION
  return "codex-ts/0.0.0";
}
