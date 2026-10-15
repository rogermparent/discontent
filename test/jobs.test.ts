// @vitest-environment node
//
// Epic 37 (37a): the job store, the step log and the registry —
// `editor/controller/jobs/`. Every directory here is a temp dir, removed
// after each test; `fetch` is stubbed where a job would reach the web.

import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ownPidNamespace, pidAlive } from "@discontent/cms/git/fileLock";
import { ulid } from "@discontent/cms/util/ulid";
import {
  NO_LOG,
  createJobLog,
  formatJobLine,
  memoryJobLog,
  redactLine,
  type JobLine,
} from "../websites/recipe-website/editor/controller/jobs/log";
import {
  jobsDirectory,
  setJobsRoot,
} from "../websites/recipe-website/editor/controller/jobs/location";
import {
  JOB_STALE_MS,
  findJob,
  listJobs,
  newJobMeta,
  pruneJobs,
  readJobLog,
  readJobMeta,
  sweepJobs,
  updateJobMeta,
  writeJobMeta,
  type JobMeta,
} from "../websites/recipe-website/editor/controller/jobs/store";
import {
  cancelJob,
  runJob,
  runningJobIds,
  withSurfacedWarnings,
} from "../websites/recipe-website/editor/controller/jobs/run";
import { toErrorObject } from "../websites/recipe-website/editor/controller/curation/errors";
import {
  placementWarning,
  sameOllamaModel,
} from "../websites/recipe-website/editor/controller/llm/client";
import { fetchYtdlpMetadata } from "../websites/recipe-website/editor/controller/ytdlp";
import {
  SitePacer,
  SiteState,
  type Pacing,
} from "../websites/recipe-website/editor/controller/curation/sitePacing";
import { jobsShowCommand } from "../websites/recipe-website/editor/cli/commands/jobs";
import {
  JOB_HANDLERS,
  jobLabel,
  jobTier,
  runSpec,
  type JobSpec,
} from "../websites/recipe-website/editor/controller/jobs/kinds";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jobs-test-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

/** A pid that is certainly dead: a child that has already exited and been reaped. */
function deadPid(): number {
  const child = spawnSync("sh", ["-c", "echo $$"]);
  return Number(String(child.stdout).trim());
}

async function logLines(id: string): Promise<JobLine[]> {
  return (await readJobLog(dir, id)).lines;
}

describe("the job store (D1)", () => {
  it("runs a job inline: a meta written whole, a step log, the result", async () => {
    const { job, result } = await runJob(
      { kind: "inspect", label: "example.com/pie", spec: { kind: "inspect" } },
      async ({ log }) => {
        await log.step("fetch", { host: "example.com" }, (step) => {
          step.set({ status: 200, bytes: 1234 });
        });
        log.info("parse", "a Recipe node");
        return { answer: 42 };
      },
      { dir, mirror: null },
    );
    expect(result).toEqual({ answer: 42 });
    const meta = (await readJobMeta(dir, job))!;
    expect(meta).toMatchObject({
      id: job,
      kind: "inspect",
      label: "example.com/pie",
      status: "done",
      tier: "interactive",
      pid: process.pid,
      host: hostname(),
      spec: { kind: "inspect" },
      result: { answer: 42 },
    });
    expect(meta.endedAt).toBeGreaterThanOrEqual(meta.startedAt!);
    /* Atomic writes leave no temp file behind. */
    const names = await readdir(dir);
    expect(names.filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(names).toEqual(
      expect.arrayContaining([`${job}.meta.json`, `${job}.log.jsonl`]),
    );

    const lines = await logLines(job);
    expect(lines.map((line) => `${line.step}:${line.phase}`)).toEqual([
      "job:start",
      "fetch:start",
      "fetch:end",
      "parse:note",
      "job:end",
    ]);
    const fetchEnd = lines[2];
    expect(fetchEnd).toMatchObject({
      ok: true,
      level: "info",
      data: { host: "example.com", status: 200, bytes: 1234 },
    });
    expect(typeof fetchEnd.ms).toBe("number");
    expect(Date.parse(fetchEnd.t)).not.toBeNaN();
  });

  it("records a failure and rethrows it as it was", async () => {
    const error = await runJob(
      { kind: "inspect", label: "x", spec: {} },
      async ({ log }) => {
        await log.step("fetch", async () => {
          throw new Error("connection refused");
        });
      },
      { dir, mirror: null },
    ).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("connection refused");
    const [meta] = await listJobs(dir);
    expect(meta).toMatchObject({
      status: "failed",
      error: { code: "internal", message: "connection refused" },
    });
    const lines = await logLines(meta.id);
    expect(
      lines.find((line) => line.step === "fetch" && line.phase === "end"),
    ).toMatchObject({ ok: false, error: "connection refused", level: "warn" });
    expect(lines.at(-1)).toMatchObject({
      step: "job",
      phase: "end",
      ok: false,
    });
  });

  it("updates a meta by reading and rewriting it whole", async () => {
    const meta = newJobMeta(ulid(), {
      kind: "inspect",
      label: "x",
      spec: { url: "https://example.com" },
    });
    await writeJobMeta(dir, meta);
    await updateJobMeta(dir, meta.id, { status: "running", startedAt: 5 });
    expect(await readJobMeta(dir, meta.id)).toMatchObject({
      status: "running",
      startedAt: 5,
      spec: { url: "https://example.com" },
    });
    expect(
      await updateJobMeta(dir, ulid(), { status: "done" }),
    ).toBeUndefined();
    expect(await readJobMeta(dir, "../../etc/passwd")).toBeUndefined();
  });

  it("finds a job by its full id, the eight characters the lines show, or a unique start", async () => {
    const id = ulid();
    await writeJobMeta(
      dir,
      newJobMeta(id, { kind: "inspect", label: "x", spec: {} }),
    );
    expect((await findJob(dir, id))?.id).toBe(id);
    expect((await findJob(dir, id.slice(-8).toLowerCase()))?.id).toBe(id);
    expect((await findJob(dir, id.slice(0, 12)))?.id).toBe(id);
    expect(await findJob(dir, "ZZZZZZZZ")).toBeUndefined();
  });

  it("reads the log from an offset, leaving a half-written line for later", async () => {
    const id = ulid();
    const log = createJobLog({ id, file: join(dir, `${id}.log.jsonl`) });
    log.info("a", "one");
    const first = await readJobLog(dir, id);
    expect(first.lines.map((line) => line.msg)).toEqual(["one"]);
    log.info("b", "two");
    const second = await readJobLog(dir, id, first.next);
    expect(second.lines.map((line) => line.msg)).toEqual(["two"]);
    await writeFile(join(dir, `${id}.log.jsonl`), '{"t":"x","step":"c"', {
      flag: "a",
    });
    const third = await readJobLog(dir, id, second.next);
    expect(third).toEqual({ lines: [], next: second.next });
  });

  it("keeps the work going when the store cannot be written", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const file = join(dir, "not-a-dir");
    await writeFile(file, "");
    const { job, result } = await runJob(
      { kind: "inspect", label: "x", spec: {} },
      async ({ log }) => log.step("fetch", () => "page"),
      { dir: join(file, "jobs"), mirror: null },
    );
    expect(result).toBe("page");
    expect(job).toMatch(/^[0-9A-Z]{26}$/);
    warn.mockRestore();
  });
});

