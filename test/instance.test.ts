// @vitest-environment node
//
// Epic 28, 28c: the instance's background machinery — the runner's
// scheduling, the ref watcher, ssh targets from remote URLs, the repository
// lock, the mirror's ping, and the whole thing end to end on scratch repos
// (a shell commit reindexed without the editor; a workstation commit reaching
// its mirror with no one asking).

import { createServer, type Server } from "http";
import { mkdtemp, outputFile, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import simpleGit, { type SimpleGit } from "simple-git";

import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { readIndexFreshness } from "@discontent/cms/git/indexStamp";
import { readSyncState } from "@discontent/cms/git/syncState";
import { watchRefs } from "@discontent/cms/git/watchRefs";

import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { reindex } from "../websites/recipe-website/editor/controller/curation/reindex";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { createSyncRunner } from "../websites/recipe-website/editor/controller/instance/runner";
import { sshTargetOf } from "../websites/recipe-website/editor/controller/instance/mirrors";
import {
  LockBusyError,
  withRepoLock,
} from "../websites/recipe-website/editor/controller/instance/lock";
import {
  pingWorkstation,
  readPingState,
} from "../websites/recipe-website/editor/controller/instance/pinger";
import {
  getInstance,
  startInstance,
} from "../websites/recipe-website/editor/controller/instance/start";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

const scratch: string[] = [];
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = [
  "CONTENT_DIRECTORY",
  "SETTINGS_DIRECTORY",
  "EDITOR_ROLE",
  "TEST_MODE",
  "INSTANCE_EVENTS",
  "WORKSTATION_URL",
  "WORKSTATION_SYNC_TOKEN",
  "EDITOR_INTERNAL_URL",
];

async function scratchDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  scratch.push(directory);
  return directory;
}

async function initRepo(directory: string): Promise<SimpleGit> {
  const repo = simpleGit({ baseDir: directory });
  await repo.init();
  await repo.addConfig("user.email", "curator@test.local");
  await repo.addConfig("user.name", "Test Curator");
  await repo.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(directory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await repo.add(".");
  await repo.commit("Initial commit");
  return repo;
}

async function shellCommit(repo: SimpleGit, dir: string, file: string) {
  await outputFile(join(dir, file), `${Date.now()}-${Math.random()}\n`);
  await repo.add(".");
  await repo.commit(`Shell: ${file}`);
}

async function eventually<T>(
  probe: () => Promise<T>,
  ok: (value: T) => boolean,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await probe();
  while (!ok(value)) {
    if (Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 200));
    value = await probe();
  }
  return value;
}

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
});

