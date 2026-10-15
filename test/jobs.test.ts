// @vitest-environment node
//
// Epic 37 (37a): the job store, the step log and the registry —
// `editor/controller/jobs/`. Every directory here is a temp dir, removed
// after each test; `fetch` is stubbed where a job would reach the web.

import { spawnSync } from "node:child_process";
import {
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

import { ownPidNamespace } from "@discontent/cms/git/fileLock";
import { ulid } from "@discontent/cms/util/ulid";
import {
  NO_LOG,
  createJobLog,
  formatJobLine,
  memoryJobLog,
  redactLine,
  type JobLine,
} from "../websites/recipe-website/editor/controller/jobs/log";
import { jobsDirectory } from "../websites/recipe-website/editor/controller/jobs/location";
import {
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
  runJob,
  withSurfacedWarnings,
} from "../websites/recipe-website/editor/controller/jobs/run";
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
      async (log) => {
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
      async (log) => {
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
      async (log) => log.step("fetch", () => "page"),
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
      async (log) => {
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
    expect(
      jobsDirectory({
        RECIPE_JOBS_DIR: "rel",
        INIT_CWD: "/caller",
      } as NodeJS.ProcessEnv),
    ).toBe("/caller/rel");
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
