// @vitest-environment node
//
// Epic 39, 39b: the index-version stamp (D1) and reindex as a job (D2) —
// `packages/cms/git/indexStamp.ts`'s `computeIndexVersion`, the `reindex`
// job kind and its `repo:` line (`editor/controller/jobs/{kinds,repo}.ts`),
// a cancel before and after the rebuild begins, and the live queue position
// in a waiting job's meta. Scratch content repositories under the OS temp
// dir; the jobs and queue dirs are the test file's own (`setupTests.js`).
//
// The review round (39b): a released hold no longer passes through (M1), a
// person's rebuild leaves the line after a bound as `busy` (M2), a rebuild
// asked only if stale skips fresh indexes (L3), and a rebuild that fails
// part-way writes no version.

import { mkdtemp, rm, symlink, writeFile } from "fs-extra";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * A rebuild that fails part-way (the review's missing test): `failOn` names
 * the content type whose rebuild throws; unset, every rebuild is the real one.
 */
const { failOn } = vi.hoisted(() => ({
  failOn: { contentType: undefined as string | undefined },
}));
vi.mock("@discontent/cms/content/rebuildIndex", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@discontent/cms/content/rebuildIndex")
    >();
  return {
    ...actual,
    rebuildIndex: (async (options) => {
      if (options.config.contentType === failOn.contentType) {
        throw new Error("the disk filled up (test)");
      }
      return actual.rebuildIndex(options);
    }) as typeof actual.rebuildIndex,
  };
});
import simpleGit from "simple-git";