afterEach(async () => {
  getInstance()?.close();
  vi.useRealTimers();
  await closeCachedEnvironments();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  for (const directory of scratch.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* The runner                                                          */
/* ------------------------------------------------------------------ */

describe("createSyncRunner", () => {
  it("debounces a burst of triggers into one run", async () => {
    vi.useFakeTimers();
    const runs: string[][] = [];
    const runner = createSyncRunner({
      debounceMs: 1000,
      run: async (triggers) => {
        runs.push(triggers);
        return runs.length;
      },
    });
    runner.request("change");
    vi.advanceTimersByTime(500);
    runner.request("change");
    runner.request("ping");
    vi.advanceTimersByTime(999);
    expect(runs).toHaveLength(0);
    vi.advanceTimersByTime(1);
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(runs[0]).toEqual(["change", "change", "ping"]);
  });

  it("queues exactly one more run for triggers that arrive mid-run", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    let calls = 0;
    const runner = createSyncRunner({
      debounceMs: 10,
      run: async () => {
        calls += 1;
        if (calls === 1) await new Promise<void>((r) => (release = r));
        return calls;
      },
    });
    runner.request("startup");
    vi.advanceTimersByTime(10);
    await vi.waitFor(() => expect(calls).toBe(1));
    for (let i = 0; i < 5; i++) {
      runner.request("change");
      vi.advanceTimersByTime(10);
    }
    expect(runner.busy).toBe(true);
    release();
    vi.useRealTimers();
    await runner.idle();
    expect(calls).toBe(2);
  });

  it("drops the watcher event for the HEAD its own run produced", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const runner = createSyncRunner({
      debounceMs: 10,
      run: async () => ++calls,
      headAfterRun: async () => "abc123",
    });
    runner.request("startup");
    vi.advanceTimersByTime(10);
    await vi.waitFor(() => expect(calls).toBe(1));
    vi.useRealTimers();
    await runner.idle();
    runner.headMoved("abc123");
    runner.noteOwnHead("def456");
    runner.headMoved("def456");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toBe(1);
    runner.headMoved("something-else");
    await new Promise((resolve) => setTimeout(resolve, 50));
    await runner.idle();
    expect(calls).toBe(2);
  });

  it("runNow waits for the run in progress, then runs and answers", async () => {
    let release!: () => void;
    let calls = 0;
    const runner = createSyncRunner({
      debounceMs: 5,
      run: async () => {
        calls += 1;
        if (calls === 1) await new Promise<void>((r) => (release = r));
        return calls;
      },
    });
    runner.request("startup");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const answer = runner.runNow("manual");
    release();
    expect(await answer).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

describe("sshTargetOf", () => {
  it("reads host and directory off ssh-style remote URLs", () => {
    expect(sshTargetOf("uraninite:recipes")).toEqual({
      sshHost: "uraninite",
      dir: "recipes",
    });
    expect(sshTargetOf("roger@uraninite:~/recipes")).toEqual({
      sshHost: "uraninite",
      dir: "~/recipes",
    });
    expect(sshTargetOf("ssh://roger@uraninite:22/~/recipes")).toEqual({
      sshHost: "uraninite",
      dir: "~/recipes",
    });
    expect(sshTargetOf("ssh://uraninite/srv/recipes")).toEqual({
      sshHost: "uraninite",
      dir: "/srv/recipes",
    });
  });

  it("gives nothing for a local path or an https URL", () => {
    expect(sshTargetOf("/tmp/mirror")).toEqual({});
    expect(sshTargetOf("https://example.com/recipes.git")).toEqual({});
  });
});

describe("watchRefs", () => {
  it("reports one change for a burst of commits, and none without one", async () => {
    const dir = await scratchDir("watch-");
    const repo = await initRepo(dir);
    const changes: string[] = [];
    const watcher = await watchRefs(dir, {
      debounceMs: 300,
      onChange: (head) => {
        changes.push(head);
      },
    });
    try {
      await shellCommit(repo, dir, "a.txt");
      await shellCommit(repo, dir, "b.txt");
      await shellCommit(repo, dir, "c.txt");
      const head = (await repo.revparse(["HEAD"])).trim();
      await eventually(
        async () => changes,
        (list) => list.length > 0,
        5_000,
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(changes).toEqual([head]);
      await watcher.check();
      expect(changes).toHaveLength(1);
    } finally {
      watcher.close();
    }
  });
});

describe("withRepoLock", () => {
  it("refuses a second holder, and takes over a dead one's lock", async () => {
    const dir = await scratchDir("lock-");
    await initRepo(dir);
    let inner: unknown = null;
    await withRepoLock(dir, async () => {
      inner = await withRepoLock(dir, async () => "nested").catch(
        (error) => error,
      );
    });
    expect(inner).toBeInstanceOf(LockBusyError);

    /* A lock left by a pid that no longer exists. */
    await writeFile(join(dir, ".git", "discontent-sync.lock"), "999999999\n");
    expect(await withRepoLock(dir, async () => "taken over")).toBe(
      "taken over",
    );
  });
});

describe("pingWorkstation", () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    server = undefined;
  });

  it("posts /api/git/sync with the token and records the answer", async () => {
    const dir = await scratchDir("ping-");
    await initRepo(dir);
    const seen: { url?: string; auth?: string } = {};
    server = createServer((request, response) => {
      seen.url = request.url;
      seen.auth = request.headers.authorization;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ outcome: "synced" }));
    });
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    process.env.WORKSTATION_URL = `http://127.0.0.1:${port}/`;
    process.env.WORKSTATION_SYNC_TOKEN = "rcp_test_token";

    const state = await pingWorkstation(dir);
    expect(seen).toEqual({
      url: "/api/git/sync",
      auth: "Bearer rcp_test_token",
    });
    expect(state).toMatchObject({ ok: true, status: 200, outcome: "synced" });
    expect(await readPingState(dir)).toMatchObject({ ok: true });
  });

  it("records an unreachable workstation instead of throwing", async () => {
    const dir = await scratchDir("ping-");
    await initRepo(dir);
    process.env.WORKSTATION_URL = "http://127.0.0.1:9/";
    process.env.WORKSTATION_SYNC_TOKEN = "rcp_test_token";
    const state = await pingWorkstation(dir, { timeoutMs: 3_000 });
    expect(state.ok).toBe(false);
    expect(state.message).toContain("not reached");
  });
});