describe("the boot sweep (D5)", () => {
  async function plant(patch: Partial<JobMeta>): Promise<JobMeta> {
    const meta = {
      ...newJobMeta(ulid(), { kind: "import-url", label: "x", spec: {} }),
      status: "running" as const,
      ...patch,
    };
    await writeJobMeta(dir, meta);
    return meta;
  }

  it("marks a dead process's running and queued jobs interrupted, and nothing else", async () => {
    const pid = deadPid();
    const dead = await plant({ pid, pidns: ownPidNamespace() });
    const deadQueued = await plant({
      pid,
      pidns: ownPidNamespace(),
      status: "queued",
    });
    const mine = await plant({});
    const elsewhere = await plant({ pid, host: "another-host" });
    const container = await plant({ pid, pidns: "pid:[1]" });
    const finished = await plant({
      pid,
      pidns: ownPidNamespace(),
      status: "done",
    });
    const reused = await plant({ nonce: "a previous process" });

    const closed = await sweepJobs(dir);
    expect(closed.sort()).toEqual([dead.id, deadQueued.id, reused.id].sort());
    expect(await readJobMeta(dir, dead.id)).toMatchObject({
      status: "interrupted",
      error: { code: "interrupted" },
    });
    for (const kept of [mine, elsewhere, container]) {
      expect((await readJobMeta(dir, kept.id))?.status).toBe("running");
    }
    expect((await readJobMeta(dir, finished.id))?.status).toBe("done");
    const [note] = await logLines(dead.id);
    expect(note).toMatchObject({ step: "job", phase: "note", level: "warn" });
    expect(note.msg).toMatch(/^interrupted — the process that ran it \(pid/);
  });
});

describe("retention (D1)", () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function plantAt(time: number, status: JobMeta["status"] = "done") {
    const meta = {
      ...newJobMeta(ulid(time), { kind: "inspect", label: "x", spec: {} }),
      status,
    };
    await writeJobMeta(dir, meta);
    await writeFile(join(dir, `${meta.id}.log.jsonl`), "");
    return meta.id;
  }

  it("keeps the newest by count, drops the old by age, never a live job", async () => {
    const now = Date.now();
    const old = await plantAt(now - 20 * DAY);
    const oldLive = await plantAt(now - 20 * DAY - 1, "running");
    const ids = [];
    for (let i = 5; i >= 1; i -= 1) ids.push(await plantAt(now - i * 1000));
    const removed = await pruneJobs(dir, { now, count: 3, force: true });
    /* The two oldest of the five by count, and the one past 14 days. */
    expect(removed.sort()).toEqual([old, ids[0], ids[1]].sort());
    const left = (await listJobs(dir)).map((meta) => meta.id).sort();
    expect(left).toEqual([oldLive, ...ids.slice(2)].sort());
    const names = await readdir(dir);
    expect(names).not.toContain(`${old}.log.jsonl`);
  });

  it("runs at most once an hour per directory", async () => {
    const now = Date.now();
    await plantAt(now - 20 * DAY);
    expect(await pruneJobs(dir, { now })).toHaveLength(1);
    await plantAt(now - 20 * DAY);
    expect(await pruneJobs(dir, { now: now + 60_000 })).toEqual([]);
    expect(await pruneJobs(dir, { now: now + 61 * 60_000 })).toHaveLength(1);
  });

  it("clears an orphan log and a stale temp file", async () => {
    const now = Date.now();
    const orphan = join(dir, `${ulid(now - 20 * DAY)}.log.jsonl`);
    const temp = join(dir, `.x.meta.json.${ulid()}.1.tmp`);
    await writeFile(orphan, "");
    await writeFile(temp, "");
    const then = new Date(now - 20 * DAY);
    await utimes(orphan, then, then);
    await utimes(temp, then, then);
    await pruneJobs(dir, { now, force: true });
    expect(await readdir(dir)).toEqual([".prune-stamp"]);
  });
});

