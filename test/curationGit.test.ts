// @vitest-environment node
//
// The git seats, against a real repository (23d/D19).
//
// This is the first vitest suite in the tree that creates one. Every other
// content test deliberately works in a tmpdir that is *not* a repo, so
// `commitContentChanges` no-ops and nothing has to care about a committer
// identity — which is exactly why none of them could cover this module.
//
// The helper's ordering is the part worth reading twice (T49): `git init`, a
// **local** `user.email`/`user.name`, `commit.gpgsign=false`, and the
// `.gitignore` generated from the content registry all have to land before the
// first LMDB open, or the initial commit swallows the index files and every
// later `isClean()` check reads as dirty.
//
// What is pinned here is the layer's own behaviour: which pathspecs a `type`
// resolves to, that a wire string cannot reach git's argv as an option, that a
// revert rolls itself back on a conflict, and that a rewind rebuilds the
// indexes and reports it. The routes on top are Playwright's (T17).

import {
  mkdtemp,
  outputFile,
  pathExists,
  readdir,
  readFile,
  readJson,
  remove,
  rm,
  writeFile,
} from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import simpleGit, { type SimpleGit } from "simple-git";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import {
  gitDiff,
  gitFetch,
  gitFileAt,
  gitLog,
  gitPull,
  gitPush,
  gitRestore,
  gitRevert,
  gitShow,
  gitStatus,
  indexFreshness,
  labelForPath,
} from "../websites/recipe-website/editor/controller/curation/git";
import { reindex } from "../websites/recipe-website/editor/controller/curation/reindex";
import { gitSync } from "../websites/recipe-website/editor/controller/curation/sync";
import { readSyncState } from "@discontent/cms/git/syncState";
import { searchRecipes } from "../websites/recipe-website/editor/controller/curation/search";
import {
  createGroup,
  listGroups,
} from "../websites/recipe-website/editor/controller/curation/groups";
import {
  createRecipe,
  deleteRecipe,
  updateRecipe,
} from "../websites/recipe-website/editor/controller/curation/recipes";
import {
  CommitConflictError,
  CommitFailedError,
  commitTestHooks,
  flushPendingIndex,
  MergeInProgressError,
} from "@discontent/cms/git/commit";
import {
  assignTerm,
  createTerm,
  deleteTerm,
  mergeTerm,
  renameTerm,
} from "../websites/recipe-website/editor/controller/curation/terms";
import { feature } from "../websites/recipe-website/editor/controller/curation/featured";
import { createContent } from "@discontent/cms/content/createContent";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import { updateContent } from "@discontent/cms/content/updateContent";
import { groupContentConfig } from "../websites/recipe-website/common/controller/groupContentConfig";
import type {
  Group,
  GroupEntryKey,
  GroupEntryValue,
} from "../websites/recipe-website/common/controller/types";
import type { Recipe } from "../websites/recipe-website/common/controller/types";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;
let bulkChanges: number;
let previousContentDirectory: string | undefined;
const scratchDirs: string[] = [];

/**
 * A content directory that is a git repository, with an identity of its own.
 *
 * Returns the `SimpleGit` bound to it, since almost every case needs to reach
 * past the curation layer to arrange history the layer itself cannot make.
 */
