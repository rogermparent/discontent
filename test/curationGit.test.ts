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
  gitFileAt,
  gitLog,
  gitPush,
  gitRestore,
  gitRevert,
  gitShow,
  gitStatus,
  labelForPath,
} from "../websites/recipe-website/editor/controller/curation/git";
import { createGroup } from "../websites/recipe-website/editor/controller/curation/groups";
import {
  createRecipe,
  updateRecipe,
} from "../websites/recipe-website/editor/controller/curation/recipes";
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
    expect(result.rebuilt).toHaveLength(4);
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
    expect(result.rebuilt).toHaveLength(4);
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