describe("the step log (D2)", () => {
  it("redacts in one place: long text, secrets, credentials, long messages", () => {
    vi.stubEnv("RECIPE_API_TOKEN", "rcp_supersecretvalue123");
    const page = "x".repeat(5000);
    const line = redactLine({
      t: "2026-10-15T00:00:00.000Z",
      step: "fetch",
      phase: "end",
      level: "warn",
      ok: false,
      msg: "m".repeat(500),
      error: `failed at https://user:hunter2@example.com/ with rcp_supersecretvalue123 ${"e".repeat(400)}`,
      data: {
        text: page,
        short: "kept",
        outputTokens: 412,
        apiToken: "x",
        token: "anything",
        authorization: "Bearer abc",
        nested: { url: "https://u:p@example.com/x", list: Array(30).fill(1) },
      },
    });
    expect(line.msg).toHaveLength(200);
    expect(line.error!.length).toBeLessThanOrEqual(200);
    expect(line.error).not.toContain("hunter2");
    expect(line.error).not.toContain("rcp_supersecretvalue123");
    expect(line.error).toContain("[redacted]");
    expect(line.data!.text).toMatch(
      /^\[text 5000 chars sha256:[0-9a-f]{12}\]$/,
    );
    expect(line.data!.short).toBe("kept");
    /* Counts are not secrets: only a field whose name ends like one is. */
    expect(line.data!.outputTokens).toBe(412);
    expect(line.data!.apiToken).toBe("[redacted]");
    expect(line.data!.token).toBe("[redacted]");
    expect(line.data!.authorization).toBe("[redacted]");
    const nested = line.data!.nested as { url: string; list: unknown[] };
    expect(nested.url).toBe("https://example.com/x");
    expect(nested.list).toHaveLength(21);
    expect(nested.list.at(-1)).toBe("… 10 more");
    expect(JSON.stringify(line)).not.toContain("xxxxxxxxxx");
  });

  it("redacts what is written and mirrored, not just what it is handed", async () => {
    const id = ulid();
    const mirrored: string[] = [];
    const log = createJobLog({
      id,
      file: join(dir, `${id}.log.jsonl`),
      mirror: (text) => mirrored.push(text),
    });
    await log.step(
      "llm.extract",
      { name: "Stuffing", text: "y".repeat(300) },
      () => {},
    );
    const raw = await readFile(join(dir, `${id}.log.jsonl`), "utf8");
    expect(raw).not.toContain("yyyyyyyyyy");
    expect(raw).toContain("[text 300 chars sha256:");
    expect(mirrored.join("\n")).not.toContain("yyyyyyyyyy");
  });

  it("lets a step add to its own end line, or fail without throwing", async () => {
    const { log, lines } = memoryJobLog();
    const value = await log.step("ytdlp", { comments: true }, (step) => {
      step.set({ exit: 1 });
      step.fail("yt-dlp said no");
      return "kept";
    });
    expect(value).toBe("kept");
    expect(lines[1]).toMatchObject({
      phase: "end",
      ok: false,
      error: "yt-dlp said no",
      data: { comments: true, exit: 1 },
    });
  });

  it("mirrors one bracketed line per line, the D2 way", () => {
    const id = "01JA0000000000000004V2Q9K7";
    const end: JobLine = {
      t: "2026-10-15T00:00:00.000Z",
      step: "llm.extract",
      phase: "end",
      level: "info",
      ms: 11_300,
      ok: true,
      data: {
        part: "2/4",
        name: "Stuffing",
        grounded: 13,
        total: 13,
        outputTokens: 412,
        tokPerSec: 37.2,
        gpu: 100,
      },
    };
    expect(formatJobLine(id, end)).toBe(
      '[job 04V2Q9K7] llm.extract 2/4 "Stuffing" 13/13 grounded · 11.3 s · 412 tok @ 37 tok/s · GPU',
    );
    expect(
      formatJobLine(id, { ...end, data: { ...end.data, gpu: 2 } }),
    ).toMatch(/· 2% GPU$/);
    expect(
      formatJobLine(id, {
        t: end.t,
        step: "llm.placement",
        phase: "note",
        level: "warn",
        msg: '2% GPU — another program holds VRAM; run "ollama stop qwen3:8b" once it frees',
      }),
    ).toBe(
      '[job 04V2Q9K7] llm.placement warn: 2% GPU — another program holds VRAM; run "ollama stop qwen3:8b" once it frees',
    );
    expect(
      formatJobLine(id, {
        t: end.t,
        step: "fetch",
        phase: "start",
        level: "info",
        data: { host: "www.example.com" },
      }),
    ).toBe("[job 04V2Q9K7] fetch www.example.com …");
  });

  it("the no-op log runs every step and writes nothing", async () => {
    expect(NO_LOG.live).toBe(false);
    expect(await NO_LOG.step("fetch", { host: "x" }, () => 7)).toBe(7);
    expect(
      await NO_LOG.step("parse", async (step) => step.log === NO_LOG),
    ).toBe(true);
    NO_LOG.surface("ignored");
    expect(NO_LOG.surfaced).toEqual([]);
  });

  it("merges surfaced warnings into the result once each", async () => {
    expect(withSurfacedWarnings({ warnings: ["a"] }, ["b", "a"])).toEqual({
      warnings: ["a", "b"],
    });
    expect(withSurfacedWarnings({ x: 1 }, [])).toEqual({ x: 1 });
    const { result } = await runJob(
      { kind: "inspect", label: "x", spec: {} },
      async ({ log }) => {
        log.surface("the GPU is busy");
        log.surface("the GPU is busy");
        return { recipe: true };
      },
      { dir, mirror: null },
    );
    expect(result).toEqual({ recipe: true, warnings: ["the GPU is busy"] });
  });
});

