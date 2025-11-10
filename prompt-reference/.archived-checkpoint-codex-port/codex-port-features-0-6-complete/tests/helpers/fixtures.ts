import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  mkdtemp as mkdtempAsync,
  mkdir as mkdirAsync,
  rm as rmAsync,
  writeFile as writeFileAsync,
} from "node:fs/promises";

const trackedTempDirs = new Set<string>();
const TEMP_DIR_PREFIX = "codex-port-";

export async function createTempDir(prefix = TEMP_DIR_PREFIX): Promise<string> {
  const dir = await mkdtempAsync(join(tmpdir(), prefix));
  trackedTempDirs.add(dir);
  return dir;
}

export async function createTempFile(
  dir: string,
  name: string,
  content: string,
): Promise<string> {
  await mkdirAsync(dir, { recursive: true });
  const filePath = join(dir, name);
  await writeFileAsync(filePath, content);
  return filePath;
}

export async function cleanupTempDirs(): Promise<void> {
  await Promise.all(
    Array.from(trackedTempDirs, async (dir) => {
      await rmAsync(dir, { recursive: true, force: true });
    }),
  );
  trackedTempDirs.clear();
}