import type { AnyContentTypeConfig } from "@discontent/cms/content/types";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import {
  computeIndexVersion,
  readIndexFreshness,
  readIndexVersion,
  writeIndexVersion,
} from "@discontent/cms/git/indexStamp";
import { withWriteLock } from "@discontent/cms/git/writeLock";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { reindex } from "../websites/recipe-website/editor/controller/curation/reindex";
import { createSyncRunner } from "../websites/recipe-website/editor/controller/instance/runner";
import { currentIndexVersion } from "../websites/recipe-website/editor/controller/indexVersion";
import { runSpec } from "../websites/recipe-website/editor/controller/jobs/kinds";
import { jobsDirectory } from "../websites/recipe-website/editor/controller/jobs/location";
import {
  acquire,
  holdsHere,
  outsideQueue,
  queueSnapshot,
  repoResource,
  withResource,
  type ResourceGrant,
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
  failOn.contentType = undefined;
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
    expect(base).toMatchInlineSnapshot(`"4a3e71b1227164cb"`);
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
        withConfig("recipes", (config) => ({
          ...config,
          indexVersion: `${config.indexVersion ?? "1"}-bumped`,
        })),
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

/* ------------------------------------------------------------------ */
/* The review round                                                    */
/* ------------------------------------------------------------------ */

describe("a hold counts only while it is held (39b review, M1)", () => {
  it("passes through inside the hold, never from a timer that outlives it", async () => {
    const resource = "repo:leak-timer-00000000";
    let leaked!: Promise<ResourceGrant>;
    await withResource(resource, {}, async () => {
      expect(holdsHere(resource)).toBe(true);
      const inner = await acquire(resource);
      expect(inner.passThrough).toBe(true);
      /* Started inside, run after the release: it keeps this context. */
      leaked = new Promise((resolve) =>
        setTimeout(() => resolve(acquire(resource)), 50),
      );
    });
    const grant = await leaked;
    expect(grant.passThrough).toBe(false);
    expect((await queueSnapshot(resource)).holder).toBeDefined();
    await grant.release();
    /* `outsideQueue` drops a live hold too, for work meant to outlive it. */
    await withResource(resource, {}, async () => {
      expect(outsideQueue(() => holdsHere(resource))).toBe(false);
    });
  });

  it("never from a sync runner's run requested inside the hold", async () => {
    const resource = "repo:leak-runner-00000000";
    const passed: boolean[] = [];
    const runner = createSyncRunner({
      run: async () => {
        const grant = await acquire(resource);
        passed.push(grant.passThrough);
        await grant.release();
      },
      debounceMs: 20,
    });
    await withResource(resource, {}, async () => {
      runner.request("change");
    });
    await runner.idle();
    expect(passed).toEqual([false]);
    runner.dispose();
  });
});

describe("a person's rebuild behind a held line (39b review, M2)", () => {
  it("answers busy within the bound, rebuilding nothing", async () => {
    vi.stubEnv("RECIPE_QUEUE_POLL_MS", "10");
    vi.stubEnv("RECIPE_REINDEX_QUEUE_WAIT_MS", "300");
    const dir = await scratchRepo();
    const holder = await acquire(repoResource(dir));
    const before = await readIndexFreshness(dir);
    const started = Date.now();
    const error = await runSpec({
      kind: "reindex",
      contentDirectory: dir,
      trigger: "local",
    }).catch((caught: unknown) => caught);
    const waited = Date.now() - started;
    await holder.release();
    expect(error).toMatchObject({ code: "busy" });
    expect((error as Error).message).toContain("Nothing was rebuilt");
    expect(waited).toBeGreaterThanOrEqual(300);
    expect(waited).toBeLessThan(5_000);
    const job = (error as { job?: string }).job!;
    expect(await readJobMeta(jobsDirectory(), job)).toMatchObject({
      status: "failed",
      error: { code: "busy" },
    });
    const view = await getJobView(job);
    expect(
      view.lines.find(
        (line) => line.step === "queue.wait" && line.phase === "end",
      ),
    ).toMatchObject({ data: expect.objectContaining({ gaveUp: true }) });
    /* Its place in line is gone, and nothing was rebuilt. */
    expect((await queueSnapshot(repoResource(dir))).waiters).toEqual([]);
    expect(await readIndexFreshness(dir)).toEqual(before);
  });
});

describe("a rebuild asked only if stale (39b review, L3)", () => {
  it("skips indexes already built from HEAD by this code, and says so", async () => {
    const dir = await scratchRepo();
    await createLocalBackend({ contentDirectory: dir }).reindex();
    const instance = await runSpec({
      kind: "reindex",
      contentDirectory: dir,
      trigger: "instance",
      reason: "no index version recorded yet",
    });
    expect(instance).toMatchObject({ rebuilt: [], skipped: "fresh" });
    const view = await getJobView(instance.job);
    expect(
      view.lines.find((line) => line.step === "reindex.skip"),
    ).toMatchObject({ msg: expect.stringContaining("already fresh") });
    expect(
      view.lines.some(
        (line) =>
          line.step.startsWith("reindex.") && line.step !== "reindex.skip",
      ),
    ).toBe(false);

    /* The deploy's `?ifStale=1` skips too; a plain API rebuild never does. */
    expect(
      await runSpec({
        kind: "reindex",
        contentDirectory: dir,
        trigger: "api",
        ifStale: true,
      }),
    ).toMatchObject({ skipped: "fresh" });
    const plain = await runSpec({
      kind: "reindex",
      contentDirectory: dir,
      trigger: "api",
    });
    expect(plain.skipped).toBeUndefined();
    expect(plain.rebuilt).toHaveLength(recipeContentTypes.length);
  });

  it("rebuilds when the version or HEAD is stale", async () => {
    const dir = await scratchRepo();
    await createLocalBackend({ contentDirectory: dir }).reindex();
    await writeIndexVersion(dir, "0123456789abcdef");
    const result = await runSpec({
      kind: "reindex",
      contentDirectory: dir,
      trigger: "instance",
    });
    expect(result.skipped).toBeUndefined();
    expect(result.rebuilt).toHaveLength(recipeContentTypes.length);
    expect(await readIndexVersion(dir)).toBe(currentIndexVersion());

    await createRecipe({ contentDirectory: dir }, { name: "Roti" });
    await simpleGit({ baseDir: dir }).commit("Shell commit", ["--allow-empty"]);
    expect(
      (
        await runSpec({
          kind: "reindex",
          contentDirectory: dir,
          trigger: "instance",
        })
      ).skipped,
    ).toBeUndefined();
  });
});

describe("a full rebuild that fails part-way", () => {
  it("writes neither the version nor the HEAD stamp", async () => {
    const dir = await scratchRepo();
    await createLocalBackend({ contentDirectory: dir }).reindex();
    await writeIndexVersion(dir, "0123456789abcdef");
    await simpleGit({ baseDir: dir }).commit("Moved on", ["--allow-empty"]);
    const before = await readIndexFreshness(dir, {
      version: currentIndexVersion(),
    });
    expect(before).toMatchObject({ stale: true, versionStale: true });

    failOn.contentType = recipeContentTypes[1].contentType;
    await expect(reindex({ contentDirectory: dir })).rejects.toThrow(
      "the disk filled up (test)",
    );
    expect(await readIndexVersion(dir)).toBe("0123456789abcdef");
    expect(
      await readIndexFreshness(dir, { version: currentIndexVersion() }),
    ).toEqual(before);

    /* The next full rebuild writes both. */
    failOn.contentType = undefined;
    await reindex({ contentDirectory: dir });
    expect(
      await readIndexFreshness(dir, { version: currentIndexVersion() }),
    ).toMatchObject({ stale: false, versionStale: false });
  });
});