describe("where the store lives (D1)", () => {
  it("is RECIPE_JOBS_DIR, else a temp dir under a test runner, else test-jobs/jobs", () => {
    expect(
      jobsDirectory({ RECIPE_JOBS_DIR: "/abs/jobs" } as NodeJS.ProcessEnv),
    ).toBe("/abs/jobs");
    /*
     * A relative value is the editor package's, whoever reads it (37b
     * review): never the caller's INIT_CWD, so the editor and the CLI
     * reading one `editor/.env` share one store.
     */
    setJobsRoot("/editor");
    try {
      expect(
        jobsDirectory({
          RECIPE_JOBS_DIR: "rel",
          INIT_CWD: "/caller",
        } as NodeJS.ProcessEnv),
      ).toBe("/editor/rel");
    } finally {
      setJobsRoot(undefined);
    }
    expect(jobsDirectory({ VITEST: "true" } as NodeJS.ProcessEnv)).toBe(
      join(tmpdir(), "discontent-jobs-vitest"),
    );
    expect(jobsDirectory({ TEST_MODE: "1" } as NodeJS.ProcessEnv)).toMatch(
      /\/test-jobs$/,
    );
    expect(jobsDirectory({} as NodeJS.ProcessEnv)).toMatch(/\/jobs$/);
    /* This suite never touches the editor's own. */
    expect(process.env.RECIPE_JOBS_DIR).toContain(tmpdir());
  });
});

describe("the registry", () => {
  const PAGE = `<html><head><title>Apple pie</title>
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Apple pie",
    recipeIngredient: ["6 apples", "1 crust"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Bake it." }],
  })}</script></head><body></body></html>`;

  it("has a handler for every kind, a label and a tier", () => {
    expect(Object.keys(JOB_HANDLERS).sort()).toEqual(
      [
        "form-text",
        "form-url",
        "import-list",
        "import-text",
        "import-url",
        "inspect",
        "inspect-list",
      ].sort(),
    );
    expect(
      jobLabel({
        kind: "import-text",
        contentDirectory: "/c",
        text: "abc",
        source: "https://www.youtube.com/watch?v=Z8J2HgaaSgQ",
        options: {},
      }),
    ).toBe("pasted text (3 chars, from youtube.com/watch?v=Z8J2HgaaSgQ)");
    expect(
      jobTier({
        kind: "import-url",
        contentDirectory: "/c",
        url: "https://x.test/",
        options: { all: true },
      }),
    ).toBe("batch");
    expect(
      jobTier({
        kind: "import-list",
        contentDirectory: "/c",
        url: "u",
        options: {},
      }),
    ).toBe("batch");
    expect(jobTier({ kind: "inspect", url: "u" })).toBe("interactive");
  });

  it("runs a spec, stores it as JSON, and replays it from the meta (37c's Retry)", async () => {
    vi.stubEnv("RECIPE_JOBS_DIR", dir);
    vi.stubEnv("RECIPE_LLM_URL", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(PAGE, { status: 200 })),
    );
    const spec: JobSpec = { kind: "inspect", url: "https://pies.test/apple" };
    const first = await runSpec(spec, { mirror: null });
    expect(first.job).toMatch(/^[0-9A-Z]{26}$/);
    expect(first.recipe?.name).toBe("Apple pie");

    const meta = (await readJobMeta(dir, first.job))!;
    expect(meta.kind).toBe("inspect");
    expect(meta.spec).toEqual(spec);
    expect(meta.resources).toEqual(["gpu", "ytdlp", "site"]);
    expect((meta.result as { job?: string }).job).toBeUndefined();

    const replay = await runSpec(
      JSON.parse(JSON.stringify(meta.spec)) as JobSpec,
      { mirror: null },
    );
    expect(replay.job).not.toBe(first.job);
    const { job: _a, ...a } = first;
    const { job: _b, ...b } = replay;
    expect(b).toEqual(a);

    const steps = (await logLines(first.job)).map(
      (line) => `${line.step}:${line.phase}`,
    );
    expect(steps).toEqual([
      "job:start",
      "fetch:start",
      "fetch:end",
      "parse:start",
      "parse:end",
      "llm:note",
      "job:end",
    ]);
    const parseEnd = (await logLines(first.job)).find(
      (line) => line.step === "parse" && line.phase === "end",
    );
    expect(parseEnd?.data).toMatchObject({
      schema: true,
      ingredients: 2,
      steps: 1,
    });
  });
});

