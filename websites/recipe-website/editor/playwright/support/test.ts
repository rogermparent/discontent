import { test as base } from "@playwright/test";
import * as tasks from "./tasks";

const CACHE_INVALIDATE_PATH = "/settings/test-invalidate-cache";

type Fixtures = {
  resetData: (fixture?: string) => Promise<void>;
  loadGitFixture: (fixture: string) => Promise<void>;
  initializeContentGit: () => Promise<void>;
  getContentGitLog: () => Promise<string[]>;
  copyFixtures: (fixtureName: string) => Promise<void>;
  createApiToken: (email?: string, name?: string) => Promise<string>;
  readFeaturedRecipeIndexDigest: () => Promise<string>;
  makeRecipeUnreadable: (slug: string) => Promise<void>;
  writeSettings: (settings: Record<string, unknown>) => Promise<void>;
  createBareRemote: (name?: string) => Promise<string>;
  addRemoteAndPush: (remoteUrl: string, name?: string) => Promise<void>;
  cloneFromRemote: (remoteUrl: string, name?: string) => Promise<string>;
  addRecipeInClone: (
    cloneDir: string,
    slug: string,
    name: string,
  ) => Promise<void>;
  editRecipeInClone: (
    cloneDir: string,
    slug: string,
    name: string,
  ) => Promise<void>;
  pushClone: (cloneDir: string) => Promise<void>;
  getRemoteLog: (remoteUrl: string) => Promise<string[]>;
};

export const test = base.extend<Fixtures>({
  resetData: async ({ request }, use) => {
    await use(async (fixture) => {
      await tasks.resetData(fixture);
      await request.get(CACHE_INVALIDATE_PATH);
    });
  },
  loadGitFixture: async ({ request }, use) => {
    await use(async (fixture) => {
      await tasks.loadGitFixture(fixture);
      await request.get(CACHE_INVALIDATE_PATH);
    });
  },
  initializeContentGit: async ({ request }, use) => {
    await use(async () => {
      await tasks.initializeContentGit();
      await request.get(CACHE_INVALIDATE_PATH);
    });
  },
  getContentGitLog: async ({}, use) => {
    await use(tasks.getContentGitLog);
  },
  copyFixtures: async ({}, use) => {
    await use(tasks.copyFixtures);
  },
  /*
   * No cache invalidation: a token is read per request straight off disk, so
   * there is nothing cached to expire. `resetData` recreates `users/`, so this
   * must be called after it.
   */
  createApiToken: async ({}, use) => {
    await use(tasks.createApiToken);
  },
  readFeaturedRecipeIndexDigest: async ({}, use) => {
    await use(tasks.readFeaturedRecipeIndexDigest);
  },
  makeRecipeUnreadable: async ({ request }, use) => {
    // Invalidated like `resetData`: this edits the content directory from
    // outside the app, so nothing has told the render cache the corpus moved.
    await use(async (slug) => {
      await tasks.makeRecipeUnreadable(slug);
      await request.get(CACHE_INVALIDATE_PATH);
    });
  },
  writeSettings: async ({ request }, use) => {
    await use(async (settings) => {
      await tasks.writeSettings(settings);
      await request.get(CACHE_INVALIDATE_PATH);
    });
  },
  createBareRemote: async ({}, use) => {
    await use(tasks.createBareRemote);
  },
  addRemoteAndPush: async ({ request }, use) => {
    await use(async (remoteUrl, name) => {
      await tasks.addRemoteAndPush(remoteUrl, name);
      await request.get(CACHE_INVALIDATE_PATH);
    });
  },
  cloneFromRemote: async ({}, use) => {
    await use(tasks.cloneFromRemote);
  },
  addRecipeInClone: async ({}, use) => {
    await use(tasks.addRecipeInClone);
  },
  editRecipeInClone: async ({}, use) => {
    await use(tasks.editRecipeInClone);
  },
  pushClone: async ({}, use) => {
    await use(tasks.pushClone);
  },
  getRemoteLog: async ({}, use) => {
    await use(tasks.getRemoteLog);
  },
});

export { expect } from "@playwright/test";
export type { Page, Locator } from "@playwright/test";
