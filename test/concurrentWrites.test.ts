// @vitest-environment node
//
// Epic 34, 34c: two writer processes and a third that keeps grabbing
// `index.lock`, on one scratch repository.
//
// The failure this replaces: every engine commit used to be `git add` and a
// bare `git commit` through the shared index, so a second process's commit
// could sweep up the first one's staged paths, and anything holding
// `index.lock` (the workstation sync's `git status`/`merge`) failed the write
// outright — epic 33's ninth real-repo write. Now each write holds the
// cross-process write lock (D6) and commits through a private index with a
// CAS on HEAD (D7), so the expected outcome is exact: one commit per write,
// each touching only its own path, a clean tree, and every write indexed.

import { spawn } from "node:child_process";
import { mkdtemp, pathExists, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execa } from "execa";
import simpleGit, { type SimpleGit } from "simple-git";

import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import {
  getContentDatabase,
  getIndexCount,
} from "@discontent/cms/content/database";
import type { ContentTypeConfig } from "@discontent/cms/content/types";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { tagTermContentConfig } from "../websites/recipe-website/common/controller/tagTermContentConfig";

const EDITOR_DIR = resolve(__dirname, "../websites/recipe-website/editor");
const WRITER = resolve(__dirname, "support/termWriter.ts");
const PER_WRITER = 15;

/*
 * The third process: `index.lock` held for 200 ms, released for 100 ms, until
 * a stop file appears. It holds the lock the way git does (O_EXCL create), and
 * skips a turn if git itself has it.
 */
const LOCK_HOLDER = `
const fs = require("fs");
const [lock, stop] = process.argv.slice(1);
let bursts = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  while (!fs.existsSync(stop)) {
    let held = false;
    try { fs.closeSync(fs.openSync(lock, "wx")); held = true; bursts++; } catch {}
    await sleep(200);
    if (held) fs.rmSync(lock, { force: true });
    await sleep(100);
  }
  process.stdout.write(String(bursts));
})();
`;

let dir: string;
let git: SimpleGit;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "concurrent-writes-"));
  git = simpleGit({ baseDir: dir });
  await git.init();
  await git.addConfig("user.email", "curator@test.local");
  await git.addConfig("user.name", "Test Curator");
  await git.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(dir, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await git.add(".");
  await git.commit("Initial commit");
});

afterAll(async () => {
  await closeCachedEnvironments();
  await rm(dir, { recursive: true, force: true });
});

function writer(prefix: string) {
  return execa(
    "pnpm",
    ["exec", "tsx", WRITER, dir, prefix, String(PER_WRITER)],
    {
      cwd: EDITOR_DIR,
      reject: false,
      env: { ...process.env, CONTENT_DIRECTORY: undefined },
    },
  );
}

describe("two writer processes and an index.lock holder", () => {
  it("make one commit per write, each touching only its own path", async () => {
    const stop = join(dir, ".git", "stop-holder");
    const holder = spawn(
      process.execPath,
      ["-e", LOCK_HOLDER, join(dir, ".git", "index.lock"), stop],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    let bursts = "";
    holder.stdout.on("data", (chunk) => (bursts += String(chunk)));
    const holderExit = new Promise<void>((done) =>
      holder.on("close", () => done()),
    );

    const started = Date.now();
    const [a, b] = await Promise.all([writer("alpha"), writer("beta")]);
    const elapsed = Date.now() - started;

    await writeFile(stop, "");
    await holderExit;
    await rm(stop, { force: true });

    expect(a.stderr).toBe("");
    expect(b.stderr).toBe("");
    expect(a.exitCode).toBe(0);
    expect(b.exitCode).toBe(0);
    expect(Number(bursts)).toBeGreaterThan(5);

    const timings = [a, b].flatMap(
      (run) =>
        JSON.parse(run.stdout.trim().split("\n").at(-1)!).timings as number[],
    );
    const sorted = [...timings].sort((x, y) => x - y);
    console.info(
      `34c concurrency: ${timings.length} writes in ${elapsed} ms (incl. two tsx starts); ` +
        `per write median ${sorted[Math.floor(sorted.length / 2)]} ms, max ${sorted.at(-1)} ms; ` +
        `${bursts} index.lock bursts`,
    );

    /* 30 commits, each exactly its own term file. */
    const log = String(
      await git.raw([
        "log",
        "--no-renames",
        "--name-only",
        "--format=%x00%s",
        "HEAD~30..HEAD",
      ]),
    );
    const commits = log
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const [subject, ...files] = entry.trim().split("\n");
        return { subject, files: files.filter(Boolean) };
      });
    expect(commits).toHaveLength(2 * PER_WRITER);
    for (const { subject, files } of commits) {
      const slug = subject.replace(/^Create term: /, "");
      expect(subject).toMatch(/^Create term: (alpha|beta)-\d+$/);
      expect(files).toEqual([`taxonomies/tag/data/${slug}/term.json`]);
    }
    expect(new Set(commits.map((c) => c.subject)).size).toBe(2 * PER_WRITER);
    /* Nothing older slipped in: the 31st commit back is the initial one. */
    expect(
      String(await git.raw(["log", "-1", "--format=%s", "HEAD~30"])).trim(),
    ).toBe("Initial commit");

    /* A clean tree, with nothing left for a later write to flush. */
    expect(await pathExists(join(dir, ".git", "index.lock"))).toBe(false);
    expect(
      await pathExists(join(dir, ".git", "discontent-index-pending")),
    ).toBe(false);
    expect((await git.status()).isClean()).toBe(true);

    /* And every write indexed. */
    const db = getContentDatabase(
      tagTermContentConfig as unknown as ContentTypeConfig,
      dir,
    );
    expect(getIndexCount(db)).toBe(2 * PER_WRITER);
  }, 180_000);
});
