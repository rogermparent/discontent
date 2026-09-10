import { test as base } from "@playwright/test";
import * as tasks from "./tasks";

type Fixtures = {
  resetData: (fixture?: string) => Promise<void>;
  initializeContentGit: () => Promise<void>;
  getContentGitLog: () => Promise<string[]>;
  copyFixtures: (fixtureName: string) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  resetData: async ({ request }, use) => {
    await use(async (fixture) => {
      await tasks.resetData(fixture);
      await request.get("/settings/invalidate-cache");
    });
  },
  initializeContentGit: async ({}, use) => {
    await use(tasks.initializeContentGit);
  },
  getContentGitLog: async ({}, use) => {
    await use(tasks.getContentGitLog);
  },
  copyFixtures: async ({}, use) => {
    await use(tasks.copyFixtures);
  },
});

export { expect } from "@playwright/test";
