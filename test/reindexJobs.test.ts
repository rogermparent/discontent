// @vitest-environment node
//
// Epic 39, 39b: the index-version stamp (D1) and reindex as a job (D2) —
// `packages/cms/git/indexStamp.ts`'s `computeIndexVersion`, the `reindex`
// job kind and its `repo:` line (`editor/controller/jobs/{kinds,repo}.ts`),
// a cancel before and after the rebuild begins, and the live queue position
// in a waiting job's meta. Scratch content repositories under the OS temp
// dir; the jobs and queue dirs are the test file's own (`setupTests.js`).

import { mkdtemp, rm, symlink, writeFile } from "fs-extra";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import simpleGit from "simple-git";

import type { AnyContentTypeConfig } from "@discontent/cms/content/types";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import {
  computeIndexVersion,
  readIndexFreshness,
  readIndexVersion,
} from "@discontent/cms/git/indexStamp";
import { withWriteLock } from "@discontent/cms/git/writeLock";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { currentIndexVersion } from "../websites/recipe-website/editor/controller/indexVersion";
import { runSpec } from "../websites/recipe-website/editor/controller/jobs/kinds";
import { jobsDirectory } from "../websites/recipe-website/editor/controller/jobs/location";
import {
  acquire,
  queueSnapshot,
  repoResource,
  withResource,
} from "../websites/recipe-website/editor/controller/jobs/queue";
import {
  requestJobCancel,
  runJob,
  runningJobIds,
} from "../websites/recipe-website/editor/controller/jobs/run";
import { readJobMeta } from "../websites/recipe-website/editor/controller/jobs/store";
import {
  getJobView,
  listJobSummaries,
} from "../websites/recipe-website/editor/controller/jobs/views";

const scratch: string[] = [];

