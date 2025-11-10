import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const AUTH_RELATIVE_PATH = join(".codex", "auth.json");
const AUTH_ERROR = "No authentication found in ~/.codex/auth.json";

interface AuthJson {
  tokens?: {
    access_token?: string | null;
    account_id?: string | null;
  } | null;
}

export interface AuthInfo {
  token: string;
  accountId?: string;
}

function resolveAuthPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || homedir();
  return join(home, AUTH_RELATIVE_PATH);
}

function normalize(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function readAuthJson(): Promise<AuthJson> {
  const authPath = resolveAuthPath();
  let raw: string;

  try {
    raw = await readFile(authPath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      throw new Error(AUTH_ERROR);
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(AUTH_ERROR);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(AUTH_ERROR);
  }

  return parsed as AuthJson;
}

export async function loadAuthInfo(): Promise<AuthInfo> {
  const auth = await readAuthJson();

  const oauthToken = normalize(auth.tokens?.access_token);
  if (oauthToken) {
    const accountId = normalize(auth.tokens?.account_id);
    return accountId ? { token: oauthToken, accountId } : { token: oauthToken };
  }

  throw new Error(AUTH_ERROR);
}

export async function loadAuth(): Promise<string> {
  const info = await loadAuthInfo();
  return info.token;
}
