import { copy, ensureDir, remove } from "fs-extra";
import { resolve } from "node:path";
import simpleGit from "simple-git";

const projectRoot = resolve(__dirname, "..", "..");
const testContentDir = resolve(projectRoot, "test-content");
const fixturesRoot = resolve(projectRoot, "playwright", "fixtures");

export function fixturePath(...segments: string[]): string {
  return resolve(fixturesRoot, ...segments);
}

export async function resetData(fixture?: string): Promise<void> {
  await remove(testContentDir);
  if (fixture) {
    await copy(fixturePath("test-content", fixture), testContentDir);
  } else {
    await ensureDir(testContentDir);
  }
}

export async function copyFixtures(fixtureName: string): Promise<void> {
  const fixtureDir = fixturePath("test-content", fixtureName);
  await remove(fixtureDir);
  await copy(testContentDir, fixtureDir);
}

export async function getContentGitLog(): Promise<string[]> {
  const git = simpleGit(testContentDir);
  const log = await git.log();
  return log.all.map((item) => item.message);
}

export async function initializeContentGit(): Promise<void> {
  await ensureDir(testContentDir);
  const git = simpleGit(testContentDir);
  await git.init();
  await git.add(".").commit("Initial commit", { "--allow-empty": null });
}