/* ------------------------------------------------------------------ */
/* 37a review                                                          */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("retention in a long-lived process (37a review)", () => {
  it("prunes again on a job an hour after the last prune", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const plantOld = async () => {
      const meta = {
        ...newJobMeta(ulid(Date.now() - 20 * DAY), {
          kind: "inspect",
          label: "old",
          spec: {},
        }),
        status: "done" as const,
      };
      await writeJobMeta(dir, meta);
      return meta.id;
    };
    const quick = () =>
      runJob({ kind: "inspect", label: "x", spec: {} }, async () => 1, {
        dir,
        mirror: null,
      });
    const first = await plantOld();
    await quick();
    expect(await readJobMeta(dir, first)).toBeUndefined();
    /* Within the hour: the stamp holds it back. */
    const second = await plantOld();
    await quick();
    expect(await readJobMeta(dir, second)).toBeDefined();
    /* An hour on (the stamp aged): the next job prunes. */
    const hourAgo = new Date(Date.now() - 61 * 60 * 1000);
    await utimes(join(dir, ".prune-stamp"), hourAgo, hourAgo);
    await quick();
    expect(await readJobMeta(dir, second)).toBeUndefined();
  });
});

describe("the heartbeat (37a review)", () => {
  async function plant(patch: Partial<JobMeta>): Promise<JobMeta> {
    const meta = {
      ...newJobMeta(ulid(), { kind: "import-url", label: "x", spec: {} }),
      status: "running" as const,
      ...patch,
    };
    await writeJobMeta(dir, meta);
    return meta;
  }

  it("refreshes updatedAt at each step boundary while the job runs", async () => {
    await runJob(
      { kind: "inspect", label: "x", spec: {} },
      async ({ log, jobId }) => {
        const started = (await readJobMeta(dir, jobId!))!.updatedAt!;
        await sleep(20);
        /* The timer is 30 s away: only the step can have moved it. */
        await log.step("fetch", () => undefined);
        await vi.waitFor(async () => {
          const now = (await readJobMeta(dir, jobId!))!.updatedAt!;
          expect(now).toBeGreaterThanOrEqual(started + 20);
        });
      },
      { dir, mirror: null },
    );
  });

  it("beats on its timer too", async () => {
    await runJob(
      { kind: "inspect", label: "x", spec: {} },
      async ({ jobId }) => {
        const started = (await readJobMeta(dir, jobId!))!.updatedAt!;
        await vi.waitFor(
          async () => {
            expect(
              (await readJobMeta(dir, jobId!))!.updatedAt!,
            ).toBeGreaterThan(started);
          },
          { timeout: 5_000, interval: 20 },
        );
      },
      { dir, mirror: null, heartbeatMs: 15 },
    );
  });

  it("sweeps a job it cannot judge once its heartbeat is stale, not before", async () => {
    const now = Date.now();
    const quietHost = await plant({
      host: "another-host",
      updatedAt: now - JOB_STALE_MS - 1_000,
    });
    const quietContainer = await plant({
      pidns: "pid:[1]",
      updatedAt: now - JOB_STALE_MS - 1_000,
    });
    const liveHost = await plant({
      host: "another-host",
      updatedAt: now - 60_000,
    });
    const closed = await sweepJobs(dir, now);
    expect(closed.sort()).toEqual([quietHost.id, quietContainer.id].sort());
    expect(await readJobMeta(dir, quietHost.id)).toMatchObject({
      status: "interrupted",
      error: { code: "interrupted" },
    });
    expect((await readJobMeta(dir, quietHost.id))?.error?.message).toMatch(
      /no sign of life from its process .* for 1[01] min/,
    );
    expect((await readJobMeta(dir, liveHost.id))?.status).toBe("running");
  });

  it("drops a live job it cannot judge once its heartbeat is past the retention age", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const lost = await plant({
      id: ulid(now - 20 * DAY),
      host: "another-host",
      updatedAt: now - 20 * DAY,
    });
    const mineOld = await plant({
      id: ulid(now - 20 * DAY),
      updatedAt: now - 20 * DAY,
    });
    const quietButRecent = await plant({
      id: ulid(now - 20 * DAY),
      host: "another-host",
      updatedAt: now - DAY,
    });
    const removed = await pruneJobs(dir, { now, force: true });
    expect(removed).toEqual([lost.id]);
    /* This process is alive, and a recent heartbeat may still be running. */
    expect(await readJobMeta(dir, mineOld.id)).toBeDefined();
    expect(await readJobMeta(dir, quietButRecent.id)).toBeDefined();
  });

  it("keeps sweeping past a meta it cannot write", async () => {
    const pid = deadPid();
    const first = await plant({ pid, pidns: ownPidNamespace() });
    const second = await plant({ pid, pidns: ownPidNamespace() });
    /* The first's next write fails (its write chain, as a full disk would). */
    const chains = ((
      globalThis as {
        __discontentJobMetaChains?: Map<string, Promise<unknown>>;
      }
    ).__discontentJobMetaChains ??= new Map());
    const failed = Promise.reject(new Error("disk full"));
    failed.catch(() => undefined);
    chains.set(join(dir, `${first.id}.meta.json`), failed);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const closed = await sweepJobs(dir);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`could not close ${first.id}: disk full`),
    );
    warn.mockRestore();
    expect(closed).toEqual([second.id]);
    expect((await readJobMeta(dir, second.id))?.status).toBe("interrupted");
    expect((await readJobMeta(dir, first.id))?.status).toBe("running");
  });

  it("serialises updates to one meta: none is lost", async () => {
    const meta = newJobMeta(ulid(), { kind: "inspect", label: "x", spec: {} });
    await writeJobMeta(dir, { ...meta, result: { count: 0 } });
    await Promise.all(
      Array.from({ length: 20 }, () =>
        updateJobMeta(dir, meta.id, (current) => ({
          result: { count: (current.result as { count: number }).count + 1 },
        })),
      ),
    );
    expect((await readJobMeta(dir, meta.id))?.result).toEqual({ count: 20 });
  });
});