async function initTestRepo(directory: string): Promise<SimpleGit> {
  const repo = simpleGit({ baseDir: directory });
  await repo.init();
  /* Local scope, so a developer's global config cannot change the outcome. */
  await repo.addConfig("user.email", "curator@test.local");
  await repo.addConfig("user.name", "Test Curator");
  await repo.addConfig("commit.gpgsign", "false");
  /* Before the first LMDB open, or the indexes land in the initial commit. */
  await writeFile(
    join(directory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await repo.add(".");
  await repo.commit("Initial commit");
  return repo;
}

async function scratchDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  scratchDirs.push(directory);
  return directory;
}

beforeEach(async () => {
  contentDirectory = await mkdtemp(join(tmpdir(), "curation-git-"));
  git = await initTestRepo(contentDirectory);
  bulkChanges = 0;
  ctx = {
    contentDirectory,
    author: { name: "Test Curator", email: "curator@test.local" },
    onBulkChange: () => {
      bulkChanges += 1;
    },
  };
  previousContentDirectory = process.env.CONTENT_DIRECTORY;
  process.env.CONTENT_DIRECTORY = contentDirectory;
});

afterEach(async () => {
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

function head(): Promise<string> {
  return git.revparse(["HEAD"]).then((value) => value.trim());
}

function readRecipeFile(slug: string): Promise<Recipe> {
  return readJson(join(contentDirectory, "recipes/data", slug, "recipe.json"));
}

/* ------------------------------------------------------------------ */
/* 1. Status                                                           */
/* ------------------------------------------------------------------ */

describe("gitStatus", () => {
  it("answers isRepo: false for a directory that is not a repository", async () => {
    const plain = await scratchDir("not-a-repo-");
    const status = await gitStatus({ contentDirectory: plain });
    expect(status.isRepo).toBe(false);
    expect(status.log).toEqual([]);
    expect(status.dirty).toBe(false);
  });

  it("reports a clean repository with its initial commit", async () => {
    const status = await gitStatus(ctx);
    expect(status.isRepo).toBe(true);
    expect(status.dirty).toBe(false);
    expect(status.dirtyCount).toBe(0);
    expect(status.merge.inProgress).toBe(false);
    expect(status.log[0]).toMatchObject({ message: "Initial commit" });
    /* The branch name is whatever this git's `init.defaultBranch` says. */
    expect(typeof status.branch).toBe("string");
  });

  it("counts a write's commit and stays clean afterwards", async () => {
    await createRecipe(ctx, { name: "Naan" });
    const status = await gitStatus(ctx);
    expect(status.dirty).toBe(false);
    expect(status.log.map((entry) => entry.message)).toEqual([
      "Create recipe: naan",
      "Initial commit",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* 2. Log                                                             */
/* ------------------------------------------------------------------ */

describe("gitLog", () => {
  it("lists every commit, newest first, with the files each touched", async () => {
    await createRecipe(ctx, { name: "Naan" });
    await createGroup(ctx, { name: "Week One" });

    const { commits, hasMore } = await gitLog(ctx);
    expect(hasMore).toBe(false);
    expect(commits.map((commit) => commit.message)).toEqual([
      "Create group: week-one",
      "Create recipe: naan",
      "Initial commit",
    ]);
    expect(commits[0].files).toEqual(["groups/data/week-one/group.json"]);
  });

  it("narrows to one type and one slug through the content config's paths", async () => {
    await createRecipe(ctx, { name: "Naan" });
    await createRecipe(ctx, { name: "Scone" });
    await createGroup(ctx, { name: "Week One" });

    const recipes = await gitLog(ctx, { type: "recipe" });
    expect(recipes.commits.map((commit) => commit.message)).toEqual([
      "Create recipe: scone",
      "Create recipe: naan",
    ]);

    const one = await gitLog(ctx, { type: "recipe", slug: "naan" });
    expect(one.commits).toHaveLength(1);
    expect(one.commits[0]).toMatchObject({
      message: "Create recipe: naan",
      files: ["recipes/data/naan/recipe.json"],
    });

    const groups = await gitLog(ctx, { type: "group" });
    expect(groups.commits.map((commit) => commit.message)).toEqual([
      "Create group: week-one",
    ]);
  });

  it("pages with limit and offset", async () => {
    await createRecipe(ctx, { name: "Naan" });
    await createRecipe(ctx, { name: "Scone" });

    const first = await gitLog(ctx, { limit: 1 });
    expect(first.commits).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(first.commits[0].message).toBe("Create recipe: scone");

    const second = await gitLog(ctx, { limit: 1, offset: 1 });
    expect(second.commits[0].message).toBe("Create recipe: naan");
  });

  it("names the types it knows when given one it does not", async () => {
    await expect(gitLog(ctx, { type: "recipes" })).rejects.toMatchObject({
      code: "not_found",
      message: expect.stringContaining("recipe, group, featured"),
    });
  });

  it("refuses a directory that is not a repository", async () => {
    const plain = await scratchDir("not-a-repo-");
    await expect(gitLog({ contentDirectory: plain })).rejects.toMatchObject({
      code: "not_a_repo",
    });
  });
});

/* ------------------------------------------------------------------ */
/* 3. Show, file-at and diff                                          */
/* ------------------------------------------------------------------ */

describe("gitShow / gitFileAt / gitDiff", () => {
  it("shows a commit's diff and truncates a long one with a marker", async () => {
    await createRecipe(ctx, { name: "Naan" });
    const hash = await head();

    const full = await gitShow(ctx, hash);
    expect(full.truncated).toBe(false);
    expect(full.diff).toContain("recipes/data/naan/recipe.json");
    expect(full.diff).toContain("Naan");

    const short = await gitShow(ctx, hash, { maxChars: 40 });
    expect(short.truncated).toBe(true);
    expect(short.diff.endsWith("… diff truncated …")).toBe(true);
    expect(short.diff.length).toBe(40 + "\n\n… diff truncated …".length);
  });

  it("reads an item's data file as it was at a revision", async () => {
    await createRecipe(ctx, { name: "Naan" });
    const created = await head();
    await updateRecipe(ctx, "naan", { name: "Naan Two" });

    const before = await gitFileAt(ctx, {
      type: "recipe",
      slug: "naan",
      rev: created,
    });
    expect(before.path).toBe("recipes/data/naan/recipe.json");
    expect((before.content as Recipe).name).toBe("Naan");
    /* And the working tree has moved on. */
    expect((await readRecipeFile("naan")).name).toBe("Naan Two");
  });

  it("reports an item absent at that revision as not found", async () => {
    const initial = await head();
    await createRecipe(ctx, { name: "Naan" });
    await expect(
      gitFileAt(ctx, { type: "recipe", slug: "naan", rev: initial }),
    ).rejects.toMatchObject({ code: "not_found", details: { slug: "naan" } });
  });

  it("diffs two revisions, and narrows to one path", async () => {
    const initial = await head();
    await createRecipe(ctx, { name: "Naan" });
    await createGroup(ctx, { name: "Week One" });

    const all = await gitDiff(ctx, { from: initial });
    expect(all.to).toBe("HEAD");
    expect(all.diff).toContain("recipes/data/naan/recipe.json");
    expect(all.diff).toContain("groups/data/week-one/group.json");

    const narrowed = await gitDiff(ctx, {
      from: initial,
      to: "HEAD",
      path: "recipes",
    });
    expect(narrowed.path).toBe("recipes");
    expect(narrowed.diff).toContain("recipes/data/naan/recipe.json");
    expect(narrowed.diff).not.toContain("groups/data/week-one/group.json");
  });
});

/* ------------------------------------------------------------------ */
/* 4. Revert                                                          */
/* ------------------------------------------------------------------ */

describe("gitRevert", () => {
  it("undoes a group creation, rebuilds every index and reports the change once", async () => {
    await createRecipe(ctx, { name: "Naan" });
    const created = await createGroup(ctx, { name: "Week One" });
    const hash = await head();
    expect(await pathExists(created.path)).toBe(true);

    const result = await gitRevert(ctx, hash);

    expect(result.commit).not.toBeNull();
    expect(result.commit).not.toBe(hash);
    expect(result.message).toBe('Revert "Create group: week-one"');
    /* Every type the registry declares, which is what a rewind invalidates. */
    expect(result.rebuilt).toEqual(
      recipeContentTypes.map((config) => config.contentType),
    );
    /* Five since 24c, when the registry gained the `tag-terms` records. */
    expect(result.rebuilt).toHaveLength(5);
    expect(bulkChanges).toBe(1);

    expect(await pathExists(created.path)).toBe(false);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("refuses a hash that names nothing", async () => {
    await expect(gitRevert(ctx, "0123456789abcdef")).rejects.toMatchObject({
      code: "bad_revision",
    });
    expect(bulkChanges).toBe(0);
  });

  it("refuses a merge commit", async () => {
    const branch = (await git.status()).current as string;
    await git.raw(["checkout", "-b", "side"]);
    await outputFile(join(contentDirectory, "side.txt"), "side\n");
    await git.add(".");
    await git.commit("Side commit");
    await git.raw(["checkout", branch]);
    await outputFile(join(contentDirectory, "main.txt"), "main\n");
    await git.add(".");
    await git.commit("Main commit");
    await git.raw(["merge", "--no-ff", "--no-edit", "side"]);
    const merge = await head();

    await expect(gitRevert(ctx, merge)).rejects.toMatchObject({
      code: "bad_revision",
      message: expect.stringContaining("merge commit"),
    });
  });

  it("rolls itself back when the patch no longer applies", async () => {
    await createRecipe(ctx, { name: "Shared" });
    await updateRecipe(ctx, "shared", { name: "Second Name" });
    const second = await head();
    await updateRecipe(ctx, "shared", { name: "Third Name" });

    await expect(gitRevert(ctx, second)).rejects.toMatchObject({
      code: "git_conflict",
    });
    /* The whole point of the rollback: the tree is the one we started with. */
    expect((await git.status()).isClean()).toBe(true);
    expect((await readRecipeFile("shared")).name).toBe("Third Name");
    expect(bulkChanges).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Restore                                                         */
/* ------------------------------------------------------------------ */

describe("gitRestore", () => {
  /** A recipe with an upload, a later rename, and the upload since deleted. */
  async function seedRestorable(): Promise<{ rev: string; upload: string }> {
    await createRecipe(ctx, { name: "Naan" });
    const upload = join(
      contentDirectory,
      "uploads/recipe/naan/uploads/photo.jpg",
    );
    await outputFile(upload, "not really a jpeg\n");
    await git.add(".");
    await git.commit("Add an upload");
    const rev = await head();

    await updateRecipe(ctx, "naan", { name: "Naan Two" });
    await remove(upload);
    await git.add(".");
    await git.commit("Remove the upload");

    return { rev, upload };
  }

  it("brings back the data file and the uploads, in one new commit", async () => {
    const { rev, upload } = await seedRestorable();
    const short = (await git.revparse(["--short", rev])).trim();
    expect(await pathExists(upload)).toBe(false);

    const result = await gitRestore(ctx, {
      type: "recipe",
      slug: "naan",
      rev,
    });

    expect(result.commit).not.toBeNull();
    expect(result.message).toBe(`Restore recipe naan to ${short}`);
    /* Five since 24c, when the registry gained the `tag-terms` records. */
    expect(result.rebuilt).toHaveLength(5);
    expect(bulkChanges).toBe(1);

    expect((await readRecipeFile("naan")).name).toBe("Naan");
    expect(await pathExists(upload)).toBe(true);
    expect((await git.status()).isClean()).toBe(true);

    /* The full revision rides the commit body, so the history is traceable. */
    const body = (await git.raw(["log", "-1", "--pretty=%b"])).trim();
    expect(body).toBe(`From ${rev}.`);
  });

  it("makes no commit when the item already matches that revision", async () => {
    await createRecipe(ctx, { name: "Naan" });
    const rev = await head();

    const result = await gitRestore(ctx, {
      type: "recipe",
      slug: "naan",
      rev,
    });
    expect(result).toEqual({
      commit: null,
      message: `recipe naan already matches ${(
        await git.revparse(["--short", rev])
      ).trim()}`,
      rebuilt: [],
    });
    expect(bulkChanges).toBe(0);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("reports an item that did not exist at that revision", async () => {
    const initial = await head();
    await createRecipe(ctx, { name: "Naan" });

    await expect(
      gitRestore(ctx, { type: "recipe", slug: "naan", rev: initial }),
    ).rejects.toMatchObject({
      code: "not_found",
      message: "recipe naan does not exist at " + initial,
    });
    /* And it did not delete the item on the way to finding that out. */
    expect((await readRecipeFile("naan")).name).toBe("Naan");
  });
});

/* ------------------------------------------------------------------ */
/* 6. Preflights                                                      */
/* ------------------------------------------------------------------ */

describe("preflights", () => {
  it("refuses a revert or a restore on a dirty tree, but not a push", async () => {
    await createRecipe(ctx, { name: "Naan" });
    const rev = await head();
    await outputFile(
      join(contentDirectory, "recipes/data/naan/notes.md"),
      "wip\n",
    );

    await expect(gitRevert(ctx, rev)).rejects.toMatchObject({
      code: "dirty_tree",
    });
    await expect(
      gitRestore(ctx, { type: "recipe", slug: "naan", rev }),
    ).rejects.toMatchObject({ code: "dirty_tree" });

    /*
     * Push is not clean-tree-guarded (T47): the `/git` page pushes a dirty tree
     * today. With no remote configured it fails on git's own terms, which is
     * proof it got past the preflight rather than proof it worked.
     */
    await expect(gitPush(ctx)).rejects.not.toMatchObject({
      code: "dirty_tree",
    });
  });

  it("refuses every write when the directory is not a repository", async () => {
    const plain = await scratchDir("not-a-repo-");
    const plainCtx = { contentDirectory: plain };
    await expect(gitRevert(plainCtx, "abcdef1")).rejects.toMatchObject({
      code: "not_a_repo",
    });
    await expect(
      gitRestore(plainCtx, { type: "recipe", slug: "naan", rev: "HEAD" }),
    ).rejects.toMatchObject({ code: "not_a_repo" });
    await expect(gitPush(plainCtx)).rejects.toMatchObject({
      code: "not_a_repo",
    });
  });

  it("refuses a revert while a merge is in progress", async () => {
    await createRecipe(ctx, { name: "Naan" });
    const rev = await head();
    await outputFile(join(contentDirectory, ".git", "MERGE_HEAD"), `${rev}\n`);
    await expect(gitRevert(ctx, rev)).rejects.toMatchObject({
      code: "dirty_tree",
      message: expect.stringContaining("MERGE_HEAD"),
    });
  });
});

/* ------------------------------------------------------------------ */
/* 7. Push                                                            */
/* ------------------------------------------------------------------ */

describe("gitPush", () => {
  async function bareRemote(): Promise<string> {
    const remote = await scratchDir("git-remote-");
    await simpleGit().raw(["init", "--bare", remote]);
    await git.addRemote("origin", remote);
    return remote;
  }

  it("sets the upstream on the first push and answers with remote and branch", async () => {
    await bareRemote();
    await createRecipe(ctx, { name: "Naan" });
    const branch = (await git.status()).current as string;

    expect(await gitPush(ctx, { setUpstream: true })).toEqual({
      remote: "origin",
      branch,
    });
    /* And a second, plain push now has a tracking branch to use. */
    await createRecipe(ctx, { name: "Scone" });
    expect(await gitPush(ctx)).toEqual({ remote: "origin", branch });
  });

  it("answers a repository with no remote as validation, before running git (epic 31)", async () => {
    await createRecipe(ctx, { name: "Naan" });
    const refused = await gitPush(ctx).catch((error) => error);
    expect(refused).toMatchObject({
      code: "validation",
      message: expect.stringContaining("no remote"),
    });
  });

  it("names the remotes there are when the asked-for one is not among them", async () => {
    await bareRemote();
    await createRecipe(ctx, { name: "Naan" });
    await expect(
      gitPush(ctx, { remote: "uraninite", setUpstream: true }),
    ).rejects.toMatchObject({
      code: "validation",
      message: expect.stringContaining("remotes: origin"),
    });
  });

  it("pushes to the only remote when it is not called origin", async () => {
    const remote = await scratchDir("git-remote-");
    await simpleGit().raw(["init", "--bare", remote]);
    await git.addRemote("uraninite", remote);
    await createRecipe(ctx, { name: "Naan" });
    const branch = (await git.status()).current as string;
    expect(await gitPush(ctx)).toEqual({ remote: "uraninite", branch });
  });

  it("maps a tracked remote that has gone away to validation", async () => {
    const remote = await bareRemote();
    await createRecipe(ctx, { name: "Naan" });
    await gitPush(ctx, { setUpstream: true });
    await rm(remote, { recursive: true, force: true });
    await expect(gitPush(ctx)).rejects.toMatchObject({ code: "validation" });
  });

  it("reports a non-fast-forward rejection as a conflict", async () => {
    const remote = await bareRemote();
    await createRecipe(ctx, { name: "Naan" });
    await gitPush(ctx, { setUpstream: true });

    /* Another instance of the app, pushing first. */
    const clone = await scratchDir("git-clone-");
    await simpleGit().clone(remote, clone);
    const other = simpleGit({ baseDir: clone });
    await other.addConfig("user.email", "other@instance.test");
    await other.addConfig("user.name", "Other Instance");
    await other.addConfig("commit.gpgsign", "false");
    await outputFile(join(clone, "elsewhere.txt"), "theirs\n");
    await other.add(".");
    await other.commit("From the clone");
    await other.push();

    await createRecipe(ctx, { name: "Scone" });
    await expect(gitPush(ctx)).rejects.toMatchObject({
      code: "git_conflict",
      message: expect.stringContaining("Push rejected"),
    });
  });
});

/* ------------------------------------------------------------------ */
/* 7b. Fetch, pull and the index stamp (27b)                          */
/* ------------------------------------------------------------------ */

/**
 * Another instance of the app — the Pi — sharing a bare remote with this one.
 *
 * `ctx`'s repository pushes first, so both start from the same commit with
 * upstreams set. The returned helpers commit straight into the other clone,
 * the way a second editor's writes would arrive.
 */
async function piPair() {
  const remote = await scratchDir("pi-remote-");
  await simpleGit().raw(["init", "--bare", remote]);
  await git.addRemote("uraninite", remote);
  await reindex(ctx);
  await gitPush(ctx, { remote: "uraninite", setUpstream: true });

  const clone = await scratchDir("pi-clone-");
  await simpleGit().clone(remote, clone);
  const pi = simpleGit({ baseDir: clone });
  await pi.addConfig("user.email", "pi@uraninite.test");
  await pi.addConfig("user.name", "Pi Editor");
  await pi.addConfig("commit.gpgsign", "false");

  async function piWrite(relative: string, data: unknown, message: string) {
    await outputFile(join(clone, relative), `${JSON.stringify(data)}\n`);
    await pi.add(".");
    await pi.commit(message);
    await pi.push();
  }
  return { clone, pi, piWrite };
}

describe("gitFetch / gitPull", () => {
  it("fast-forwards the Pi's recipe and group in, and every index sees them", async () => {
    const { piWrite } = await piPair();
    await piWrite(
      "recipes/data/gimlet/recipe.json",
      { name: "Gimlet", date: 1_790_000_000_000, tags: ["drink"] },
      "Add Gimlet",
    );
    await piWrite(
      "groups/data/gin-drinks/group.json",
      {
        name: "Gin drinks",
        date: 1_790_000_000_001,
        kind: "collection",
        items: [{ recipe: "gimlet" }],
      },
      "Add Gin drinks",
    );

    /* Stale until fetched: the remote refs here have not moved yet. */
    expect((await gitStatus(ctx)).behind).toBe(0);
    const fetched = await gitFetch(ctx);
    expect(fetched).toMatchObject({
      remote: "uraninite",
      upstream: expect.stringMatching(/^uraninite\//),
      ahead: 0,
      behind: 2,
      diverged: false,
    });
    expect(fetched.fetchedAt).toEqual(expect.any(String));

    const pulled = await gitPull(ctx);
    expect(pulled).toMatchObject({
      merged: true,
      fastForward: true,
      newCommits: 2,
    });
    expect(pulled.rebuilt).toEqual(
      expect.arrayContaining(["recipes", "groups"]),
    );
    expect(bulkChanges).toBe(1);

    expect((await searchRecipes(ctx, "tag:drink")).recipes).toEqual([
      expect.objectContaining({ slug: "gimlet" }),
    ]);
    /* The groups index too — the one the old narrow rebuild never touched. */
    expect((await listGroups(ctx)).groups).toEqual([
      expect.objectContaining({ slug: "gin-drinks", itemCount: 1 }),
    ]);
    expect((await gitStatus(ctx)).indexStale).toBe(false);
  });

  it("merges when both sides moved, and says so before and after", async () => {
    const { piWrite } = await piPair();
    await createRecipe(ctx, { name: "Daiquiri" });
    await piWrite(
      "recipes/data/gimlet/recipe.json",
      { name: "Gimlet", date: 1_790_000_000_000 },
      "Add Gimlet",
    );

    const status = await gitStatus(ctx, { fetch: true });
    expect(status).toMatchObject({ ahead: 1, behind: 1, diverged: true });

    const pulled = await gitPull(ctx);
    expect(pulled).toMatchObject({
      merged: true,
      fastForward: false,
      newCommits: 1,
    });
    expect((await gitStatus(ctx)).ahead).toBe(2);
    expect((await searchRecipes(ctx, "gimlet")).total).toBe(1);
    expect((await searchRecipes(ctx, "daiquiri")).total).toBe(1);
  });

  it("aborts a conflict, names the file, and leaves the tree as it was", async () => {
    await createRecipe(ctx, { name: "Naan", description: "Base." });
    const { clone, pi } = await piPair();
    const before = await head();

    /* The same line, changed two ways: a conflict git cannot resolve. */
    const target = join(clone, "recipes/data/naan/recipe.json");
    await writeFile(
      target,
      (await readFile(target, "utf8")).replace("Base.", "From the Pi."),
    );
    await pi.add(".");
    await pi.commit("Pi edit");
    await pi.push();
    /* Not the name: a rename moves the slug, and a moved file cannot conflict. */
    await updateRecipe(ctx, "naan", { description: "From here." });
    const local = await head();

    await expect(gitPull(ctx)).rejects.toMatchObject({
      code: "git_conflict",
      message: expect.stringContaining("recipes/data/naan/recipe.json"),
    });
    expect(await head()).toBe(local);
    expect(local).not.toBe(before);
    expect((await git.status()).isClean()).toBe(true);
    expect(await pathExists(join(contentDirectory, ".git", "MERGE_HEAD"))).toBe(
      false,
    );
    expect((await readRecipeFile("naan")).description).toBe("From here.");
  });

  it("answers merged: false when there is nothing to bring in", async () => {
    await piPair();
    expect(await gitPull(ctx)).toMatchObject({
      merged: false,
      newCommits: 0,
      rebuilt: [],
    });
    expect(bulkChanges).toBe(0);
  });

  it("refuses a dirty tree, but a fetch does not care", async () => {
    await piPair();
    await writeFile(join(contentDirectory, "scratch.txt"), "half done\n");
    await expect(gitPull(ctx)).rejects.toMatchObject({ code: "dirty_tree" });
    await expect(gitFetch(ctx)).resolves.toMatchObject({ behind: 0 });
  });

  it("needs an upstream or a remote to pull from", async () => {
    await expect(gitPull(ctx)).rejects.toMatchObject({ code: "validation" });
  });
});

describe("the index stamp", () => {
  it("is stale until a full rebuild records HEAD", async () => {
    expect(await indexFreshness(ctx)).toMatchObject({
      indexedHead: null,
      stale: true,
    });
    await reindex(ctx);
    expect(await indexFreshness(ctx)).toEqual({
      indexedHead: await head(),
      head: await head(),
      stale: false,
    });
  });

  it("is carried forward by the engine's own writes", async () => {
    await reindex(ctx);
    await createRecipe(ctx, { name: "Naan" });
    await updateRecipe(ctx, "naan", { name: "Garlic naan" });
    expect((await gitStatus(ctx)).indexStale).toBe(false);
  });

  it("goes stale when HEAD moves behind the engine's back, and a rebuild clears it", async () => {
    await reindex(ctx);
    await outputFile(
      join(contentDirectory, "recipes/data/by-hand/recipe.json"),
      `${JSON.stringify({ name: "By hand", date: 1 })}\n`,
    );
    await git.add(".");
    await git.commit("A commit from a shell");
    expect((await gitStatus(ctx)).indexStale).toBe(true);

    /* An engine write on top of a stale stamp does not pretend to repair it. */
    await createRecipe(ctx, { name: "Naan" });
    expect((await gitStatus(ctx)).indexStale).toBe(true);

    await reindex(ctx);
    expect((await gitStatus(ctx)).indexStale).toBe(false);
  });

  it("is a one-type rebuild's to leave alone", async () => {
    await reindex(ctx, "groups");
    expect((await indexFreshness(ctx)).stale).toBe(true);
  });

  it("catches a push received into this repository (the Pi's updateInstead)", async () => {
    await git.addConfig("receive.denyCurrentBranch", "updateInstead");
    await reindex(ctx);
    const branch = (await git.status()).current as string;

    const laptop = await scratchDir("laptop-");
    await simpleGit().clone(contentDirectory, laptop);
    const other = simpleGit({ baseDir: laptop });
    await other.addConfig("user.email", "laptop@test.local");
    await other.addConfig("user.name", "Laptop");
    await other.addConfig("commit.gpgsign", "false");
    await outputFile(
      join(laptop, "recipes/data/negroni/recipe.json"),
      `${JSON.stringify({ name: "Negroni", date: 1, tags: ["drink"] })}\n`,
    );
    await other.add(".");
    await other.commit("Add Negroni");
    await other.push("origin", branch);

    /* The working tree moved; the indexes did not. */
    expect(
      await pathExists(join(contentDirectory, "recipes/data/negroni")),
    ).toBe(true);
    expect((await gitStatus(ctx)).indexStale).toBe(true);
    expect((await searchRecipes(ctx, "tag:drink")).total).toBe(0);

    await reindex(ctx);
    expect((await gitStatus(ctx)).indexStale).toBe(false);
    expect((await searchRecipes(ctx, "tag:drink")).total).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* 8. Wire strings that reach git's argv (T45)                        */
/* ------------------------------------------------------------------ */

describe("input validation", () => {
  it("refuses a hash that is not a hash", async () => {
    for (const hash of ["zzz", "--help", "HEAD", "abc"]) {
      await expect(gitRevert(ctx, hash)).rejects.toMatchObject({
        code: "validation",
      });
      await expect(gitShow(ctx, hash)).rejects.toMatchObject({
        code: "validation",
      });
    }
  });

  it("refuses a rev or a path that git would read as an option", async () => {
    await expect(
      gitDiff(ctx, { from: "--output=/tmp/x" }),
    ).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      gitDiff(ctx, { from: "HEAD", path: "-z" }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      gitRestore(ctx, { type: "recipe", slug: "naan", rev: "-1" }),
    ).rejects.toMatchObject({ code: "validation" });
    /* `push -u <remote> <branch>`: a remote spelled `--force` would be an option. */
    await expect(
      gitPush(ctx, { remote: "--force", setUpstream: true }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("refuses a slug that is not one path segment", async () => {
    for (const slug of ["../escape", "a/b", ".", "..", "-naan"]) {
      await expect(
        gitFileAt(ctx, { type: "recipe", slug, rev: "HEAD" }),
      ).rejects.toMatchObject({ code: "validation" });
      await expect(
        gitRestore(ctx, { type: "recipe", slug, rev: "HEAD" }),
      ).rejects.toMatchObject({ code: "validation" });
    }
  });
});

/* ------------------------------------------------------------------ */
/* 9. The conflict resolver's labels                                  */
/* ------------------------------------------------------------------ */

describe("labelForPath", () => {
  it("names data files and uploads, and falls back to the path", () => {
    expect(labelForPath("recipes/data/naan/recipe.json")).toBe("Recipe: naan");
    expect(labelForPath("groups/data/week-one/group.json")).toBe(
      "Group: week-one",
    );
    /*
     * The branch 23d fixed: uploads live at `uploads/<type>/<slug>/uploads/…`,
     * never at `recipes/data/<slug>/…`, so the old pattern never fired and an
     * upload conflict fell through to the generic line below.
     */
    expect(labelForPath("uploads/recipe/naan/uploads/photo.jpg")).toBe(
      "Recipe: naan",
    );
    expect(labelForPath("uploads/group/week-one/uploads/cover.png")).toBe(
      "Group: week-one",
    );
    expect(labelForPath("uploads/featured-recipes/x/uploads/a.png")).toBe(
      "Upload: featured-recipes/x/uploads/a.png",
    );
    expect(labelForPath(".gitignore")).toBe(".gitignore");
  });
});

/* ------------------------------------------------------------------ */
/* 10. A mirror never pushes and never merges (epic 28, 28a)          */
/* ------------------------------------------------------------------ */

describe("on a mirror (EDITOR_ROLE=mirror)", () => {
  let previousRole: string | undefined;
  beforeEach(() => {
    previousRole = process.env.EDITOR_ROLE;
  });
  afterEach(() => {
    if (previousRole === undefined) delete process.env.EDITOR_ROLE;
    else process.env.EDITOR_ROLE = previousRole;
  });

  it("refuses to push", async () => {
    await piPair();
    process.env.EDITOR_ROLE = "mirror";
    await createRecipe(ctx, { name: "Scone" });
    await expect(gitPush(ctx)).rejects.toMatchObject({
      code: "forbidden",
      message: expect.stringContaining("This editor is a mirror"),
    });
  });

  it("fast-forwards what the workstation pushed", async () => {
    const { piWrite } = await piPair();
    await piWrite(
      "recipes/data/gimlet/recipe.json",
      { name: "Gimlet", date: 1_790_000_000_000 },
      "Add Gimlet",
    );
    process.env.EDITOR_ROLE = "mirror";
    expect(await gitPull(ctx)).toMatchObject({
      merged: true,
      fastForward: true,
    });
  });

  it("refuses a pull that would merge its own commits", async () => {
    const { piWrite } = await piPair();
    await piWrite(
      "recipes/data/gimlet/recipe.json",
      { name: "Gimlet", date: 1_790_000_000_000 },
      "Add Gimlet",
    );
    process.env.EDITOR_ROLE = "mirror";
    await createRecipe(ctx, { name: "Daiquiri" });
    const before = await head();
    await expect(gitPull(ctx)).rejects.toMatchObject({ code: "forbidden" });
    expect(await head()).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* 11. gitSync — the workstation syncs a mirror (epic 28, 28b)        */
/* ------------------------------------------------------------------ */

/**
 * A mirror the way the Pi is one: a non-bare clone of this repository with
 * `receive.denyCurrentBranch updateInstead`, added here as `uraninite` and
 * tracked as the upstream. Its own writes are plain commits in its tree.
 */
async function mirrorPair() {
  await reindex(ctx);
  const mirrorDir = await scratchDir("mirror-");
  await simpleGit().clone(contentDirectory, mirrorDir);
  const mirror = simpleGit({ baseDir: mirrorDir });
  await mirror.addConfig("user.email", "pi@uraninite.test");
  await mirror.addConfig("user.name", "Pi Editor");
  await mirror.addConfig("commit.gpgsign", "false");
  await mirror.addConfig("receive.denyCurrentBranch", "updateInstead");
  await git.addRemote("uraninite", mirrorDir);
  await git.fetch("uraninite");
  const branch = (await git.status()).current as string;
  await git.raw(["branch", "--set-upstream-to", `uraninite/${branch}`]);

  async function mirrorWrite(relative: string, data: unknown, message: string) {
    await outputFile(join(mirrorDir, relative), `${JSON.stringify(data)}\n`);
    await mirror.add(".");
    await mirror.commit(message);
  }
  const mirrorHead = () =>
    mirror.revparse(["HEAD"]).then((value) => value.trim());
  return { mirrorDir, mirror, mirrorWrite, mirrorHead, branch };
}

describe("gitSync", () => {
  it("answers nothing when both sides match, and records it", async () => {
    await mirrorPair();
    const result = await gitSync(ctx);
    expect(result).toMatchObject({
      remote: "uraninite",
      outcome: "nothing",
      pulled: 0,
      pushed: 0,
    });
    expect(result.steps.map((step) => [step.step, step.status])).toEqual([
      ["preflight", "ok"],
      ["fetch", "ok"],
      ["merge", "skipped"],
      ["media", "skipped"],
      ["push", "skipped"],
    ]);
    expect((await readSyncState(contentDirectory)).uraninite).toMatchObject({
      outcome: "nothing",
      consecutiveFailures: 0,
      lastSuccess: expect.any(String),
    });
  });

  it("brings the mirror's commit in and indexes it", async () => {
    const { mirrorWrite } = await mirrorPair();
    await mirrorWrite(
      "recipes/data/gimlet/recipe.json",
      { name: "Gimlet", date: 1_790_000_000_000, tags: ["drink"] },
      "Add Gimlet",
    );
    const result = await gitSync(ctx);
    expect(result).toMatchObject({ outcome: "synced", pulled: 1, pushed: 0 });
    expect((await searchRecipes(ctx, "tag:drink")).recipes).toEqual([
      expect.objectContaining({ slug: "gimlet" }),
    ]);
    expect(bulkChanges).toBe(1);
  });

  it("sends the workstation's commit to the mirror's working tree", async () => {
    const { mirrorHead, mirrorDir } = await mirrorPair();
    await createRecipe(ctx, { name: "Naan" });
    const result = await gitSync(ctx);
    expect(result).toMatchObject({ outcome: "synced", pulled: 0, pushed: 1 });
    expect(await mirrorHead()).toBe(await head());
    /* updateInstead: the file is in the mirror's tree, not only its refs. */
    expect(
      await pathExists(join(mirrorDir, "recipes/data/naan/recipe.json")),
    ).toBe(true);
  });

  it("merges both sides and pushes the merge back", async () => {
    const { mirrorWrite, mirrorHead } = await mirrorPair();
    await createRecipe(ctx, { name: "Daiquiri" });
    await mirrorWrite(
      "recipes/data/gimlet/recipe.json",
      { name: "Gimlet", date: 1_790_000_000_000 },
      "Add Gimlet",
    );
    const result = await gitSync(ctx);
    expect(result).toMatchObject({ outcome: "synced", pulled: 1 });
    /* Ours plus the merge commit. */
    expect(result.pushed).toBe(2);
    expect(await mirrorHead()).toBe(await head());
    expect((await searchRecipes(ctx, "gimlet")).total).toBe(1);
    expect((await searchRecipes(ctx, "daiquiri")).total).toBe(1);
  });

  it("aborts a conflict, changes nothing, and counts the failure", async () => {
    await createRecipe(ctx, { name: "Naan", description: "Base." });
    const { mirrorDir, mirror } = await mirrorPair();
    /* mirrorPair cloned after the Naan commit, so both sides have it. */
    const target = join(mirrorDir, "recipes/data/naan/recipe.json");
    await writeFile(
      target,
      (await readFile(target, "utf8")).replace("Base.", "From the Pi."),
    );
    await mirror.add(".");
    await mirror.commit("Pi edit");
    await updateRecipe(ctx, "naan", { description: "From here." });
    const before = await head();

    const first = await gitSync(ctx);
    expect(first.outcome).toBe("conflict");
    expect(first.message).toContain("recipes/data/naan/recipe.json");
    expect(await head()).toBe(before);
    expect((await git.status()).isClean()).toBe(true);
    expect(first.state.consecutiveFailures).toBe(1);

    const second = await gitSync(ctx);
    expect(second.state.consecutiveFailures).toBe(2);
  });

  it("reports a dirty mirror when its tree refuses the push", async () => {
    const { mirrorDir, mirrorHead } = await mirrorPair();
    await outputFile(join(mirrorDir, ".gitignore"), "edited on the Pi\n");
    const mirrorBefore = await mirrorHead();
    await createRecipe(ctx, { name: "Naan" });
    const result = await gitSync(ctx);
    expect(result.outcome).toBe("mirror_dirty");
    expect(await mirrorHead()).toBe(mirrorBefore);
  });

  it("reports an unreachable mirror", async () => {
    await mirrorPair();
    await git.remote([
      "set-url",
      "uraninite",
      join(tmpdir(), "no-such-mirror"),
    ]);
    const result = await gitSync(ctx);
    expect(result.outcome).toBe("unreachable");
    expect(result.steps.at(-1)).toMatchObject({
      step: "fetch",
      status: "failed",
    });
  });

  it("refuses an unknown remote, and refuses outright on a mirror", async () => {
    await mirrorPair();
    await expect(gitSync(ctx, { remote: "nowhere" })).rejects.toMatchObject({
      code: "validation",
    });
    const previous = process.env.EDITOR_ROLE;
    process.env.EDITOR_ROLE = "mirror";
    try {
      await expect(gitSync(ctx)).rejects.toMatchObject({ code: "forbidden" });
    } finally {
      if (previous === undefined) delete process.env.EDITOR_ROLE;
      else process.env.EDITOR_ROLE = previous;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Batched term writes (F34, epic 32's 32d)                           */
/* ------------------------------------------------------------------ */

describe("batched term writes (F34)", () => {
  const recipeFile = (slug: string) => `recipes/data/${slug}/recipe.json`;
  const groupFile = (slug: string) => `groups/data/${slug}/group.json`;
  const termFile = (slug: string) => `taxonomies/tag/data/${slug}/term.json`;
  const featuredFile = (slug: string) =>
    `featured-recipes/data/${slug}/featured-recipe.json`;

  /** Every commit after `since` (a hash), newest first. */
  async function commitsSince(since: string) {
    const { commits } = await gitLog(ctx);
    const index = commits.findIndex((commit) => commit.hash === since);
    return commits.slice(0, index);
  }

  async function clean(): Promise<boolean> {
    return (await git.status()).isClean();
  }

  it("assigns a term to N recipes in one commit, with onWrite per carrier", async () => {
    await createRecipe(ctx, { name: "Gingerbread" });
    await createRecipe(ctx, { name: "Snickerdoodles" });
    await createRecipe(ctx, { name: "Shortbread" });
    await createRecipe(ctx, { name: "Sugar Cookies", tags: ["cookies"] });
    const before = await head();
    const events: string[] = [];
    const watched: CurationContext = {
      ...ctx,
      onWrite: (event) => events.push(`${event.contentType}:${event.slug}`),
    };

    const result = await assignTerm(watched, "cookies", {
      add: ["gingerbread", "snickerdoodles", "shortbread", "sugar-cookies"],
    });

    expect(result.updated).toEqual([
      "gingerbread",
      "snickerdoodles",
      "shortbread",
    ]);
    expect(result.unchanged).toEqual(["sugar-cookies"]);
    const commits = await commitsSince(before);
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe("Assign term: cookies (+3 recipes)");
    expect([...commits[0].files].sort()).toEqual(
      ["gingerbread", "shortbread", "snickerdoodles"].map(recipeFile).sort(),
    );
    /* `onWrite` stays per write: the editor's invalidation needs each one. */
    expect(events).toEqual([
      "recipes:gingerbread",
      "recipes:snickerdoodles",
      "recipes:shortbread",
    ]);
    expect(await clean()).toBe(true);
    expect((await readRecipeFile("shortbread")).tags).toEqual(["cookies"]);
  });

  it("counts adds and removes, and commits nothing when nothing changed", async () => {
    await createRecipe(ctx, { name: "Naan", tags: ["bread"] });
    await createRecipe(ctx, { name: "Scone" });
    await createRecipe(ctx, { name: "Brioche" });
    const before = await head();

    await assignTerm(ctx, "bread", {
      add: ["scone", "brioche"],
      remove: ["naan"],
    });
    await assignTerm(ctx, "bread", { remove: ["scone", "brioche"] });
    const afterChanges = await head();
    await assignTerm(ctx, "bread", { add: ["naan"], remove: ["scone"] });
    await assignTerm(ctx, "bread", { add: ["naan"] });
    await assignTerm(ctx, "bread", { add: ["no-such-recipe"] });

    const commits = await commitsSince(before);
    expect(commits.map((commit) => commit.message)).toEqual([
      "Assign term: bread (+1 recipe)",
      "Unassign term: bread (-2 recipes)",
      "Assign term: bread (+2 recipes, -1 recipe)",
    ]);
    /* An assign that wrote nothing made no commit. */
    expect(await commitsSince(afterChanges)).toHaveLength(1);
    expect(await clean()).toBe(true);
  });

  it("tags groups in one commit too", async () => {
    await createGroup(ctx, { name: "Week One" });
    await createGroup(ctx, { name: "Week Two" });
    const before = await head();

    await assignTerm(ctx, "plans", {
      type: "group",
      add: ["week-one", "week-two"],
    });

    const commits = await commitsSince(before);
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe("Assign term: plans (+2 groups)");
    expect([...commits[0].files].sort()).toEqual(
      ["week-one", "week-two"].map(groupFile),
    );
  });

  it("renames a term with a record and N carriers in one commit", async () => {
    await createTerm(ctx, { label: "Cookies" });
    await createRecipe(ctx, { name: "Gingerbread", tags: ["cookies"] });
    await createRecipe(ctx, { name: "Shortbread", tags: ["cookies", "baked"] });
    await createGroup(ctx, { name: "Tin", tags: ["cookies"] });
    const before = await head();

    const result = await renameTerm(ctx, "cookies", { to: "Biscuits" });

    expect(result).toMatchObject({
      slug: "biscuits",
      recipes: ["shortbread", "gingerbread"],
      groups: ["tin"],
      /* 34-D4: the old slug rides the record's own write — no extra commit. */
      aliases: ["cookies"],
    });
    const commits = await commitsSince(before);
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe(
      "Rename term: cookies → biscuits (2 recipes, 1 group)",
    );
    expect(commits[0].files).toEqual(
      expect.arrayContaining([
        termFile("biscuits"),
        recipeFile("gingerbread"),
        recipeFile("shortbread"),
        groupFile("tin"),
      ]),
    );
    expect(await clean()).toBe(true);
    expect((await readRecipeFile("shortbread")).tags).toEqual([
      "biscuits",
      "baked",
    ]);
  });

  it("keeps the bare message when a rename moves only the record", async () => {
    await createTerm(ctx, { label: "Holiday" });
    const before = await head();
    await renameTerm(ctx, "holiday", { to: "festive" });
    const commits = await commitsSince(before);
    expect(commits.map((commit) => commit.message)).toEqual([
      "Rename term: holiday → festive",
    ]);
  });

  it("merges carriers, children and features in one commit", async () => {
    await createTerm(ctx, { label: "Dessert" });
    await createTerm(ctx, { label: "Sweets" });
    await createTerm(ctx, { label: "Cakes", parent: "sweets" });
    await createRecipe(ctx, { name: "Fudge", tags: ["sweets"] });
    await createRecipe(ctx, { name: "Toffee", tags: ["sweets"] });
    await feature(ctx, { term: "sweets", slug: "sweets-strip" });
    const before = await head();

    const result = await mergeTerm(ctx, "sweets", { into: "dessert" });

    expect(result).toMatchObject({
      deleted: true,
      reparented: [{ slug: "cakes", parent: "dessert" }],
      featured: ["sweets-strip"],
    });
    const commits = await commitsSince(before);
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe(
      "Merge term: sweets → dessert (2 recipes, 1 child, 1 feature)",
    );
    expect([...commits[0].files].sort()).toEqual(
      [
        featuredFile("sweets-strip"),
        recipeFile("fudge"),
        recipeFile("toffee"),
        termFile("cakes"),
        /* `sweets` becomes one of `dessert`'s aliases (32i), same commit. */
        termFile("dessert"),
        termFile("sweets"),
      ].sort(),
    );
    expect(await clean()).toBe(true);
  });

  it("deletes with unassign — carriers, children, features, record — in one commit", async () => {
    await createTerm(ctx, { label: "Baking" });
    await createTerm(ctx, { label: "Bread", parent: "baking" });
    await createTerm(ctx, { label: "Rye", parent: "bread" });
    await createRecipe(ctx, { name: "Naan", tags: ["bread"] });
    await createRecipe(ctx, { name: "Pita", tags: ["bread", "quick"] });
    await feature(ctx, { term: "bread", slug: "bread-strip" });
    const before = await head();

    const result = await deleteTerm(ctx, "bread", { unassign: true });

    expect(result).toMatchObject({
      deleted: true,
      reparented: [{ slug: "rye", parent: "baking" }],
      featured: ["bread-strip"],
      unfeatured: [],
    });
    const commits = await commitsSince(before);
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe(
      "Delete term: bread (2 recipes, 1 child, 1 feature)",
    );
    expect([...commits[0].files].sort()).toEqual(
      [
        featuredFile("bread-strip"),
        recipeFile("naan"),
        recipeFile("pita"),
        termFile("bread"),
        termFile("rye"),
      ].sort(),
    );
    expect(await clean()).toBe(true);
  });

  it("commits a failure part-way as (partial), stays clean, rethrows, and reverts", async () => {
    await createRecipe(ctx, { name: "Gingerbread" });
    await createRecipe(ctx, { name: "Broken" });
    await createRecipe(ctx, { name: "Shortbread" });
    /* A data file that no longer parses, committed, so the tree starts clean. */
    await writeFile(join(contentDirectory, recipeFile("broken")), "{ not json");
    await git.add(recipeFile("broken"));
    await git.commit("Break a recipe");
    const before = await head();
    expect(await clean()).toBe(true);

    await expect(
      assignTerm(ctx, "cookies", {
        add: ["gingerbread", "broken", "shortbread"],
      }),
    ).rejects.toThrow(SyntaxError);

    const commits = await commitsSince(before);
    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe(
      "Assign term: cookies (+1 recipe) (partial)",
    );
    expect(commits[0].files).toEqual([recipeFile("gingerbread")]);
    expect(await clean()).toBe(true);
    expect((await readRecipeFile("gingerbread")).tags).toEqual(["cookies"]);
    expect((await readRecipeFile("shortbread")).tags).toBeUndefined();

    /* D3's point: the partial is one ordinary commit, so a revert undoes it. */
    const reverted = await gitRevert(ctx, commits[0].hash);
    expect(reverted.message).toBe(
      'Revert "Assign term: cookies (+1 recipe) (partial)"',
    );
    expect((await readRecipeFile("gingerbread")).tags).toBeUndefined();
    expect(await clean()).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The engine's `commit: false` (F34)                                 */
/* ------------------------------------------------------------------ */

describe("engine writes with commit: false (F34)", () => {
  const groupFile = (slug: string) => `groups/data/${slug}/group.json`;
  const common = () => ({
    config: groupContentConfig,
    contentDirectory,
    author: ctx.author,
  });

  it("skips the commit and returns the paths, for create, update and delete", async () => {
    const before = await head();

    const created = await createContent<Group, GroupEntryValue, GroupEntryKey>({
      ...common(),
      slug: "week-one",
      data: { name: "Week One", date: 1 },
      commit: false,
    });
    expect(created.touchedPaths).toEqual([groupFile("week-one")]);
    expect(await head()).toBe(before);
    expect((await git.status()).not_added).toContain(groupFile("week-one"));

    const updated = await updateContent<Group, GroupEntryValue, GroupEntryKey>({
      ...common(),
      slug: "week-two",
      currentSlug: "week-one",
      currentIndexKey: [1, "week-one"],
      data: { name: "Week Two", date: 1 },
      commit: false,
    });
    expect(updated.touchedPaths).toEqual(
      expect.arrayContaining([groupFile("week-two")]),
    );
    expect(await head()).toBe(before);

    const deleted = await deleteContent<Group, GroupEntryValue, GroupEntryKey>({
      ...common(),
      slug: "week-two",
      indexKey: [1, "week-two"],
      commit: false,
    });
    expect(deleted.touchedPaths).toEqual(
      expect.arrayContaining([expect.stringContaining("week-two")]),
    );
    expect(await head()).toBe(before);
    /* Created and deleted without a commit between: nothing left to commit. */
    expect((await git.status()).isClean()).toBe(true);
  });

  it("commits as before when commit is omitted, with no touchedPaths key", async () => {
    const before = await head();
    const result = await createContent<Group, GroupEntryValue, GroupEntryKey>({
      ...common(),
      slug: "week-one",
      data: { name: "Week One", date: 1 },
    });
    expect(Object.keys(result).sort()).toEqual([
      "aggregates",
      "dependents",
      "pagination",
    ]);
    expect(await head()).not.toBe(before);
    expect((await git.status()).isClean()).toBe(true);
    const { commits } = await gitLog(ctx, { limit: 1 });
    expect(commits[0]).toMatchObject({
      message: "Add new groups: week-one",
      files: [groupFile("week-one")],
    });
  });
});

/* ------------------------------------------------------------------ */
/* Commits through a private index, CAS on HEAD (epic 34, 34c / D7)   */
/* ------------------------------------------------------------------ */

describe("private-index commits (34c)", () => {
  const recipeFile = (slug: string) => `recipes/data/${slug}/recipe.json`;
  const gitDir = () => join(contentDirectory, ".git");

  async function lastCommit() {
    const { commits } = await gitLog(ctx, { limit: 1 });
    return commits[0];
  }

  async function branch(): Promise<string> {
    return (await git.status()).current as string;
  }

  async function privateIndexes(): Promise<string[]> {
    return (await readdir(gitDir())).filter((name) =>
      /^discontent-index-[0-9A-Z]{26}/.test(name),
    );
  }

  afterEach(() => {
    commitTestHooks.beforeUpdateRef = undefined;
    delete process.env.DISCONTENT_INDEX_REFRESH_MS;
  });

  it("leaves a file staged by hand out of the commit, and staged", async () => {
    await writeFile(join(contentDirectory, "scratch.txt"), "mine\n");
    await git.add("scratch.txt");

    await createRecipe(ctx, { name: "Naan" });

    expect((await lastCommit()).files).toEqual([recipeFile("naan")]);
    const status = await git.status();
    expect(status.staged).toEqual(["scratch.txt"]);
    expect(status.files.map((file) => file.path)).toEqual(["scratch.txt"]);
    await expect(
      git.raw(["cat-file", "-e", "HEAD:scratch.txt"]),
    ).rejects.toThrow();
    expect(await privateIndexes()).toEqual([]);
  });

  it("names the write in the reflog, and keeps --author's semantics", async () => {
    await createRecipe(
      {
        ...ctx,
        author: { name: "editor@test.local", email: "editor@test.local" },
      },
      { name: "Naan" },
    );
    const reflog = String(
      await git.raw(["reflog", "-1", "--format=%gs", "HEAD"]),
    ).trim();
    expect(reflog).toMatch(
      /^discontent [0-9A-HJKMNP-TV-Z]{26}: Create recipe: naan$/,
    );
    /* Author from the write, committer from git's config — `commit --author`. */
    const who = String(
      await git.raw(["log", "-1", "--format=%an|%ae|%cn|%ce|%B"]),
    ).trim();
    expect(who).toBe(
      "editor@test.local|editor@test.local|Test Curator|curator@test.local|Create recipe: naan",
    );
  });

  it("survives a held index.lock, and the next write flushes the shared index", async () => {
    process.env.DISCONTENT_INDEX_REFRESH_MS = "200";
    const lock = join(gitDir(), "index.lock");
    await writeFile(lock, "");

    await createRecipe(ctx, { name: "Naan" });
    expect((await lastCommit()).files).toEqual([recipeFile("naan")]);
    const pending = join(gitDir(), "discontent-index-pending");
    expect(await readFile(pending, "utf8")).toBe(`${recipeFile("naan")}\0`);

    await rm(lock);
    /* The shared index does not know the commit yet... */
    expect((await git.status()).isClean()).toBe(false);
    /* ...until the next locked write applies what is pending. */
    await createRecipe(ctx, { name: "Scone" });
    expect(await pathExists(pending)).toBe(false);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("flushPendingIndex applies a pending refresh on its own", async () => {
    process.env.DISCONTENT_INDEX_REFRESH_MS = "100";
    const lock = join(gitDir(), "index.lock");
    await writeFile(lock, "");
    await createRecipe(ctx, { name: "Naan" });
    /* Still held: the flush cannot apply it either, and says so. */
    expect(await flushPendingIndex(contentDirectory, { timeoutMs: 50 })).toBe(
      false,
    );
    await rm(lock);
    expect(await flushPendingIndex(contentDirectory)).toBe(true);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("waits out a short index.lock without leaving anything pending", async () => {
    const lock = join(gitDir(), "index.lock");
    await writeFile(lock, "");
    setTimeout(() => void rm(lock, { force: true }), 300);
    await createRecipe(ctx, { name: "Naan" });
    expect(await pathExists(join(gitDir(), "discontent-index-pending"))).toBe(
      false,
    );
    expect((await git.status()).isClean()).toBe(true);
  });

  it("lands on top of a commit that moved HEAD over other paths", async () => {
    await reindex(ctx);
    const before = await head();
    commitTestHooks.beforeUpdateRef = async () => {
      commitTestHooks.beforeUpdateRef = undefined;
      await outputFile(join(contentDirectory, "notes/elsewhere.txt"), "x\n");
      await git.add("notes/elsewhere.txt");
      await git.commit("A commit from a shell");
    };

    await createRecipe(ctx, { name: "Naan" });

    const log = String(await git.raw(["log", "--format=%s", `${before}..HEAD`]))
      .trim()
      .split("\n");
    expect(log).toEqual(["Create recipe: naan", "A commit from a shell"]);
    expect((await lastCommit()).files).toEqual([recipeFile("naan")]);
    expect((await git.status()).isClean()).toBe(true);
    /* The shell's commit was never indexed: the stamp does not jump past it. */
    expect((await gitStatus(ctx)).indexStale).toBe(true);
  });

  it("throws CommitConflictError, with the paths, when that commit touched the same file", async () => {
    await createRecipe(ctx, { name: "Naan" });
    commitTestHooks.beforeUpdateRef = async () => {
      commitTestHooks.beforeUpdateRef = undefined;
      /* Their version of the file, committed without touching the worktree. */
      const scratch = join(gitDir(), "theirs.json");
      await writeFile(scratch, `${JSON.stringify({ name: "Their naan" })}\n`);
      const blob = String(await git.raw(["hash-object", "-w", scratch])).trim();
      await rm(scratch);
      await git.raw([
        "update-index",
        "--cacheinfo",
        `100644,${blob},${recipeFile("naan")}`,
      ]);
      await git.commit("Their edit");
    };

    const error = await updateRecipe(ctx, "naan", {
      name: "Garlic naan",
    }).catch((e) => e);
    expect(error).toBeInstanceOf(CommitConflictError);
    expect(error.touchedPaths).toEqual([recipeFile("naan")]);
    expect(error.conflictingPaths).toEqual([recipeFile("naan")]);
    expect(error.writeId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect((await lastCommit()).message).toBe("Their edit");
    /* Ours is on disk, uncommitted, for a person to settle. */
    expect((await readRecipeFile("naan")).name).toBe("Garlic naan");
    expect(await privateIndexes()).toEqual([]);
  });

  it("throws CommitFailedError, with the paths, when git cannot move the ref", async () => {
    const refLock = join(gitDir(), "refs/heads", `${await branch()}.lock`);
    await writeFile(refLock, "");
    const before = await head();
    try {
      const error = await createRecipe(ctx, { name: "Naan" }).catch((e) => e);
      expect(error).toBeInstanceOf(CommitFailedError);
      expect(error.touchedPaths).toEqual([recipeFile("naan")]);
      expect(error.writeId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(error.message).toContain(recipeFile("naan"));
      expect(await head()).toBe(before);
    } finally {
      await rm(refLock, { force: true });
    }
    expect(await privateIndexes()).toEqual([]);
  });

  it("commits a rename as the old path's removal and the new one's addition", async () => {
    await createRecipe(ctx, { name: "Naan" });
    await updateRecipe(ctx, "naan", { slug: "garlic-naan" });
    /* `--no-renames`: `gitLog` reports a rename by its new path alone. */
    const files = String(
      await git.raw([
        "show",
        "--no-renames",
        "--name-status",
        "--format=",
        "HEAD",
      ]),
    ).trim();
    expect(files.split("\n").sort()).toEqual([
      `A\t${recipeFile("garlic-naan")}`,
      `D\t${recipeFile("naan")}`,
    ]);
    const tree = String(
      await git.raw(["ls-tree", "-r", "--name-only", "HEAD"]),
    );
    expect(tree).toContain(recipeFile("garlic-naan"));
    expect(tree).not.toContain(recipeFile("naan"));
    expect((await git.status()).isClean()).toBe(true);
  });

  it("commits a delete, and makes no commit for one of something never committed", async () => {
    await createRecipe(ctx, { name: "Naan" });
    await deleteRecipe(ctx, "naan");
    expect(await lastCommit()).toMatchObject({
      message: "Delete recipe: naan",
      files: [recipeFile("naan")],
    });
    expect((await git.status()).isClean()).toBe(true);

    /* Written without a commit, then deleted: in no tree at all (T46). */
    await createContent<Group, GroupEntryValue, GroupEntryKey>({
      config: groupContentConfig,
      contentDirectory,
      slug: "draft",
      data: { name: "Draft", date: 1 },
      commit: false,
    });
    const before = await head();
    await deleteContent<Group, GroupEntryValue, GroupEntryKey>({
      config: groupContentConfig,
      contentDirectory,
      slug: "draft",
      indexKey: [1, "draft"],
    });
    expect(await head()).toBe(before);
    expect((await git.status()).isClean()).toBe(true);
  });

  it("makes the first commit on an unborn branch", async () => {
    const fresh = await scratchDir("unborn-");
    const repo = simpleGit({ baseDir: fresh });
    await repo.init();
    await repo.addConfig("user.email", "curator@test.local");
    await repo.addConfig("user.name", "Test Curator");
    await repo.addConfig("commit.gpgsign", "false");
    await writeFile(
      join(fresh, ".gitignore"),
      derivedContentPaths(recipeContentTypes),
    );

    await createContent<Group, GroupEntryValue, GroupEntryKey>({
      config: groupContentConfig,
      contentDirectory: fresh,
      slug: "week-one",
      data: { name: "Week One", date: 1 },
    });

    const parents = String(
      await repo.raw(["rev-list", "--parents", "-n", "1", "HEAD"]),
    )
      .trim()
      .split(" ");
    expect(parents).toHaveLength(1);
    expect(
      String(await repo.raw(["ls-tree", "-r", "--name-only", "HEAD"])).trim(),
    ).toBe("groups/data/week-one/group.json");
    /* Only its own path: the .gitignore is still untracked. */
    expect((await repo.status()).not_added).toEqual([".gitignore"]);
  });

  it("moves a detached HEAD and leaves the branch where it was", async () => {
    const onBranch = await branch();
    const tip = await head();
    await git.raw(["checkout", "-q", "--detach"]);

    await createRecipe(ctx, { name: "Naan" });

    expect(await head()).not.toBe(tip);
    expect(String(await git.raw(["rev-parse", onBranch])).trim()).toBe(tip);
    /* Still detached: HEAD names no branch. */
    expect(
      String(await git.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim(),
    ).toBe("HEAD");
    expect((await git.status()).isClean()).toBe(true);
  });

  it("carries a current index stamp to the new commit", async () => {
    await reindex(ctx);
    await createRecipe(ctx, { name: "Naan" });
    expect(await indexFreshness(ctx)).toEqual({
      indexedHead: await head(),
      head: await head(),
      stale: false,
    });
  });

  it("refuses to write anything while a merge is in progress", async () => {
    await writeFile(join(gitDir(), "MERGE_HEAD"), `${await head()}\n`);
    const before = await head();
    await expect(createRecipe(ctx, { name: "Naan" })).rejects.toBeInstanceOf(
      MergeInProgressError,
    );
    expect(await pathExists(join(contentDirectory, recipeFile("naan")))).toBe(
      false,
    );
    expect(await head()).toBe(before);
  });

  it("writes data files atomically, leaving no temp files behind", async () => {
    await createRecipe(ctx, { name: "Naan" });
    await updateRecipe(ctx, "naan", { name: "Garlic naan" });
    expect(await readdir(join(contentDirectory, "recipes/data/naan"))).toEqual([
      "recipe.json",
    ]);
  });
});
