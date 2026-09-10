import {
  copy,
  ensureDir,
  outputJSON,
  pathExists,
  readFile,
  readJSON,
  remove,
  writeFile,
} from "fs-extra";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import simpleGit from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { recipeContentTypes } from "../../controller/contentTypes";
import { addTokenToUser } from "../../src/users";

const projectRoot = resolve(__dirname, "..", "..");
const testContentDir = resolve(projectRoot, "test-content");
const testSettingsDir = resolve(projectRoot, "test-settings");
const testRemotesDir = resolve(projectRoot, "test-remotes");
const testClonesDir = resolve(projectRoot, "test-clones");
const fixturesRoot = resolve(projectRoot, "playwright", "fixtures");

export function fixturePath(...segments: string[]): string {
  return resolve(fixturesRoot, ...segments);
}

export function projectPath(relative: string): string {
  return resolve(projectRoot, relative);
}

export async function resetData(fixture?: string): Promise<void> {
  await remove(testSettingsDir);
  await remove(testContentDir);
  await remove(testRemotesDir);
  await remove(testClonesDir);
  if (fixture) {
    await copy(fixturePath("test-content", fixture), testContentDir);
  }
  await copy(fixturePath("users"), resolve(testContentDir, "users"));
}

/**
 * Mint an API token for a fixture user (22d/D10).
 *
 * Written straight into `test-content/users/<email>` through `src/users` — the
 * same module the server reads it back with, so the test cannot pass against a
 * path or a hash format the app does not use. That is the whole reason it goes
 * through the module rather than writing the JSON here.
 *
 * Call it *after* `resetData`, which recreates `test-content/users/` from the
 * fixture and would otherwise wipe the token.
 */
export async function createApiToken(
  email = "admin@nextmail.com",
  name = "playwright",
): Promise<string> {
  return addTokenToUser(testContentDir, email, name);
}

/**
 * A digest of the featured-recipes content index, as bytes on disk.
 *
 * The engine's dependent pass opens this environment only when a write moves a
 * field something borrows, and LMDB advances the meta page on any commit — so
 * an unchanged digest is the observable form of "this write did no featured
 * work at all", not merely "it wrote the same value back".
 *
 * Hashing the file rather than reading the index keeps the test process out of
 * LMDB entirely, so it cannot contend with the server that has the same
 * environment open. Absent file hashes to "", which is what a fixture with no
 * featured recipes gives.
 */
export async function readFeaturedRecipeIndexDigest(): Promise<string> {
  const dataFile = resolve(
    testContentDir,
    "featured-recipes",
    "index",
    "data.mdb",
  );
  if (!(await pathExists(dataFile))) return "";
  return createHash("sha256")
    .update(await readFile(dataFile))
    .digest("hex");
}

/**
 * Corrupt a recipe's data file behind the app's back.
 *
 * The point is a read that *must not happen*: a featured card renders from
 * borrowed values on the featured index, so it survives its recipe becoming
 * unparseable. Invalid JSON rather than a deletion, so the failure is a parse
 * error on a file that is still there — no code path can mistake it for the
 * ordinary dangling-reference case.
 */
export async function makeRecipeUnreadable(slug: string): Promise<void> {
  await writeFile(
    resolve(testContentDir, "recipes", "data", slug, "recipe.json"),
    "{ this is not json",
  );
}

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
   * Every derived directory, from the same source the production writer uses
   * (§13, F21) — this list and that one drifted apart twice before they shared
   * an owner, in both directions: `/featured-recipes/index` was missing here
   * until D2a, and `/pages/index` was present only here.
   */
  await writeFile(
    resolve(testContentDir, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
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

export async function loadGitFixture(fixture: string): Promise<void> {
  await remove(testContentDir);
  const fixtureBundlePath = fixturePath("git-test-content", fixture);
  await simpleGit().clone(fixtureBundlePath, testContentDir);
}

/** Create an empty bare repo to act as a sync remote. Returns its path. */
export async function createBareRemote(name = "origin"): Promise<string> {
  const remotePath = resolve(testRemotesDir, `${name}.git`);
  await remove(remotePath);
  await ensureDir(remotePath);
  await simpleGit().raw(["init", "--bare", remotePath]);
  return remotePath;
}

/** Point the content repo at a remote and push the current branch, setting upstream. */
export async function addRemoteAndPush(
  remoteUrl: string,
  name = "origin",
): Promise<void> {
  const git = simpleGit(testContentDir);
  await git.addRemote(name, remoteUrl);
  const status = await git.status();
  await git.push(["-u", name, status.current ?? "main"]);
}

/** Clone a remote into a scratch dir representing another app instance. */
export async function cloneFromRemote(
  remoteUrl: string,
  name = "clone",
): Promise<string> {
  const cloneDir = resolve(testClonesDir, name);
  await remove(cloneDir);
  await ensureDir(testClonesDir);
  await simpleGit().clone(remoteUrl, cloneDir);
  const git = simpleGit(cloneDir);
  await git.addConfig("user.email", "other@instance.test");
  await git.addConfig("user.name", "Other Instance");
  return cloneDir;
}

function recipeData(name: string) {
  return {
    name,
    description: "",
    date: 1767734335998,
    prepTime: 0,
    cookTime: 0,
    totalTime: 0,
    recipeYield: "",
  };
}

/** Add a brand-new recipe in a clone and commit it. */
export async function addRecipeInClone(
  cloneDir: string,
  slug: string,
  name: string,
): Promise<void> {
  const file = resolve(cloneDir, "recipes", "data", slug, "recipe.json");
  await outputJSON(file, recipeData(name));
  await simpleGit(cloneDir).add(".").commit(`Add new recipe: ${slug}`);
}

/** Change an existing recipe's name in a clone and commit it. */
export async function editRecipeInClone(
  cloneDir: string,
  slug: string,
  name: string,
): Promise<void> {
  const file = resolve(cloneDir, "recipes", "data", slug, "recipe.json");
  const data = await readJSON(file);
  data.name = name;
  await outputJSON(file, data);
  await simpleGit(cloneDir).add(".").commit(`Update recipe: ${slug}`);
}

/** Push a clone's commits back to its remote. */
export async function pushClone(cloneDir: string): Promise<void> {
  await simpleGit(cloneDir).push();
}

/** Read commit messages directly from a bare remote (empty repo → []). */
export async function getRemoteLog(remoteUrl: string): Promise<string[]> {
  try {
    const log = await simpleGit(remoteUrl).log();
    return log.all.map((item) => item.message);
  } catch {
    return [];
  }
}