describe("failures (37a review)", () => {
  const LLM = "http://model.test:11434";
  const TEXT = [
    "Pancakes",
    "1 cup flour",
    "1 egg",
    "1 cup milk",
    "Whisk everything and fry.",
  ].join("\n");

  it("a failed job's error carries its surfaced warnings: a CPU-bound model's timeout says 2%", async () => {
    vi.stubEnv("RECIPE_JOBS_DIR", dir);
    vi.stubEnv("RECIPE_LLM_URL", LLM);
    vi.stubEnv("RECIPE_LLM_MODEL", "qwen3:8b");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        if (String(input).endsWith("/api/ps")) {
          return Response.json({
            models: [
              { name: "qwen3:8b", model: "qwen3:8b", size: 100, size_vram: 2 },
            ],
          });
        }
        /* The chat call: Ollama never answered within the timeout. */
        throw Object.assign(new Error("The operation timed out."), {
          name: "TimeoutError",
        });
      }),
    );
    const error = await runSpec(
      {
        kind: "import-text",
        contentDirectory: join(dir, "no-corpus"),
        text: TEXT,
        options: { dryRun: true },
      },
      { mirror: null },
    ).catch((caught) => caught);
    const warning = placementWarning("qwen3:8b", 2);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/did not answer within/);
    const object = toErrorObject(error);
    expect(object.error.code).toBe("import_failed");
    expect(object.error.warnings).toEqual([warning]);
    const [meta] = await listJobs(dir);
    expect(meta.status).toBe("failed");
    expect(meta.error?.warnings).toEqual([warning]);
  });

  it("a form import that answers a message and no recipe is a failed job, and the form still gets its state", async () => {
    vi.stubEnv("RECIPE_JOBS_DIR", dir);
    vi.stubEnv("RECIPE_LLM_URL", "");
    const state = await runSpec(
      { kind: "form-text", text: TEXT },
      { mirror: null },
    );
    expect(state.message).toBe("no local model configured (RECIPE_LLM_URL)");
    expect(state.recipe).toBeUndefined();
    const meta = (await readJobMeta(dir, state.job))!;
    expect(meta).toMatchObject({
      status: "failed",
      error: {
        code: "import_failed",
        message: "no local model configured (RECIPE_LLM_URL)",
      },
      result: { message: "no local model configured (RECIPE_LLM_URL)" },
    });
    expect((await logLines(state.job)).at(-1)).toMatchObject({
      step: "job",
      phase: "end",
      ok: false,
      error: "no local model configured (RECIPE_LLM_URL)",
    });
  });

  it("attaches the warnings to a copy, never the thrown object itself", async () => {
    const shared = new Error("aborted for everyone");
    const caught = await runJob(
      { kind: "inspect", label: "x", spec: {} },
      async ({ log }) => {
        log.surface("the GPU is busy");
        throw shared;
      },
      { dir, mirror: null },
    ).catch((error) => error);
    expect(caught).not.toBe(shared);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("aborted for everyone");
    expect(toErrorObject(caught).error.warnings).toEqual(["the GPU is busy"]);
    expect("warnings" in shared).toBe(false);
  });

  it("records an error's message through the log's redaction", async () => {
    vi.stubEnv("RECIPE_API_TOKEN", "rcp_supersecretvalue123");
    await runJob(
      { kind: "inspect", label: "x", spec: {} },
      async () => {
        throw new Error(
          `refused rcp_supersecretvalue123 at https://u:hunter2@example.com/ ${"e".repeat(400)}`,
        );
      },
      { dir, mirror: null },
    ).catch(() => undefined);
    const [meta] = await listJobs(dir);
    expect(meta.error?.message).toContain("[redacted]");
    expect(meta.error?.message).not.toContain("rcp_supersecretvalue123");
    expect(meta.error?.message).not.toContain("hunter2");
    expect(meta.error!.message.length).toBeLessThanOrEqual(200);
  });
});

