// @vitest-environment node
//
// Epic 28, 28e: the `media` step of `gitSync` on scratch repositories — a
// large file added on either side arrives on the other as real content, a
// drop below `numcopies` is refused, and a repository annexed on one side
// only syncs exactly as before. Skipped where git-annex is not installed
// (CI's container); it runs on tourmaline.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, outputFile, readFile, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import simpleGit, { type SimpleGit } from "simple-git";

import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { gitSync } from "../websites/recipe-website/editor/controller/curation/sync";
import {
  annexSkipReason,
  updateAnnexedWorktree,
} from "../websites/recipe-website/editor/controller/curation/annex";

const hasAnnex = spawnSync("git", ["annex", "version"]).status === 0;
const VIDEO = "uploads/recipe/soup/uploads/soup.mp4";
const PHOTO = "uploads/recipe/naan/uploads/naan.jpg";

const scratch: string[] = [];
afterEach(async () => {
  await closeCachedEnvironments();
  for (const directory of scratch.splice(0)) {
    /* git-annex makes its object files read-only. */
    spawnSync("chmod", ["-R", "u+w", directory]);
    await rm(directory, { recursive: true, force: true });
  }
});

async function scratchDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  scratch.push(directory);
  return directory;
}

async function identify(repo: SimpleGit) {
  await repo.addConfig("user.email", "curator@test.local");
  await repo.addConfig("user.name", "Test Curator");
  await repo.addConfig("commit.gpgsign", "false");
}

/**
 * A workstation and its mirror, both annexed as `scripts/annex-activate.sh`
 * leaves them: the largefiles rule committed, `numcopies` 2, the mirror's
 * uuid recorded on the workstation's remote. `annexMirror: false` stops
 * before the mirror side — the state of the real repositories today.
 */
async function pair({ annexMirror = true } = {}) {
  const dir = await scratchDir("annex-ws-");
  const ws = simpleGit({ baseDir: dir });
  await ws.init();
  await identify(ws);
  await ws.raw(["annex", "init", "workstation"]);
  await writeFile(
    join(dir, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  /* 5mb in production; 10kb keeps the test fast. */
  await writeFile(
    join(dir, ".gitattributes"),
    "* annex.largefiles=(largerthan=10kb)\n",
  );
  await ws.add(".");
  await ws.commit("Initial commit");
  await ws.raw(["annex", "numcopies", "2"]);

  const mirrorDir = await scratchDir("annex-mirror-");
  await simpleGit().clone(dir, mirrorDir);
  const mirror = simpleGit({ baseDir: mirrorDir });
  await identify(mirror);
  await mirror.addConfig("receive.denyCurrentBranch", "updateInstead");
  if (annexMirror) await mirror.raw(["annex", "init", "mirror"]);

  await ws.addRemote("mirror", mirrorDir);
  await ws.fetch("mirror");
  const branch = (await ws.status()).current as string;
  await ws.raw(["branch", "--set-upstream-to", `mirror/${branch}`]);
  if (annexMirror) {
    const uuid = (await mirror.raw(["config", "annex.uuid"])).trim();
    await ws.addConfig("remote.mirror.annex-uuid", uuid);
  }
  return { dir, ws, mirrorDir, mirror };
}

async function addLarge(repo: SimpleGit, root: string, path: string) {
  const bytes = randomBytes(64 * 1024);
  await outputFile(join(root, path), bytes);
  await repo.add(path);
  await repo.commit(`Add ${path}`);
  return bytes;
}

describe.skipIf(!hasAnnex)("gitSync's media step (28e)", () => {
  it("sends a large file's content to the mirror", async () => {
    const { dir, ws, mirrorDir } = await pair();
    const bytes = await addLarge(ws, dir, VIDEO);
    /* Annexed, not stored in git: the blob is a pointer. */
    expect(String(await ws.raw(["show", `HEAD:${VIDEO}`]))).toMatch(
      /^\/annex\/objects\//,
    );

    const result = await gitSync(
      { contentDirectory: dir },
      { remote: "mirror" },
    );
    expect(result.outcome).toBe("synced");
    expect(result.steps.find((step) => step.step === "media")).toMatchObject({
      status: "ok",
      detail: "in 0, out 1",
    });
    /* The content is in the mirror's annex before the push lands... */
    const there = spawnSync("git", ["annex", "find", "--in", "here", VIDEO], {
      cwd: mirrorDir,
    });
    expect(String(there.stdout).trim()).toBe(VIDEO);
    /* ...but `updateInstead` checks out without git-annex's hook, so the file
     * is a pointer until the mirror's editor updates its tree on the HEAD
     * move, as `instance/start.ts` does. */
    await updateAnnexedWorktree(mirrorDir);
    expect(await readFile(join(mirrorDir, VIDEO))).toEqual(bytes);
  }, 120_000);

  it("brings a mirror's upload in", async () => {
    const { dir, mirrorDir, mirror } = await pair();
    const bytes = await addLarge(mirror, mirrorDir, PHOTO);

    const result = await gitSync(
      { contentDirectory: dir },
      { remote: "mirror" },
    );
    expect(result.outcome).toBe("synced");
    expect(result.pulled).toBe(1);
    /* "out 1" is allowed: the mirror's `git add` journals its location log
     * without committing it, so the copy back may run and find the content
     * already there. */
    expect(result.steps.find((step) => step.step === "media")?.detail).toMatch(
      /^in 1, out [01]$/,
    );
    expect(await readFile(join(dir, PHOTO))).toEqual(bytes);

    /* And an unchanged second sync moves nothing. */
    const again = await gitSync(
      { contentDirectory: dir },
      { remote: "mirror" },
    );
    expect(again.outcome).toBe("nothing");
  }, 120_000);

  it("refuses to drop below numcopies, even with the mirror's copy", async () => {
    const { dir, ws } = await pair();
    await addLarge(ws, dir, VIDEO);
    await gitSync({ contentDirectory: dir }, { remote: "mirror" });

    const drop = spawnSync("git", ["annex", "drop", VIDEO], { cwd: dir });
    expect(drop.status).not.toBe(0);
    expect(String(drop.stdout) + String(drop.stderr)).toMatch(
      /numcopies|Unable to lock down 1 copy|could only verify|requires 2/i,
    );
    expect((await readFile(join(dir, VIDEO))).length).toBe(64 * 1024);
  }, 120_000);

  it("stays out of the way while only this side is annexed", async () => {
    const { dir, ws, mirrorDir } = await pair({ annexMirror: false });
    expect(await annexSkipReason(dir, "mirror")).toBe(
      "mirror has no git-annex repository yet",
    );
    await outputFile(join(dir, "recipes/data/naan/recipe.json"), "{}\n");
    await ws.add(".");
    await ws.commit("A small file");

    const result = await gitSync(
      { contentDirectory: dir },
      { remote: "mirror" },
    );
    expect(result.outcome).toBe("synced");
    expect(result.steps.find((step) => step.step === "media")).toMatchObject({
      status: "skipped",
      detail: "mirror has no git-annex repository yet",
    });
    expect(
      String(await readFile(join(mirrorDir, "recipes/data/naan/recipe.json"))),
    ).toBe("{}\n");
  }, 120_000);
});

describe("the media step without git-annex initialised", () => {
  it("is skipped with a reason", async () => {
    const dir = await scratchDir("plain-");
    const repo = simpleGit({ baseDir: dir });
    await repo.init();
    expect(await annexSkipReason(dir, "origin")).toBe(
      "git-annex is not initialised here",
    );
  });
});