async function scratchRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "reindex-job-"));
  scratch.push(dir);
  const repo = simpleGit({ baseDir: dir });
  await repo.init();
  await repo.addConfig("user.email", "curator@test.local");
  await repo.addConfig("user.name", "Test Curator");
  await repo.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(dir, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await repo.add(".");
  await repo.commit("Initial commit");
  return dir;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await closeCachedEnvironments();
  for (const dir of scratch.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* D1 — the index version                                              */
/* ------------------------------------------------------------------ */

/** The registry with one config replaced. */
function withConfig(
  contentType: string,
  change: (config: AnyContentTypeConfig) => AnyContentTypeConfig,
): AnyContentTypeConfig[] {
  return recipeContentTypes.map((config) =>
    config.contentType === contentType ? change(config) : config,
  );
}

describe("computeIndexVersion (39-D1)", () => {
  const base = computeIndexVersion(recipeContentTypes);

  it("is a short hash, the same every time", () => {
    expect(base).toMatch(/^[0-9a-f]{16}$/);
    expect(computeIndexVersion(recipeContentTypes)).toBe(base);
    expect(currentIndexVersion()).toBe(base);
  });

  /*
   * Pinned, as `specVersions.test.ts` pins the spec modules. When it moves,
   * every instance rebuilds its indexes once at its next start — by itself,
   * no checklist step (D1). Accept the new value with `vitest -u` once the
   * spec change that moved it is the one you meant.
   */
  it("pins this site's version", () => {
    expect(base).toMatchInlineSnapshot(`"8c67321604d73888"`);
  });

  /*
   * A comment, a rename, a reformatting — anything that changes a config
   * module's source text and not its declarations — must not move it, or
   * every deploy would rebuild for nothing. Function source never enters the
   * hash (it differs between a minified build and a dev server anyway, F16):
   * here every function the registry carries is swapped for a wrapper with
   * other source text, and the version stands.
   */
  it("does not move when only function source changes", () => {
    const rewrapped = recipeContentTypes.map((config) => ({
      ...config,
      buildIndexKey: (...args: Parameters<typeof config.buildIndexKey>) =>
        /* edited */ config.buildIndexKey(...args),
      buildIndexValue: (...args: Parameters<typeof config.buildIndexValue>) =>
        /* edited */ config.buildIndexValue(...args),
      ...(config.paginationIndexes
        ? {
            paginationIndexes: config.paginationIndexes.map((index) => ({
              ...index,
              project: (entry: never) =>
                /* edited */ (index.project as (entry: never) => unknown)?.(
                  entry,
                ),
            })),
          }
        : {}),
    })) as AnyContentTypeConfig[];
    expect(computeIndexVersion(rewrapped)).toBe(base);
  });

  it("moves with every declaration that changes what an index holds", () => {
    const variants: [string, AnyContentTypeConfig[]][] = [
      [
        "a pagination version",
        withConfig("recipes", (config) => ({
          ...config,
          paginationIndexes: config.paginationIndexes!.map((index) => ({
            ...index,
            version: `${index.version}-bumped`,
          })),
        })),
      ],
      [
        "a pagination perPage",
        withConfig("recipes", (config) => ({
          ...config,
          paginationIndexes: config.paginationIndexes!.map((index) => ({
            ...index,
            perPage: index.perPage + 1,
          })),
        })),
      ],
      [
        "an aggregate version",
        withConfig("groups", (config) => ({
          ...config,
          aggregates: config.aggregates!.map((aggregate) => ({
            ...aggregate,
            version: `${aggregate.version}-bumped`,
          })),
        })),
      ],
      [
        "a taxonomy version",
        withConfig("recipes", (config) => ({
          ...config,
          taxonomies: config.taxonomies!.map((taxonomy) => ({
            ...taxonomy,
            version: `${taxonomy.version}-bumped`,
          })),
        })),
      ],
      [
        "a content index version",
        withConfig("recipes", (config) => ({ ...config, indexVersion: "2" })),
      ],
      [
        "a reference's borrowed fields",
        withConfig("featured-recipes", (config) => ({
          ...config,
          references: config.references!.map((reference) => ({
            ...reference,
            fields: [...reference.fields, "extra"],
          })),
        })),
      ],
      ["a new content type", [...recipeContentTypes, recipeContentTypes[0]]],
    ];
    const seen = new Set([base]);
    for (const [name, registry] of variants) {
      const version = computeIndexVersion(registry);
      expect(version, name).not.toBe(base);
      seen.add(version);
    }
    expect(seen.size).toBe(variants.length + 1);
  });

  it("is written by a full rebuild, beside the HEAD stamp", async () => {
    const dir = await scratchRepo();
    expect(await readIndexVersion(dir)).toBeNull();
    expect(
      await readIndexFreshness(dir, { version: currentIndexVersion() }),
    ).toMatchObject({ versionStale: true, indexedVersion: null });
    await createLocalBackend({ contentDirectory: dir }).reindex();
    expect(await readIndexVersion(dir)).toBe(currentIndexVersion());
    expect(
      await readIndexFreshness(dir, { version: currentIndexVersion() }),
    ).toMatchObject({ versionStale: false, stale: false });
  });
});

/* ------------------------------------------------------------------ */
/* D2 — reindex as a job                                               */
/* ------------------------------------------------------------------ */

describe("reindex as a job (39-D2)", () => {
  it("records a CLI reindex as a job with a step per content type", async () => {
    const dir = await scratchRepo();
    await createRecipe({ contentDirectory: dir }, { name: "Naan" });
    const result = await createLocalBackend({
      contentDirectory: dir,
    }).reindex();
    expect(result.job).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(result.rebuilt).toEqual(
      recipeContentTypes.map((config) => config.contentType),
    );

    const listed = await listJobSummaries({ kind: "reindex" });
    expect(listed.jobs.find((job) => job.id === result.job)).toMatchObject({
      kind: "reindex",
      status: "done",
      label: "rebuild every index (CLI or MCP)",
      cancellable: false,
    });

    const view = await getJobView(result.job!);
    const ended = view.lines
      .filter(
        (line) => line.phase === "end" && line.step.startsWith("reindex."),
      )
      .map((line) => line.step);
    expect(ended).toEqual(
      recipeContentTypes.map((config) => `reindex.${config.contentType}`),
    );
    expect(view.lines.some((line) => line.step === "job.sealed")).toBe(true);
    expect(view.meta.resources).toEqual([repoResource(dir)]);
  });

  it("keys the line by repository: a symlink and its target share one", async () => {
    const dir = await scratchRepo();
    const link = join(tmpdir(), `reindex-link-${Date.now()}`);
    await symlink(dir, link);
    scratch.push(link);
    expect(repoResource(link)).toBe(repoResource(dir));
    expect(repoResource(dir)).toMatch(/^repo:reindex-job-[^/]+-[0-9a-f]{8}$/);
    expect(repoResource(await scratchRepo())).not.toBe(repoResource(dir));
  });

  it("waits in the repository's line, and a cancel there stops it before anything is rebuilt", async () => {
    const dir = await scratchRepo();
    const holder = await acquire(repoResource(dir));
    const before = await readIndexFreshness(dir);
    const pending = runSpec({
      kind: "reindex",
      contentDirectory: dir,
      trigger: "local",
    });
    pending.catch(() => undefined);
    await vi.waitFor(() => expect(runningJobIds()).toHaveLength(1), {
      timeout: 5_000,
    });
    const [id] = runningJobIds();
    await vi.waitFor(
      async () =>
        expect((await readJobMeta(jobsDirectory(), id))?.waiting).toMatchObject(
          {
            resource: repoResource(dir),
            position: 1,
          },
        ),
      { timeout: 5_000 },
    );
    expect(await requestJobCancel(id)).toBe("cancelled");
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(await readJobMeta(jobsDirectory(), id)).toMatchObject({
      status: "cancelled",
    });
    /* Nothing was rebuilt: the stamp is where it was. */
    expect(await readIndexFreshness(dir)).toEqual(before);
    await holder.release();
  });

  it("refuses a cancel once the rebuild has begun, and runs to its end", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const outcome = runJob(
      { kind: "reindex", label: "x", spec: {} },
      async (job) => {
        await job.beyondCancel?.("past the point");
        await gate;
        return "finished";
      },
      { mirror: null },
    );
    await vi.waitFor(() => expect(runningJobIds()).toHaveLength(1));
    const [id] = runningJobIds();
    await vi.waitFor(async () =>
      expect((await readJobMeta(jobsDirectory(), id))?.cancellable).toBe(false),
    );
    expect(await requestJobCancel(id)).toBe("refused");
    release();
    await expect(outcome).resolves.toMatchObject({ result: "finished" });
    expect(await readJobMeta(jobsDirectory(), id)).toMatchObject({
      status: "done",
    });
  });

  it("honours a cancel asked just before the rebuild begins", async () => {
    const outcome = runJob(
      { kind: "reindex", label: "x", spec: {} },
      async (job) => {
        expect(await requestJobCancel(job.jobId!)).toBe("cancelled");
        await job.beyondCancel?.("too late to seal");
        return "should not finish";
      },
      { mirror: null },
    );
    await expect(outcome).rejects.toMatchObject({ code: "cancelled" });
  });

  /*
   * The lock order (`jobs/repo.ts`): the `/git` page's pull rebuilds inside
   * the write lock. Waiting there for the repository's line — held here by
   * someone who could be waiting for that lock — would deadlock, so a
   * reindex job asked for inside the lock runs in its scope, not in line.
   */
  it("skips the line inside the write lock: no deadlock against a holder", async () => {
    const dir = await scratchRepo();
    const holder = await acquire(repoResource(dir));
    const result = await withWriteLock(dir, "git pull (test)", () =>
      runSpec({ kind: "reindex", contentDirectory: dir, trigger: "editor" }),
    );
    expect(result.rebuilt.length).toBe(recipeContentTypes.length);
    const view = await getJobView(result.job);
    expect(view.lines.some((line) => line.step === "queue.skip")).toBe(true);
    expect(view.lines.some((line) => line.step === "queue.wait")).toBe(false);
    await holder.release();
  });
});

/* ------------------------------------------------------------------ */
/* The live queue position (the 37c backlog row)                       */
/* ------------------------------------------------------------------ */

describe("a waiting job's place in line", () => {
  it("is re-read into its meta as the line moves", async () => {
    vi.stubEnv("RECIPE_QUEUE_POLL_MS", "10");
    const resource = "repo:position-test-00000000";
    const holder = await acquire(resource);
    let second!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      second = resolve;
    });
    const first = withResource(resource, {}, () => secondGate);
    await vi.waitFor(async () =>
      expect((await queueSnapshot(resource)).waiters).toHaveLength(1),
    );
    const job = runJob(
      { kind: "reindex", label: "x", spec: {} },
      (context) => withResource(resource, context, async () => "granted"),
      { mirror: null },
    );
    await vi.waitFor(() => expect(runningJobIds()).toHaveLength(1));
    const [id] = runningJobIds();
    await vi.waitFor(async () =>
      expect((await readJobMeta(jobsDirectory(), id))?.waiting?.position).toBe(
        2,
      ),
    );
    await holder.release();
    await vi.waitFor(async () =>
      expect((await readJobMeta(jobsDirectory(), id))?.waiting?.position).toBe(
        1,
      ),
    );
    second();
    await first;
    await expect(job).resolves.toMatchObject({ result: "granted" });
  });
});