describe("the job context (37a review)", () => {
  it("hands the work one context: its log, signal, tier and id", async () => {
    const { job } = await runJob(
      { kind: "import-list", label: "x", spec: {}, tier: "batch" },
      async (context) => {
        expect(context.log.live).toBe(true);
        expect(context.signal?.aborted).toBe(false);
        expect(context.tier).toBe("batch");
        expect(context.jobId).toBe(context.log.jobId);
        expect(runningJobIds()).toContain(context.jobId);
        return "ok";
      },
      { dir, mirror: null },
    );
    expect(runningJobIds()).not.toContain(job);
    expect(cancelJob(job)).toBe(false);
  });

  it("cancels a running job by its id: the work sees the abort, the job ends cancelled", async () => {
    const pending = runJob(
      { kind: "inspect", label: "x", spec: {} },
      ({ signal }) =>
        new Promise((_, reject) => {
          signal!.addEventListener("abort", () => reject(signal!.reason));
        }),
      { dir, mirror: null },
    );
    await vi.waitFor(() => expect(runningJobIds()).toHaveLength(1));
    const [id] = runningJobIds();
    expect(cancelJob(id, new Error("stop it"))).toBe(true);
    await expect(pending).rejects.toThrow("stop it");
    expect(await readJobMeta(dir, id)).toMatchObject({
      status: "cancelled",
      error: { code: "cancelled", message: "stop it" },
    });
  });

  it("ends cancelled when its signal was aborted, even if the work came back", async () => {
    const { job, result } = await runJob(
      { kind: "inspect", label: "x", spec: {} },
      async ({ jobId }) => {
        cancelJob(jobId!, new Error("too late"));
        return "came back";
      },
      { dir, mirror: null },
    );
    expect(result).toBe("came back");
    expect(await readJobMeta(dir, job)).toMatchObject({
      status: "cancelled",
      error: { code: "cancelled", message: "too late" },
    });
  });

  it("a cancel during a 403's retry drops no site — in the gap or the retry's fetch", async () => {
    for (const gapMs of [15_000, 0]) {
      const state = new SiteState();
      const pacing: Pacing = {
        now: () => Date.now(),
        /* The gap never ends by itself: only the abort ends it. */
        sleep: () => new Promise(() => {}),
        gapMs,
        state,
      };
      const controller = new AbortController();
      const pacer = new SitePacer(pacing, { signal: controller.signal });
      const url = "https://www.example.com/pie";
      const pending = pacer.request(url, async (retry) => {
        /* The first request answered 403: the retry's gap, then its fetch. */
        const gap = retry.beforeRetry!();
        if (gapMs > 0) {
          controller.abort(new Error("cancelled in the gap"));
          await gap;
        }
        await gap;
        controller.abort(new Error("cancelled in the retry"));
        throw controller.signal.reason;
      });
      await expect(pending).rejects.toThrow(/cancelled in the/);
      expect(pacer.droppedReason(url)).toBeUndefined();
      expect(state.droppedUntil.size).toBe(0);
    }
  });

  it("an outside signal reaches the page fetch", async () => {
    vi.stubEnv("RECIPE_JOBS_DIR", dir);
    vi.stubEnv("RECIPE_LLM_URL", "");
    const seen: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: string | URL, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            seen.push(init?.signal);
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal!.reason),
            );
          }),
      ),
    );
    const outside = new AbortController();
    const pending = runSpec(
      { kind: "inspect", url: "https://pies.test/apple" },
      { mirror: null, signal: outside.signal },
    );
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    outside.abort(new Error("the request went away"));
    await expect(pending).rejects.toThrow("the request went away");
    expect(seen[0]?.aborted).toBe(true);
    const [meta] = await listJobs(dir);
    expect(meta.status).toBe("cancelled");
  });

  it("kills yt-dlp's child when the job is aborted", async () => {
    const pidFile = join(dir, "ytdlp.pid");
    const script = join(dir, "fake-yt-dlp");
    /* `exec`: the shell becomes the sleep, so its pid is the child's. */
    await writeFile(script, `#!/bin/sh\necho $$ > "$PIDFILE"\nexec sleep 30\n`);
    await chmod(script, 0o755);
    vi.stubEnv("YTDLP_PATH", script);
    vi.stubEnv("PIDFILE", pidFile);
    const controller = new AbortController();
    const pending = fetchYtdlpMetadata("https://www.youtube.com/watch?v=x", {
      job: { signal: controller.signal },
    });
    let pid = 0;
    await vi.waitFor(
      async () => {
        pid = Number((await readFile(pidFile, "utf8")).trim());
        expect(pid).toBeGreaterThan(0);
      },
      { timeout: 10_000, interval: 25 },
    );
    expect(pidAlive(pid)).toBe(true);
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
    await vi.waitFor(() => expect(pidAlive(pid)).toBe(false), {
      timeout: 10_000,
      interval: 25,
    });
  });
});

