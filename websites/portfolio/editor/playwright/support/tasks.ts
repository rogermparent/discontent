import { copy, outputJSON, remove, writeFile } from "fs-extra";
import { resolve } from "node:path";
import simpleGit from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { portfolioContentTypes } from "../../controller/contentTypes";

/*
 * Filesystem-side test setup. Deliberately narrower than recipe's: the
 * git-*remote* fixtures (bare repos, clones, push/pull round-trips) are omitted
 * because the git-sync UI is out of scope for portfolio v1. Local content-git is
 * kept, since the write path commits on every save.
 */

const projectRoot = resolve(__dirname, "..", "..");
const testContentDir = resolve(projectRoot, "test-content");
const testSettingsDir = resolve(projectRoot, "test-settings");
const fixturesRoot = resolve(projectRoot, "playwright", "fixtures");

export function fixturePath(...segments: string[]): string {
  return resolve(fixturesRoot, ...segments);
}

/**
 * A path relative to the editor package root.
 *
 * For assets that belong to the *app* rather than to the suite — the seed
 * cover, for instance, which is starter content a fork receives and so has no
 * business living under `playwright/`. Recipe carries the same helper.
 */
export function projectPath(relative: string): string {
  return resolve(projectRoot, relative);
}

export async function resetData(fixture?: string): Promise<void> {
  await remove(testSettingsDir);
  await remove(testContentDir);
  if (fixture) {
    await copy(fixturePath("test-content", fixture), testContentDir);
  }
  await copy(fixturePath("users"), resolve(testContentDir, "users"));
}

/** Snapshot the current test content back into a named fixture. */
export async function copyFixtures(fixtureName: string): Promise<void> {
  const fixtureDir = fixturePath("test-content", fixtureName);
  await remove(fixtureDir);
  await copy(testContentDir, fixtureDir);
}

export async function getContentGitLog(): Promise<string[]> {
  const log = await simpleGit(testContentDir).log();
  return log.all.map((item) => item.message);
}

export async function initializeContentGit(): Promise<void> {
  const git = simpleGit(testContentDir);
  await git.init();
  /*
   * The LMDB index is derived state rebuilt from the JSON, and transformed
   * images are build output — committing either makes every save a huge diff.
   *
   * Derived from the registry (F21) rather than the two index directories this
   * used to name. When that was written, the four extra lines it gained were
   * all paths nothing created — which was the point, and F29 collected on it:
   * `projects/pagination` was already ignored here on the day `projects`
   * started writing into it, so §11.2's adoption needed no edit to this file
   * and the ignore list could not be the thing that was forgotten.
   */
  await writeFile(
    resolve(testContentDir, ".gitignore"),
    derivedContentPaths(portfolioContentTypes),
  );
  await git.add(".").commit("Initial commit");
}

export async function writeSettings(
  settings: Record<string, unknown>,
): Promise<void> {
  await outputJSON(resolve(testSettingsDir, "settings.json"), settings, {
    spaces: 2,
  });
}
