import { test as base, type APIRequestContext } from "@playwright/test";
import * as tasks from "./tasks";

const CACHE_INVALIDATE_PATH = "/settings/test-invalidate-cache";
const HOLD_WRITES_PATH = "/settings/test-hold-writes";

/**
 * Replace `test-content` while the server writes nothing into it (41b,
 * 40-Tf5). `test-hold-writes` answers once the server's writes in flight —
 * whatever the previous test started and did not wait for — have finished,
 * and holds new ones at its write gate; the cache invalidation after the
 * reset releases them. Before this the reset raced those writes: `ENOTEMPTY`
 * on the removal, `EEXIST` on the copy, and a late file kept in the next
 * test's corpus.
 */
async function withWritesHeld(
  request: APIRequestContext,
  reset: () => Promise<void>,
): Promise<void> {
  const held = await request.get(HOLD_WRITES_PATH);
  if (!held.ok()) {
    throw new Error(
      `GET ${HOLD_WRITES_PATH} → ${held.status()}: ${await held.text()}`,
    );
  }
  try {
    await reset();
  } finally {
    await request.get(CACHE_INVALIDATE_PATH);
  }
}

type Fixtures = {
  resetData: (fixture?: string) => Promise<void>;
  loadGitFixture: (fixture: string) => Promise<void>;
  initializeContentGit: () => Promise<void>;
  getContentGitLog: () => Promise<string[]>;
  copyFixtures: (fixtureName: string) => Promise<void>;
  createApiToken: (
    email?: string,
    name?: string,
    scope?: "read" | "write",
  ) => Promise<string>;
  revokeApiToken: (email?: string, name?: string) => Promise<number>;
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
  pushIntoContent: (slug: string, name: string) => Promise<void>;
  getRemoteLog: (remoteUrl: string) => Promise<string[]>;
  /** As if older code had built the indexes (epic 39, D1). */
  writeContentIndexVersion: (version: string) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  /*
   * Playwright's own `request`, minus connection reuse (40f). Every API
   * request context in a worker shares one keep-alive agent
   * (`playwright-core`'s `httpHappyEyeballsAgent`), so a request can go out
   * on a socket a test before left idle — just as the server's keep-alive
   * timeout (Node's 5 s, `next dev` and `next start` alike) closes it. That
   * is `read ECONNRESET` / `socket hang up` on the first request of a test,
   * `resetData`'s cache invalidation as often as not (4 CI retries in 60
   * runs). `Connection: close` keeps no socket to reuse; a loopback
   * handshake per request costs nothing.
   */
  request: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({
      extraHTTPHeaders: { connection: "close" },
    });
    await use(request);
    await request.dispose();
  },
  resetData: async ({ request }, use) => {
    await use((fixture) =>
      withWritesHeld(request, () => tasks.resetData(fixture)),
    );
  },
  loadGitFixture: async ({ request }, use) => {
    await use((fixture) =>
      withWritesHeld(request, () => tasks.loadGitFixture(fixture)),
    );
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
  /* Same: the next request re-reads the user file, so nothing to expire. */
  revokeApiToken: async ({}, use) => {
    await use(tasks.revokeApiToken);
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
  /*
   * Deliberately *no* cache invalidation, unlike `makeRecipeUnreadable`: the
   * point is that the editor is not told, and the stale-index banner is how
   * it finds out (27b).
   */
  /* Read per request (`gitStatus`, the banner): nothing cached to expire. */
  writeContentIndexVersion: async ({}, use) => {
    await use(tasks.writeContentIndexVersion);
  },
  pushIntoContent: async ({}, use) => {
    await use(tasks.pushIntoContent);
  },
  getRemoteLog: async ({}, use) => {
    await use(tasks.getRemoteLog);
  },
});

export { expect } from "@playwright/test";
export type { Page, Locator } from "@playwright/test";