describe("the step log, review round (37a review)", () => {
  it("numbers each step and names its parent, so concurrent same-name steps pair", async () => {
    const { log, lines } = memoryJobLog();
    await log.step("job", async ({ log: inner }) => {
      await Promise.all(
        ["a", "b"].map((name) =>
          inner.step("llm.extract", { name }, async () => {
            await sleep(name === "a" ? 20 : 5);
            inner.info("ground", name);
          }),
        ),
      );
    });
    const job = lines.find((line) => line.step === "job")!;
    expect(job).toMatchObject({ n: 1 });
    expect(job.parent).toBeUndefined();
    const starts = lines.filter(
      (line) => line.step === "llm.extract" && line.phase === "start",
    );
    expect(starts.map((line) => [line.n, line.parent])).toEqual([
      [2, 1],
      [3, 1],
    ]);
    /* b ends first; its end line still names its own n. */
    const ends = lines.filter(
      (line) => line.step === "llm.extract" && line.phase === "end",
    );
    expect(ends.map((line) => [line.data?.name, line.n])).toEqual([
      ["b", 3],
      ["a", 2],
    ]);
    const notes = lines.filter((line) => line.step === "ground");
    expect(notes.map((line) => [line.msg, line.parent])).toEqual([
      ["b", 3],
      ["a", 2],
    ]);
  });

  it("reads the log from any offset a query string can carry", async () => {
    const id = ulid();
    const log = createJobLog({ id, file: join(dir, `${id}.log.jsonl`) });
    log.info("a", "one");
    log.info("b", "two");
    const all = await readJobLog(dir, id);
    for (const from of [Number.NaN, -5, Number.NEGATIVE_INFINITY]) {
      expect(await readJobLog(dir, id, from)).toEqual(all);
    }
    const first = await readJobLog(dir, id, 0);
    const lineLength =
      (await readFile(join(dir, `${id}.log.jsonl`), "utf8")).split("\n")[0]
        .length + 1;
    const second = await readJobLog(dir, id, lineLength + 0.7);
    expect(second.lines.map((line) => line.msg)).toEqual(["two"]);
    expect(second.next).toBe(first.next);
    expect(Number.isInteger(second.next)).toBe(true);
  });

  it("keeps one surfaced warning per kind, the latest", () => {
    const { log } = memoryJobLog();
    log.surface(placementWarning("qwen3:8b", 2), "llm.placement");
    log.surface("something else");
    log.surface(placementWarning("qwen3:8b", 3), "llm.placement");
    expect(log.surfaced).toEqual([
      placementWarning("qwen3:8b", 3),
      "something else",
    ]);
  });

  it("matches a model name the way Ollama resolves it", () => {
    expect(sameOllamaModel("qwen3:latest", "qwen3")).toBe(true);
    expect(sameOllamaModel("qwen3", "qwen3:latest")).toBe(true);
    expect(sameOllamaModel("qwen3:8b", "qwen3:8b")).toBe(true);
    expect(sameOllamaModel("qwen3:8b", "qwen3")).toBe(false);
    expect(sameOllamaModel("host:5000/qwen3", "host:5000/qwen3:latest")).toBe(
      true,
    );
    expect(sameOllamaModel(undefined, "qwen3")).toBe(false);
  });

  it("builds a mirrored line from its parts, whatever the label holds", () => {
    expect(
      formatJobLine("01JA0000000000000004V2Q9K7", {
        t: "2026-10-15T00:00:00.000Z",
        step: "job",
        phase: "end",
        level: "info",
        ms: 1_000,
        ok: true,
        data: { kind: "inspect", label: "a · b" },
      }),
    ).toBe('[job 04V2Q9K7] job inspect "a · b" 1.0 s');
  });
});

describe("recipes jobs show (37a review)", () => {
  it("answers job as the id, as every result does, and the record under meta", async () => {
    vi.stubEnv("RECIPE_JOBS_DIR", dir);
    const { job } = await runJob(
      { kind: "inspect", label: "x", spec: {} },
      async ({ log }) => log.step("fetch", () => 1),
      { dir, mirror: null },
    );
    const shown = await jobsShowCommand.run({
      backend: { kind: "local" },
      positionals: [job.slice(-8)],
    } as unknown as Parameters<typeof jobsShowCommand.run>[0]);
    expect(shown.job).toBe(job);
    expect(shown.meta).toMatchObject({ id: job, status: "done" });
    expect(shown.steps.map((line) => line.step)).toEqual([
      "job",
      "fetch",
      "fetch",
      "job",
    ]);
  });
});
