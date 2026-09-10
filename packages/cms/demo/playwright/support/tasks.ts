import { copy, ensureDir, pathExists, readJson, remove } from "fs-extra";
import { resolve } from "node:path";
import simpleGit from "simple-git";

const projectRoot = resolve(__dirname, "..", "..");
const testContentDir = resolve(projectRoot, "test-content");
const fixturesRoot = resolve(projectRoot, "playwright", "fixtures");

export function fixturePath(...segments: string[]): string {
  return resolve(fixturesRoot, ...segments);
}

/** Must match `PORT` in playwright.config.ts. */
const serverURL = "http://localhost:3011";

/**
 * Whether any reset has been attempted yet in this worker.
 *
 * The tolerance below is deliberately one-shot; see `resetData`.
 */
let firstReset = true;

export async function resetData(fixture?: string): Promise<void> {
  await remove(testContentDir);
  if (fixture) {
    await copy(fixturePath("test-content", fixture), testContentDir);
  } else {
    await ensureDir(testContentDir);
  }
  /*
   * Rewinding the content directory is not a write, so it fires no cache tags
   * and the running server has no way to learn the corpus went backwards. Tell
   * it explicitly, or a page cached by one test leaks into the next.
   *
   * Tolerates failure on the *first* call only: that one can land before the
   * server is up, and there is nothing cached yet at that point. Every later
   * failure throws. Swallowing them all — which is what this did — turns a
   * dead reset endpoint into a poisoned cache that surfaces as an unrelated
   * assertion failing in whichever test happens to run next, and makes the
   * whole suite quietly order-dependent. That is a debugging session nobody
   * should have to repeat.
   */
  const attempt = fetch(`${serverURL}/test/reset-cache`, { method: "POST" });
  if (firstReset) {
    firstReset = false;
    await attempt.catch(() => {});
    return;
  }
  const response = await attempt;
  if (!response.ok) {
    throw new Error(
      `POST ${serverURL}/test/reset-cache failed: ${response.status} ${response.statusText}`,
    );
  }
}

export async function copyFixtures(fixtureName: string): Promise<void> {
  const fixtureDir = fixturePath("test-content", fixtureName);
  await remove(fixtureDir);
  await copy(testContentDir, fixtureDir);
}

/** One index's entry in the dirty-page artifact. */
export interface PaginationIndexChanges {
  dirtyPages: number[];
  removedPages: number[];
  headPage: number;
  total: number;
}

const changesPath = resolve(testContentDir, ".pagination-changes.json");

/**
 * The dirty-page artifact the write path accumulates, keyed
 * `<contentType>/<indexName>`. Missing file reads as no recorded changes.
 */
export async function readPaginationChanges(): Promise<
  Record<string, PaginationIndexChanges>
> {
  if (!(await pathExists(changesPath))) return {};
  const parsed = await readJson(changesPath);
  return parsed?.indexes ?? {};
}

/**
 * The other half of the same artifact: which aggregates moved, as
 * `<contentType>/<name>`. Absent reads as none, which is the common case — an
 * aggregate is unchanged by almost every write.
 */
export async function readAggregateChanges(): Promise<string[]> {
  if (!(await pathExists(changesPath))) return [];
  const parsed = await readJson(changesPath);
  return parsed?.aggregates ?? [];
}

/**
 * Clear it, so the next assertion sees exactly one write's worth of change.
 *
 * Specs call this *after* `resetData`: the artifact is a dotfile inside the
 * content directory and `copyFixtures` copies the directory whole, so a
 * fixture carries whatever the generator left behind.
 */
export async function clearPaginationChanges(): Promise<void> {
  await remove(changesPath);
}

export async function getContentGitLog(): Promise<string[]> {
  const git = simpleGit(testContentDir);
  const log = await git.log();
  return log.all.map((item) => item.message);
}

export async function getContentGitCommitFiles(): Promise<
  Array<{ message: string; files: string[] }>
> {
  const git = simpleGit(testContentDir);
  const log = await git.log();
  const result: Array<{ message: string; files: string[] }> = [];
  for (let i = 0; i < log.all.length - 1; i++) {
    const entry = log.all[i];
    const nextEntry = log.all[i + 1];
    const diff = await git.diffSummary([entry.hash, nextEntry.hash]);
    result.push({
      message: entry.message,
      files: diff.files.map((f) => f.file),
    });
  }
  return result;
}

export async function initializeContentGit(): Promise<void> {
  await ensureDir(testContentDir);
  const git = simpleGit(testContentDir);
  await git.init();
  await git.add(".").commit("Initial commit", { "--allow-empty": null });
}