/* ------------------------------------------------------------------ */
/* End to end                                                          */
/* ------------------------------------------------------------------ */

describe("the instance", () => {
  it("reindexes on its own when HEAD moves outside the editor (D12)", async () => {
    const dir = await scratchDir("instance-");
    const repo = await initRepo(dir);
    process.env.CONTENT_DIRECTORY = dir;
    process.env.SETTINGS_DIRECTORY = await scratchDir("settings-");
    process.env.TEST_MODE = "true";
    process.env.INSTANCE_EVENTS = "on";
    process.env.EDITOR_ROLE = "mirror";
    process.env.EDITOR_INTERNAL_URL = "http://127.0.0.1:9";
    await reindex({ contentDirectory: dir });

    await startInstance();
    await shellCommit(repo, dir, "recipes/data/shell/recipe.json");
    const freshness = await eventually(
      () => readIndexFreshness(dir),
      (value) => !value.stale,
    );
    expect(freshness.stale).toBe(false);
  }, 45_000);

  it("syncs a workstation commit to its mirror with no one asking (D4)", async () => {
    const dir = await scratchDir("workstation-");
    const repo = await initRepo(dir);
    process.env.CONTENT_DIRECTORY = dir;
    const settings = await scratchDir("settings-");
    process.env.SETTINGS_DIRECTORY = settings;
    await writeFile(
      join(settings, "settings.json"),
      JSON.stringify({ mirrors: ["uraninite"] }),
    );
    process.env.TEST_MODE = "true";
    process.env.INSTANCE_EVENTS = "on";
    delete process.env.EDITOR_ROLE;
    process.env.EDITOR_INTERNAL_URL = "http://127.0.0.1:9";
    await reindex({ contentDirectory: dir });

    const mirrorDir = await scratchDir("mirror-");
    await simpleGit().clone(dir, mirrorDir);
    const mirror = simpleGit({ baseDir: mirrorDir });
    await mirror.addConfig("receive.denyCurrentBranch", "updateInstead");
    await repo.addRemote("uraninite", mirrorDir);
    await repo.fetch("uraninite");
    const branch = (await repo.status()).current as string;
    await repo.raw(["branch", "--set-upstream-to", `uraninite/${branch}`]);

    await startInstance();
    /* The startup sync: nothing to do yet. */
    await eventually(
      () => readSyncState(dir),
      (state) => state.uraninite?.outcome === "nothing",
    );

    await createRecipe({ contentDirectory: dir }, { name: "Naan" });
    const head = (await repo.revparse(["HEAD"])).trim();
    const mirrorHead = await eventually(
      async () => (await mirror.revparse(["HEAD"])).trim(),
      (value) => value === head,
    );
    expect(mirrorHead).toBe(head);
    /*
     * Converged is the claim. Which run did the pushing depends on timing: on
     * a loaded machine the startup run can land after the commit, and the
     * commit's own watcher event then finds `nothing` — so the last recorded
     * outcome is either, but never a failure.
     */
    const state = (await readSyncState(dir)).uraninite;
    expect(["synced", "nothing"]).toContain(state?.outcome);
    expect(state?.consecutiveFailures).toBe(0);
  }, 90_000);
});
