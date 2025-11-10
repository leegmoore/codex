const USER_INSTRUCTIONS_OPEN_TAG = "<user_instructions>";
const USER_INSTRUCTIONS_CLOSE_TAG = "</user_instructions>";

export function formatUserInstructionsBlock(text: string): string {
  return `${USER_INSTRUCTIONS_OPEN_TAG}\n\n${text}\n\n${USER_INSTRUCTIONS_CLOSE_TAG}`;
}

export function buildEnvironmentContextText(): string {
  const cwd = escapeForXml(process.cwd());
  const approvalPolicy = readEnvValue("CODEX_APPROVAL_POLICY");
  const sandboxMode = readEnvValue("CODEX_SANDBOX_MODE");
  const networkAccess = readEnvValue("CODEX_NETWORK_ACCESS");
  const writableRoots = readWritableRoots();
  const shellName = extractShellName();

  const lines: string[] = ["<environment_context>"];
  lines.push(`  <cwd>${cwd}</cwd>`);
  if (approvalPolicy) {
    lines.push(`  <approval_policy>${escapeForXml(approvalPolicy)}</approval_policy>`);
  }
  if (sandboxMode) {
    lines.push(`  <sandbox_mode>${escapeForXml(sandboxMode)}</sandbox_mode>`);
  }
  if (networkAccess) {
    lines.push(`  <network_access>${escapeForXml(networkAccess)}</network_access>`);
  }
  if (writableRoots.length > 0) {
    lines.push("  <writable_roots>");
    for (const root of writableRoots) {
      lines.push(`    <root>${escapeForXml(root)}</root>`);
    }
    lines.push("  </writable_roots>");
  }
  if (shellName) {
    lines.push(`  <shell>${escapeForXml(shellName)}</shell>`);
  }
  lines.push("</environment_context>");

  return lines.join("\n");
}

function readEnvValue(key: string): string | null {
  const value = process.env[key];
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readWritableRoots(): string[] {
  const raw = readEnvValue("CODEX_WRITABLE_ROOTS");
  if (!raw) {
    return [];
  }
  const delimiter = process.platform === "win32" ? ";" : ":";
  return raw
    .split(delimiter)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function extractShellName(): string | null {
  const explicit = readEnvValue("CODEX_SHELL_NAME");
  if (explicit) {
    return explicit;
  }
  const shellPath = readEnvValue("SHELL");
  if (!shellPath) {
    return null;
  }
  const segments = shellPath.split(/[/\\]/).filter(Boolean);
  return segments.pop() ?? null;
}

function escapeForXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

