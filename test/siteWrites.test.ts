// @vitest-environment node
//
// Epic 34, 34d: the site's writes under the repository's write lock.
//
// 34c gave the engine a cross-process write lock (D6) and private-index
// commits (D7); its own writes take the lock. The site's git seats — pull,
// revert, restore — run `reset --hard` and raw merges and commits through the
// shared index, so they must hold the same lock from their clean-tree check
// through the rebuild, or a write in another process can land its files in
// between and be reset away. What is pinned here:
//
// - pull and restore wait for another process's write and keep its files;
// - `busy` (D10) maps through every transport: the error object, HTTP 503
//   with `Retry-After`, the HTTP backend's rehydration, the CLI's exit 75,
//   MCP's `isError`, and the sync's outcome;
// - two slug-less features in one second both land (D9, 23-T26 retired);
// - `git_status` names pending index refreshes and does not count them dirty.

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  mkdtemp,
  outputFile,
  pathExists,
  readdir,
  readFile,
  rm,
  writeFile,
} from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execa } from "execa";
import simpleGit, { type SimpleGit } from "simple-git";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import {
  flushPendingIndex,
  readPendingIndex,
} from "@discontent/cms/git/commit";
import {
  RepositoryBusyError,
  readWriteLock,
  withWriteLock,
} from "@discontent/cms/git/writeLock";
import { ulidTime } from "@discontent/cms/util/ulid";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  CurationError,
  exitCodeFor,
  toErrorObject,
} from "../websites/recipe-website/editor/controller/curation/errors";
import {
  errorResponse,
  statusFor,
} from "../websites/recipe-website/editor/controller/curation/http";
import {
  gitPull,
  gitPush,
  gitRestore,
  gitStatus,
} from "../websites/recipe-website/editor/controller/curation/git";
import { reindex } from "../websites/recipe-website/editor/controller/curation/reindex";
import { gitSync } from "../websites/recipe-website/editor/controller/curation/sync";
import {
  createRecipe,
  updateRecipe,
} from "../websites/recipe-website/editor/controller/curation/recipes";
import {
  feature,
  listFeatured,
} from "../websites/recipe-website/editor/controller/curation/featured";
import { patchInventory } from "../websites/recipe-website/editor/controller/curation/inventory";
import { createHttpBackend } from "../websites/recipe-website/editor/cli/backend/http";
import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { createRecipeServer } from "../websites/recipe-website/editor/mcp/registry";
import createDefaultGroupSlug from "../websites/recipe-website/common/controller/createGroupSlug";
import { withRepoLock } from "../websites/recipe-website/editor/controller/instance/lock";
import { lockedRebuild } from "../websites/recipe-website/editor/controller/lockedRebuild";

const EDITOR_DIR = resolve(__dirname, "../websites/recipe-website/editor");
const WRITER = resolve(__dirname, "support/lockedWriter.ts");
const TIMEOUT = 60_000;

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;
let previousContentDirectory: string | undefined;
const scratchDirs: string[] = [];
const ENV_KEYS = [
  "DISCONTENT_WRITE_LOCK_TIMEOUT_MS",
  "DISCONTENT_INDEX_REFRESH_MS",
  "DISCONTENT_INDEX_FLUSH_RETRY_MS",
] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => Promise<boolean>, ms = 20_000) {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await sleep(25);
  }
}

async function scratchDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  scratchDirs.push(directory);
  return directory;
}

async function initTestRepo(directory: string): Promise<SimpleGit> {
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

beforeEach(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  contentDirectory = await mkdtemp(join(tmpdir(), "site-writes-"));
  git = await initTestRepo(contentDirectory);
  ctx = {
    contentDirectory,
    author: { name: "Test Curator", email: "curator@test.local" },
  };
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await closeCachedEnvironments();
  if (previousContentDirectory === undefined) {
    delete process.env.CONTENT_DIRECTORY;
  } else {
    process.env.CONTENT_DIRECTORY = previousContentDirectory;
  }
  await rm(contentDirectory, { recursive: true, force: true });
  for (const directory of scratchDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

/**
 * Another process takes the write lock, says so, writes `relative` after
 * `delayMs`, holds it uncommitted for `holdMs`, then commits it. Resolves once
 * the lock is held; `done` resolves when the process exits.
 */
async function otherProcessWrites(
  relative: string,
  { delayMs = 300, holdMs = 700 } = {},
) {
  const scratch = await scratchDir("site-writes-ready-");
  const ready = join(scratch, "ready");
  const child = execa(
    "pnpm",
    [
      "exec",
      "tsx",
      WRITER,
      contentDirectory,
      relative,
      String(delayMs),
      String(holdMs),
      ready,
    ],
    { cwd: EDITOR_DIR, reject: false },
  );
  await until(() => pathExists(ready));
  return { done: child, heldAt: Date.now() };
}

async function inHead(relative: string): Promise<boolean> {
  const listed = await git.raw(["ls-tree", "--name-only", "HEAD", relative]);
  return listed.trim() === relative;
}

/* ------------------------------------------------------------------ */
/* 1. Pull and restore wait, and keep the other write's files          */
/* ------------------------------------------------------------------ */

describe("git seats wait for another process's write", () => {
  it(
    "restore waits, then commits on top, and the other write's file survives",
    async () => {
      await createRecipe(ctx, { name: "Naan" });
      const rev = (await git.revparse(["HEAD"])).trim();
      await updateRecipe(ctx, "naan", { name: "Naan Two" });
      await closeCachedEnvironments();

      const other = await otherProcessWrites("notes/other.txt");
      const result = await gitRestore(ctx, {
        type: "recipe",
        slug: "naan",
        rev,
      });
      const waited = Date.now() - other.heldAt;
      const run = await other.done;
      expect(run.exitCode, run.stderr).toBe(0);

      /* It waited for the whole hold, rather than failing dirty_tree. */
      expect(waited).toBeGreaterThanOrEqual(900);
      expect(result.commit).not.toBeNull();
      expect(
        JSON.parse(
          await readFile(
            join(contentDirectory, "recipes/data/naan/recipe.json"),
            "utf8",
          ),
        ).name,
      ).toBe("Naan");
      /* The other process's file is on disk and committed, before the restore. */
      expect(await pathExists(join(contentDirectory, "notes/other.txt"))).toBe(
        true,
      );
      expect(await inHead("notes/other.txt")).toBe(true);
      const subjects = (await git.raw(["log", "-2", "--format=%s"]))
        .trim()
        .split("\n");
      expect(subjects[0]).toMatch(/^Restore recipe naan to /);
      expect(subjects[1]).toBe("Add notes/other.txt");
      expect((await git.status()).isClean()).toBe(true);
    },
    TIMEOUT,
  );

  it(
    "pull waits, then merges, and the other write's file survives",
    async () => {
      const remote = await scratchDir("site-writes-remote-");
      await simpleGit().raw(["init", "--bare", remote]);
      await git.addRemote("uraninite", remote);
      await reindex(ctx);
      await gitPush(ctx, { remote: "uraninite", setUpstream: true });
      const clone = await scratchDir("site-writes-clone-");
      await simpleGit().clone(remote, clone);
      const pi = simpleGit({ baseDir: clone });
      await pi.addConfig("user.email", "pi@uraninite.test");
      await pi.addConfig("user.name", "Pi Editor");
      await pi.addConfig("commit.gpgsign", "false");
      await outputFile(
        join(clone, "recipes/data/gimlet/recipe.json"),
        `${JSON.stringify({ name: "Gimlet", date: 1_790_000_000_000 })}\n`,
      );
      await pi.add(".");
      await pi.commit("Add Gimlet");
      await pi.push();
      await closeCachedEnvironments();

      const other = await otherProcessWrites("notes/other.txt");
      const pulled = await gitPull(ctx);
      const waited = Date.now() - other.heldAt;
      const run = await other.done;
      expect(run.exitCode, run.stderr).toBe(0);

      expect(waited).toBeGreaterThanOrEqual(900);
      /* Our side moved (the other write), so it is a merge, not a fast-forward. */
      expect(pulled).toMatchObject({
        merged: true,
        fastForward: false,
        newCommits: 1,
      });
      expect(await pathExists(join(contentDirectory, "notes/other.txt"))).toBe(
        true,
      );
      expect(await inHead("notes/other.txt")).toBe(true);
      expect(await inHead("recipes/data/gimlet/recipe.json")).toBe(true);
      expect((await git.status()).isClean()).toBe(true);
    },
    TIMEOUT,
  );
});

/* ------------------------------------------------------------------ */
/* 2. busy (D10) through every transport                               */
/* ------------------------------------------------------------------ */

/** Hold the write lock from this process until `release()`. */
function holdLock(directory: string) {
  let release!: () => void;
  const released = new Promise<void>((done) => (release = done));
  let held!: () => void;
  const isHeld = new Promise<void>((done) => (held = done));
  const scope = withWriteLock(directory, "test holder", async () => {
    held();
    await released;
  });
  return {
    held: isHeld,
    release: async () => {
      release();
      await scope;
    },
  };
}

describe("busy", () => {
  it("is a RepositoryBusyError from a seat, and maps to busy / 503 / exit 75", async () => {
    process.env.DISCONTENT_WRITE_LOCK_TIMEOUT_MS = "200";
    const holder = holdLock(contentDirectory);
    await holder.held;
    try {
      const error = await createRecipe(ctx, { name: "Naan" }).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(RepositoryBusyError);
      const object = toErrorObject(error);
      expect(object.error.code).toBe("busy");
      expect(object.error.message).toMatch(/"test holder"/);
      expect(statusFor("busy")).toBe(503);
      expect(exitCodeFor(error)).toBe(75);
      const response = errorResponse(error);
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("5");
      expect((await response.json()).error.code).toBe("busy");

      /* The inventory's read-modify-write is one locked scope too. */
      await expect(
        patchInventory(ctx, { add: ["Gnista"] }),
      ).rejects.toBeInstanceOf(RepositoryBusyError);
    } finally {
      await holder.release();
    }
    /* Nothing was written. */
    expect(await pathExists(join(contentDirectory, "recipes/data/naan"))).toBe(
      false,
    );
    expect((await git.status()).isClean()).toBe(true);
  });

  it("rehydrates through the HTTP backend, from our body or a bare 503", async () => {
    const busy = new RepositoryBusyError(
      {
        writeId: "01J0000000000000000000000A",
        pid: 4242,
        host: "workstation",
        op: "batch: Rename term: drink → beverage",
        startedAt: Date.now() - 12_000,
      },
      30_000,
    );
    const editor: Server = createServer(async (request, response) => {
      if (request.url === "/api/taxonomies/tag") {
        const answer = errorResponse(busy);
        response.writeHead(answer.status, {
          "content-type": "application/json",
          "retry-after": answer.headers.get("retry-after") ?? "",
        });
        response.end(await answer.text());
      } else {
        response.writeHead(503, { "content-type": "text/plain" });
        response.end("Service Unavailable");
      }
    });
    await new Promise<void>((done) => editor.listen(0, "127.0.0.1", done));
    try {
      const backend = createHttpBackend({
        baseUrl: `http://127.0.0.1:${(editor.address() as AddressInfo).port}`,
        token: "rcp_test",
      });
      const fromBody = await backend.createTerm({ label: "Fall" }).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(fromBody).toBeInstanceOf(CurationError);
      expect(fromBody).toMatchObject({ code: "busy" });
      expect((fromBody as Error).message).toMatch(/Rename term: drink/);
      expect(exitCodeFor(fromBody)).toBe(75);

      await expect(
        backend.patchInventory({ add: ["Gnista"] }),
      ).rejects.toMatchObject({ code: "busy" });
    } finally {
      await new Promise<void>((done) => editor.close(() => done()));
    }
  });

  it("answers MCP with isError and code busy", async () => {
    process.env.DISCONTENT_WRITE_LOCK_TIMEOUT_MS = "200";
    const backend = createLocalBackend({ contentDirectory });
    const server = createRecipeServer(backend);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "site-writes", version: "0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const holder = holdLock(contentDirectory);
    await holder.held;
    try {
      const result = await client.callTool({
        name: "term_create",
        arguments: { term: { label: "Fall" } },
      });
      expect(result.isError, JSON.stringify(result)).toBe(true);
      const error = (result.structuredContent as { error: { code: string } })
        .error;
      expect(error).toMatchObject({ code: "busy" });
    } finally {
      await holder.release();
      await client.close();
      await server.close();
      await backend.close();
    }
  });

  it(
    "exits 75 from the CLI with code busy in --json",
    async () => {
      await closeCachedEnvironments();
      const holder = holdLock(contentDirectory);
      await holder.held;
      try {
        const result = await execa(
          "pnpm",
          [
            "exec",
            "tsx",
            "cli/index.ts",
            "term",
            "create",
            "--label",
            "Fall",
            "--json",
            "--content-dir",
            contentDirectory,
          ],
          {
            cwd: EDITOR_DIR,
            reject: false,
            env: {
              ...process.env,
              CONTENT_DIRECTORY: undefined,
              DISCONTENT_WRITE_LOCK_TIMEOUT_MS: "300",
            },
          },
        );
        expect(result.exitCode, result.stderr).toBe(75);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.error.code).toBe("busy");
        expect(parsed.error.message).toMatch(/"test holder"/);
      } finally {
        await holder.release();
      }
    },
    TIMEOUT,
  );

  it(
    "stops a sync's merge as a busy outcome, with nothing merged",
    async () => {
      const remote = await scratchDir("site-writes-mirror-");
      await simpleGit().raw(["init", "--bare", remote]);
      await git.addRemote("uraninite", remote);
      await reindex(ctx);
      await gitPush(ctx, { remote: "uraninite", setUpstream: true });
      const clone = await scratchDir("site-writes-mirror-clone-");
      await simpleGit().clone(remote, clone);
      const pi = simpleGit({ baseDir: clone });
      await pi.addConfig("user.email", "pi@uraninite.test");
      await pi.addConfig("user.name", "Pi Editor");
      await pi.addConfig("commit.gpgsign", "false");
      await outputFile(join(clone, "notes/pi.txt"), "pi\n");
      await pi.add(".");
      await pi.commit("Pi note");
      await pi.push();
      const before = (await git.revparse(["HEAD"])).trim();

      const holder = holdLock(contentDirectory);
      await holder.held;
      let result;
      try {
        result = await gitSync(ctx, { lockTimeoutMs: 200 });
      } finally {
        await holder.release();
      }
      expect(result.outcome).toBe("busy");
      expect(result.message).toMatch(/Nothing was merged: .*busy/);
      /* Not a failure: no tally, so no desktop notification. */
      expect(result.state.consecutiveFailures).toBe(0);
      expect(result.steps.find((step) => step.step === "merge")).toMatchObject({
        status: "failed",
      });
      expect(result.pulled).toBe(0);
      expect((await git.revparse(["HEAD"])).trim()).toBe(before);

      /* Released: the next sync merges. */
      const next = await gitSync(ctx);
      expect(next.outcome).toBe("synced");
      expect(next.pulled).toBe(1);
    },
    TIMEOUT,
  );

  it(
    "answers the local backend's git sync busy while another sync holds the repo lock",
    async () => {
      await closeCachedEnvironments();
      const remote = await scratchDir("site-writes-repo-lock-");
      await simpleGit().raw(["init", "--bare", remote]);
      await git.addRemote("uraninite", remote);
      await gitPush(ctx, { remote: "uraninite", setUpstream: true });
      const backend = createLocalBackend({ contentDirectory });
      let release!: () => void;
      const released = new Promise<void>((done) => (release = done));
      let held!: () => void;
      const isHeld = new Promise<void>((done) => (held = done));
      const other = withRepoLock(contentDirectory, async () => {
        held();
        await released;
      });
      await isHeld;
      try {
        const error = await backend.gitSync({}).then(
          () => null,
          (caught: unknown) => caught,
        );
        expect(error).toMatchObject({ code: "busy" });
        expect(exitCodeFor(error)).toBe(75);
      } finally {
        release();
        await other;
      }
      /* Free again: it syncs. */
      expect((await backend.gitSync({})).outcome).toBe("nothing");
      await backend.close();
    },
    TIMEOUT,
  );
});

describe("pull keeps what phase 1 derived", () => {
  it(
    "refuses to merge when the branch changed while it waited",
    async () => {
      const remote = await scratchDir("site-writes-branch-");
      await simpleGit().raw(["init", "--bare", remote]);
      await git.addRemote("uraninite", remote);
      await reindex(ctx);
      await gitPush(ctx, { remote: "uraninite", setUpstream: true });
      const clone = await scratchDir("site-writes-branch-clone-");
      await simpleGit().clone(remote, clone);
      const pi = simpleGit({ baseDir: clone });
      await pi.addConfig("user.email", "pi@uraninite.test");
      await pi.addConfig("user.name", "Pi Editor");
      await pi.addConfig("commit.gpgsign", "false");
      await outputFile(join(clone, "notes/pi.txt"), "pi\n");
      await pi.add(".");
      await pi.commit("Pi note");
      await pi.push();
      await git.fetch("uraninite");
      const before = (await git.revparse(["HEAD"])).trim();

      const holder = holdLock(contentDirectory);
      await holder.held;
      /* `fetched`: phase 1 reads the branch unlocked, then waits for the lock. */
      const pulling = gitPull(ctx, { fetched: true }).then(
        () => null,
        (caught: unknown) => caught,
      );
      await sleep(300);
      await git.checkoutLocalBranch("elsewhere");
      await holder.release();
      const error = await pulling;
      expect(error).toMatchObject({ code: "git_conflict" });
      expect((error as Error).message).toMatch(/branch changed/);
      expect((await git.revparse(["HEAD"])).trim()).toBe(before);
      expect(await pathExists(join(contentDirectory, "notes/pi.txt"))).toBe(
        false,
      );
    },
    TIMEOUT,
  );
});

describe("more seats lock", () => {
  it("refuses an inventory write mid-merge before writing anything", async () => {
    const head = (await git.revparse(["HEAD"])).trim();
    await writeFile(join(contentDirectory, ".git", "MERGE_HEAD"), `${head}\n`);
    const error = await patchInventory(ctx, { add: ["Gnista"] }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(toErrorObject(error).error.code).toBe("dirty_tree");
    expect(
      await pathExists(join(contentDirectory, "inventory/on-hand.json")),
    ).toBe(false);
    expect((await git.raw(["status", "--porcelain"])).trim()).toBe("");
  });

  it("runs a per-type rebuild under the write lock, and answers false when busy", async () => {
    let holder: unknown;
    expect(
      await lockedRebuild(contentDirectory, "rebuild test", async () => {
        holder = await readWriteLock(contentDirectory);
      }),
    ).toBe(true);
    expect(holder).toMatchObject({ op: "rebuild test", pid: process.pid });

    process.env.DISCONTENT_WRITE_LOCK_TIMEOUT_MS = "200";
    const held = holdLock(contentDirectory);
    await held.held;
    let ran = false;
    try {
      expect(
        await lockedRebuild(contentDirectory, "rebuild test", async () => {
          ran = true;
        }),
      ).toBe(false);
    } finally {
      await held.release();
    }
    expect(ran).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 3. ULID slugs (D9)                                                  */
/* ------------------------------------------------------------------ */

describe("default slugs are ULIDs (D9, 23-T26 retired)", () => {
  it("lands two slug-less features in the same second", async () => {
    await createRecipe(ctx, { name: "Naan" });
    await createRecipe(ctx, { name: "Scone" });
    const date = Date.UTC(2026, 9, 13, 12, 0, 0);
    const [a, b] = [
      await feature(ctx, { recipe: "naan", date }),
      await feature(ctx, { recipe: "scone", date }),
    ];
    for (const entry of [a, b]) {
      expect(entry.slug).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
      /* The slug's time is the feature's date, so ties still sort by time. */
      expect(ulidTime(entry.slug)).toBe(date);
    }
    expect(a.slug).not.toBe(b.slug);
    const listed = await listFeatured(ctx);
    expect(listed.featured.map((row) => row.slug).sort()).toEqual(
      [a.slug, b.slug].sort(),
    );
    /* One commit each, and a clean tree. */
    const subjects = (await git.raw(["log", "-2", "--format=%s"])).trim();
    expect(subjects.split("\n")).toHaveLength(2);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("falls back to group-<ulid> when a group's name slugifies to nothing", () => {
    const date = Date.UTC(2026, 9, 13);
    const one = createDefaultGroupSlug({ name: "!!!", date });
    const two = createDefaultGroupSlug({ name: "!!!", date });
    expect(one).toMatch(/^group-[0-9a-hjkmnp-tv-z]{26}$/);
    expect(one).not.toBe(two);
    expect(ulidTime(one.slice("group-".length))).toBe(date);
    expect(createDefaultGroupSlug({ name: "Week One", date })).toBe("week-one");
  });
});

/* ------------------------------------------------------------------ */
/* 4. Pending index refreshes in git_status                            */
/* ------------------------------------------------------------------ */

describe("git_status and pending index refreshes", () => {
  it("names them, does not count them dirty, and a restore flushes them", async () => {
    process.env.DISCONTENT_INDEX_REFRESH_MS = "100";
    process.env.DISCONTENT_INDEX_FLUSH_RETRY_MS = "600000";
    await createRecipe(ctx, { name: "Naan" });
    const rev = (await git.revparse(["HEAD"])).trim();
    const lock = join(contentDirectory, ".git", "index.lock");
    await writeFile(lock, "");
    await updateRecipe(ctx, "naan", { name: "Naan Two" });
    const path = "recipes/data/naan/recipe.json";
    expect(await readPendingIndex(contentDirectory)).toEqual([path]);

    const status = await gitStatus(ctx);
    expect(status.pendingIndex).toEqual([path]);
    expect(status.dirty).toBe(false);
    expect(status.dirtyCount).toBe(0);

    /* Edited since: real uncommitted work, counted again. */
    await writeFile(
      join(contentDirectory, path),
      `${JSON.stringify({ name: "By hand", date: 1 })}\n`,
    );
    const edited = await gitStatus(ctx);
    expect(edited.pendingIndex).toEqual([path]);
    expect(edited.dirty).toBe(true);
    await git
      .raw(["show", `HEAD:${path}`])
      .then((text) => writeFile(join(contentDirectory, path), text));

    /* While index.lock is held, a restore refuses rather than misreading. */
    await expect(
      gitRestore(ctx, { type: "recipe", slug: "naan", rev }),
    ).rejects.toMatchObject({ code: "dirty_tree" });

    await rm(lock);
    /* Released: the restore's clean-tree check flushes, then restores. */
    const restored = await gitRestore(ctx, {
      type: "recipe",
      slug: "naan",
      rev,
    });
    expect(restored.commit).not.toBeNull();
    expect(await readPendingIndex(contentDirectory)).toEqual([]);
    expect((await gitStatus(ctx)).pendingIndex).toEqual([]);
    expect((await git.status()).isClean()).toBe(true);
    expect(await flushPendingIndex(contentDirectory)).toBe(true);
  });

  it("does not count a pending create, but counts an untracked file beside it", async () => {
    process.env.DISCONTENT_INDEX_REFRESH_MS = "100";
    process.env.DISCONTENT_INDEX_FLUSH_RETRY_MS = "600000";
    const lock = join(contentDirectory, ".git", "index.lock");
    await writeFile(lock, "");
    try {
      await createRecipe(ctx, { name: "Naan" });
      const path = "recipes/data/naan/recipe.json";
      expect(await readPendingIndex(contentDirectory)).toEqual([path]);
      /* The shared index says: a staged delete and an untracked directory. */
      expect(await git.raw(["status", "--porcelain"])).toMatch(
        /^D {2}recipes/m,
      );

      const status = await gitStatus(ctx);
      expect(status.pendingIndex).toEqual([path]);
      expect(status.dirty).toBe(false);
      expect(status.dirtyCount).toBe(0);

      await writeFile(
        join(contentDirectory, "recipes/data/naan/notes.txt"),
        "mine\n",
      );
      const beside = await gitStatus(ctx);
      expect(beside.dirty).toBe(true);
      expect(beside.dirtyCount).toBe(1);
      await rm(join(contentDirectory, "recipes/data/naan/notes.txt"));

      /* The as-if-flushed index is a private copy, removed afterwards. */
      const leftovers = (await readdir(join(contentDirectory, ".git"))).filter(
        (name) => /^discontent-index-[0-9A-Z]{26}/.test(name),
      );
      expect(leftovers).toEqual([]);
    } finally {
      await rm(lock, { force: true });
    }
    expect(await flushPendingIndex(contentDirectory)).toBe(true);
    expect((await git.status()).isClean()).toBe(true);
  });
});
