// @vitest-environment node
//
// Epic 37, 37c: the job surfaces — the API routes (`/api/jobs`,
// `/api/jobs/<id>?from=`, cancel, retry), the HTTP backend over them, the
// CLI's `jobs list | log | cancel | retry`, MCP `job_list` / `job_get`, and
// the `cancelled` error code end to end. Every job dir is a temp dir; the
// curation context is mocked (no Next, no token); no network, no model.

import { spawn, spawnSync } from "node:child_process";
import { appendFile, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";

import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  CancelledError,
  ForbiddenError,
  UnauthenticatedError,
  toErrorObject,
} from "../websites/recipe-website/editor/controller/curation/errors";
import { errorResponse } from "../websites/recipe-website/editor/controller/curation/http";
import {
  retrySpecFor,
  runSpec,
  type JobSpec,
} from "../websites/recipe-website/editor/controller/jobs/kinds";
import {
  cancelJob,
  runJob,
  startJob,
} from "../websites/recipe-website/editor/controller/jobs/run";
import {
  LIVE_STATUSES,
  newJobMeta,
  readJobMeta,
  writeJobMeta,
  type JobMeta,
} from "../websites/recipe-website/editor/controller/jobs/store";
import {
  buildStepTree,
  resultRows,
} from "../websites/recipe-website/editor/controller/jobs/timeline";
import {
  parseFrom,
  summarizeSpec,
} from "../websites/recipe-website/editor/controller/jobs/views";
import { createHttpBackend } from "../websites/recipe-website/editor/cli/backend/http";
import { createLocalBackend } from "../websites/recipe-website/editor/cli/backend/local";
import { main } from "../websites/recipe-website/editor/cli/index";
import { createRecipeServer } from "../websites/recipe-website/editor/mcp/registry";

let ctx: CurationContext;
let authed = true;
let readOnly = false;
vi.mock("recipe-editor/controller/apiContext", () => ({
  requireCurationContext: async (
    _request: Request,
    { need = "write" }: { need?: "read" | "write" } = {},
  ) => {
    if (!authed) throw new UnauthenticatedError();
    if (need === "write" && readOnly) throw new ForbiddenError();
    return ctx;
  },
}));

/*
 * `after()` outside Next (37c review): the retry route hands it the new
 * job's outcome; here each task is kept, so a test can see it was handed
 * over and await it.
 */
const { afterTasks } = vi.hoisted(() => ({
  afterTasks: [] as Promise<unknown>[],
}));
vi.mock("next/server", () => ({
  after: (task: unknown) => {
    afterTasks.push(
      typeof task === "function"
        ? Promise.resolve().then(task as () => unknown)
        : (task as Promise<unknown>),
    );
  },
}));

const listRoute =
  await import("../websites/recipe-website/editor/src/app/api/jobs/route");
const jobRoute =
  await import("../websites/recipe-website/editor/src/app/api/jobs/[id]/route");
const cancelRoute =
  await import("../websites/recipe-website/editor/src/app/api/jobs/[id]/cancel/route");
const retryRoute =
  await import("../websites/recipe-website/editor/src/app/api/jobs/[id]/retry/route");
const importRoute =
  await import("../websites/recipe-website/editor/src/app/api/import/route");

let dir: string;
let contentDirectory: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "job-surfaces-"));
  contentDirectory = await mkdtemp(join(tmpdir(), "job-surfaces-content-"));
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  /* No model: a pasted-text form import fails at once, as a state. */
  vi.stubEnv("RECIPE_LLM_URL", "");
  ctx = {
    contentDirectory,
    author: { name: "cook@test.local", email: "cook@test.local" },
  };
  authed = true;
  readOnly = false;
  afterTasks.length = 0;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
  await rm(contentDirectory, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function get(path: string): Request {
  return new Request(`http://editor.test${path}`);
}

function post(path: string): Request {
  return new Request(`http://editor.test${path}`, { method: "POST" });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** A job that has ended, with a step and a note. */
async function finishedJob(
  kind = "inspect",
  label = "a page",
): Promise<string> {
  const { job } = await runJob(
    { kind, label, spec: { kind: "inspect", url: "https://example.com/x" } },
    async ({ log }) => {
      await log.step("fetch", { host: "example.com" }, async (step) => {
        step.set({ status: 200, bytes: 2048 });
      });
      log.info("parse", "schema found");
      return { ok: true };
    },
    { dir, mirror: null },
  );
  return job;
}

/** A job this process runs until `release()` (or a cancel). */
async function runningJob(): Promise<{
  job: string;
  release: () => void;
  done: Promise<unknown>;
}> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = await startJob(
    {
      kind: "inspect",
      label: "slow page",
      spec: { kind: "inspect", url: "https://example.com/slow" },
    },
    async ({ log, signal }) => {
      await log.step("fetch", { host: "example.com" }, async () => {
        await new Promise<void>((resolve, reject) => {
          void gate.then(resolve);
          signal?.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      });
      return { ok: true };
    },
    { dir, mirror: null },
  );
  const done = started.done.catch((error: unknown) => error);
  return { job: started.job, release, done };
}

/** Plant a record, as another process (or another checkout) left it. */
async function plant(
  patch: Partial<JobMeta> & { spec: unknown },
): Promise<JobMeta> {
  const { ulid } = await import("@discontent/cms/util/ulid");
  const id = ulid();
  const meta: JobMeta = {
    ...newJobMeta(id, {
      kind: (patch.spec as { kind: string }).kind,
      label: "planted",
      spec: patch.spec,
    }),
    status: "done",
    startedAt: Date.now() - 1_000,
    endedAt: Date.now(),
    ...patch,
  };
  await writeJobMeta(dir, meta);
  return meta;
}

async function settled(id: string): Promise<JobMeta> {
  let meta: JobMeta | undefined;
  await vi.waitFor(
    async () => {
      meta = await readJobMeta(dir, id);
      expect(meta && !LIVE_STATUSES.includes(meta.status)).toBe(true);
    },
    { timeout: 5_000, interval: 25 },
  );
  return meta!;
}

/* ------------------------------------------------------------------ */
/* GET /api/jobs                                                       */
/* ------------------------------------------------------------------ */

describe("GET /api/jobs", () => {
  it("needs curation auth", async () => {
    authed = false;
    const response = await listRoute.GET(get("/api/jobs"));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("unauthenticated");
  });

  it("lists newest first, filtered by status and kind, with a limit", async () => {
    const first = await finishedJob("inspect", "first");
    const second = await finishedJob("form-url", "second");
    const failed = await plant({
      spec: { kind: "import-url", url: "https://example.com/z" },
      kind: "import-url",
      status: "failed",
      error: { code: "import_failed", message: "no page" },
    });

    const all = await (await listRoute.GET(get("/api/jobs"))).json();
    expect(all.jobs.map((job: { id: string }) => job.id)).toEqual([
      failed.id,
      second,
      first,
    ]);
    expect(all).toMatchObject({ total: 3, more: false });
    /* Rows are small: no spec, no result. */
    expect(all.jobs[1]).not.toHaveProperty("spec");
    expect(all.jobs[1]).not.toHaveProperty("result");
    expect(all.jobs[1].durationMs).toBeGreaterThanOrEqual(0);

    const byStatus = await (
      await listRoute.GET(get("/api/jobs?status=failed"))
    ).json();
    expect(byStatus.jobs).toHaveLength(1);
    expect(byStatus.jobs[0]).toMatchObject({
      id: failed.id,
      error: { code: "import_failed", message: "no page" },
    });

    const byKind = await (
      await listRoute.GET(get("/api/jobs?kind=form-url"))
    ).json();
    expect(byKind.jobs.map((job: { id: string }) => job.id)).toEqual([second]);

    const limited = await (
      await listRoute.GET(get("/api/jobs?limit=1"))
    ).json();
    expect(limited).toMatchObject({ total: 3, more: true });
    expect(limited.jobs).toHaveLength(1);
  });

  it("refuses a status or a limit it does not know", async () => {
    for (const query of [
      "status=sleeping",
      "limit=0",
      "limit=301",
      "limit=x",
    ]) {
      const response = await listRoute.GET(get(`/api/jobs?${query}`));
      expect(response.status, query).toBe(400);
      expect((await response.json()).error.code).toBe("validation");
    }
  });

  it("adds the queue per resource on ?queue=1: the GPU and yt-dlp always", async () => {
    const body = await (await listRoute.GET(get("/api/jobs?queue=1"))).json();
    expect(
      body.queue.map((entry: { resource: string }) => entry.resource),
    ).toEqual(["gpu", "ytdlp"]);
    expect(body.queue[0]).toMatchObject({ waiters: [] });
    expect(body.queue[0]).not.toHaveProperty("holder");
    /* Without it, no queue. */
    expect(
      await (await listRoute.GET(get("/api/jobs"))).json(),
    ).not.toHaveProperty("queue");
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/jobs/<id>?from=                                            */
/* ------------------------------------------------------------------ */

describe("GET /api/jobs/<id>", () => {
  it("needs curation auth, and answers 404 for an unknown job", async () => {
    const id = await finishedJob();
    authed = false;
    expect(
      (await jobRoute.GET(get(`/api/jobs/${id}`), params(id))).status,
    ).toBe(401);
    authed = true;
    const missing = await jobRoute.GET(
      get("/api/jobs/01ZZZZZZZZZZZZZZZZZZZZZZZZ"),
      params("01ZZZZZZZZZZZZZZZZZZZZZZZZ"),
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("not_found");
  });

  it("pages the log by byte offset: from, then next, then only what is new", async () => {
    const running = await runningJob();
    try {
      const first = await (
        await jobRoute.GET(get(`/api/jobs/${running.job}`), params(running.job))
      ).json();
      expect(first).toMatchObject({ job: running.job, live: true });
      expect(first.meta).toMatchObject({ status: "running", kind: "inspect" });
      expect(
        first.lines.map(
          (line: { step: string; phase: string }) =>
            `${line.step}:${line.phase}`,
        ),
      ).toEqual(["job:start", "fetch:start"]);
      expect(first.next).toBeGreaterThan(0);

      const again = await (
        await jobRoute.GET(
          get(`/api/jobs/${running.job}?from=${first.next}`),
          params(running.job),
        )
      ).json();
      expect(again.lines).toEqual([]);
      expect(again.next).toBe(first.next);

      running.release();
      await running.done;
      const rest = await (
        await jobRoute.GET(
          get(`/api/jobs/${running.job}?from=${first.next}`),
          params(running.job),
        )
      ).json();
      expect(rest.live).toBe(false);
      expect(rest.meta.status).toBe("done");
      expect(
        rest.lines.map(
          (line: { step: string; phase: string }) =>
            `${line.step}:${line.phase}`,
        ),
      ).toEqual(["fetch:end", "job:end"]);
      /* The whole log, read in pieces, is the log read at once. */
      const whole = await (
        await jobRoute.GET(get(`/api/jobs/${running.job}`), params(running.job))
      ).json();
      expect(whole.lines).toEqual([...first.lines, ...rest.lines]);
      expect(whole.next).toBe(rest.next);
    } finally {
      running.release();
    }
  });

  it("validates from: a whole number, 0 or more", async () => {
    const id = await finishedJob();
    for (const from of ["-1", "1.5", "abc", "1e3"]) {
      const response = await jobRoute.GET(
        get(`/api/jobs/${id}?from=${from}`),
        params(id),
      );
      expect(response.status, from).toBe(400);
      expect((await response.json()).error.code).toBe("validation");
    }
    expect(parseFrom(undefined)).toBe(0);
    expect(parseFrom("")).toBe(0);
    expect(parseFrom("42")).toBe(42);
    /* Past the end is no lines, not an error. */
    const past = await (
      await jobRoute.GET(get(`/api/jobs/${id}?from=999999`), params(id))
    ).json();
    expect(past.lines).toEqual([]);
  });

  it("finds a job by the eight characters its step lines show", async () => {
    const id = await finishedJob();
    const body = await (
      await jobRoute.GET(get(`/api/jobs/${id.slice(-8)}`), params(id.slice(-8)))
    ).json();
    expect(body.job).toBe(id);
  });

  it("summarises the spec: pasted text as its length, picks as their names", async () => {
    const meta = await plant({
      spec: {
        kind: "form-batch",
        contentDirectory,
        picks: [{ n: 1, recipe: { name: "Stuffing", ingredients: ["bread"] } }],
        total: 4,
        commitNote: "x",
      },
      kind: "form-batch",
    });
    const body = await (
      await jobRoute.GET(get(`/api/jobs/${meta.id}`), params(meta.id))
    ).json();
    expect(body.meta.spec.picks).toEqual([{ n: 1, name: "Stuffing" }]);
    expect(summarizeSpec({ kind: "form-text", text: "abcdef" })).toEqual({
      kind: "form-text",
      textChars: 6,
    });
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/jobs/<id>/cancel                                          */
/* ------------------------------------------------------------------ */

describe("POST /api/jobs/<id>/cancel", () => {
  it("stops a job this process runs: it ends cancelled, code cancelled", async () => {
    const running = await runningJob();
    const response = await cancelRoute.POST(
      post(`/api/jobs/${running.job}/cancel`),
      params(running.job),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      job: running.job,
      outcome: "cancelled",
      /* The response says so at once; the meta follows a moment later. */
      status: "cancelled",
    });
    const thrown = await running.done;
    expect(thrown).toBeInstanceOf(CancelledError);
    expect(toErrorObject(thrown).error).toMatchObject({
      code: "cancelled",
      message: "cancelled by cook@test.local",
      job: running.job,
    });
    expect(await settled(running.job)).toMatchObject({
      status: "cancelled",
      error: { code: "cancelled", message: "cancelled by cook@test.local" },
    });
  });

  it("asks another process through its cancel file, and says when it had ended", async () => {
    const other = await plant({
      spec: { kind: "inspect", url: "https://example.com/elsewhere" },
      status: "running",
      endedAt: undefined,
    });
    const asked = await (
      await cancelRoute.POST(
        post(`/api/jobs/${other.id}/cancel`),
        params(other.id),
      )
    ).json();
    expect(asked).toMatchObject({
      job: other.id,
      outcome: "requested",
      status: "running",
    });
    const { readCancelRequest } =
      await import("../websites/recipe-website/editor/controller/jobs/store");
    expect(await readCancelRequest(dir, other.id)).toMatch(/cancelled by/);

    const ended = await finishedJob();
    expect(
      await (
        await cancelRoute.POST(post(`/api/jobs/${ended}/cancel`), params(ended))
      ).json(),
    ).toMatchObject({ outcome: "ended", status: "done" });
  });

  it("needs a write-scoped caller, and a job that exists", async () => {
    const id = await finishedJob();
    readOnly = true;
    expect(
      (await cancelRoute.POST(post(`/api/jobs/${id}/cancel`), params(id)))
        .status,
    ).toBe(403);
    readOnly = false;
    authed = false;
    expect(
      (await cancelRoute.POST(post(`/api/jobs/${id}/cancel`), params(id)))
        .status,
    ).toBe(401);
    authed = true;
    expect(
      (
        await cancelRoute.POST(
          post("/api/jobs/01ZZZZZZZZZZZZZZZZZZZZZZZZ/cancel"),
          params("01ZZZZZZZZZZZZZZZZZZZZZZZZ"),
        )
      ).status,
    ).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/jobs/<id>/retry                                           */
/* ------------------------------------------------------------------ */

describe("POST /api/jobs/<id>/retry", () => {
  it("runs the spec again as a new job naming the old one, answering at once", async () => {
    /* No model: the form's pasted-text import fails as a state, quickly. */
    const first = await runSpec({ kind: "form-text", text: "2 cups flour" });
    expect((await readJobMeta(dir, first.job))?.status).toBe("failed");

    const response = await retryRoute.POST(
      post(`/api/jobs/${first.job}/retry`),
      params(first.job),
    );
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({ retryOf: first.job, status: "running" });
    expect(body.job).not.toBe(first.job);
    /* The job's outcome went to `after()`, so its revalidation outlives the 202. */
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0];
    const again = await settled(body.job);
    expect(again).toMatchObject({
      kind: "form-text",
      retryOf: first.job,
      status: "failed",
      spec: { kind: "form-text", text: "2 cups flour" },
    });
  });

  it("refuses a job recorded against another content directory, and says why", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "job-surfaces-other-"));
    try {
      const meta = await plant({
        spec: {
          kind: "import-url",
          contentDirectory: elsewhere,
          url: "https://example.com/pie",
          options: {},
        },
        kind: "import-url",
      });
      const response = await retryRoute.POST(
        post(`/api/jobs/${meta.id}/retry`),
        params(meta.id),
      );
      expect(response.status).toBe(400);
      const { error } = await response.json();
      expect(error.code).toBe("usage");
      expect(error.message).toContain(elsewhere);
      expect(error.message).toContain(contentDirectory);
      /* Nothing was started. */
      const listed = await (await listRoute.GET(get("/api/jobs"))).json();
      expect(listed.jobs).toHaveLength(1);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("takes the same directory through a symlink, and commits as the caller", async () => {
    const link = join(dir, "content-link");
    await symlink(contentDirectory, link);
    const spec = await retrySpecFor(
      {
        id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
        kind: "import-url",
        spec: {
          kind: "import-url",
          contentDirectory: link,
          author: { name: "someone else", email: "else@test.local" },
          url: "https://example.com/pie",
          options: {},
        } satisfies JobSpec,
      },
      ctx,
    );
    expect(spec).toMatchObject({
      contentDirectory,
      author: { email: "cook@test.local" },
    });
    /* A spec this version cannot run is refused, not guessed at. */
    await expect(
      retrySpecFor(
        { id: "01A", kind: "reindex", spec: { kind: "reindex" } },
        ctx,
      ),
    ).rejects.toMatchObject({ code: "usage" });
  });

  it("Retry decides fresh (39a): set when asked, dropped when not, other kinds untouched", async () => {
    const meta = {
      id: "01AAAAAAAAAAAAAAAAAAAAAAAA",
      kind: "import-url",
      spec: {
        kind: "import-url",
        contentDirectory,
        url: "https://example.com/pie",
        options: { llm: "force", fresh: true },
      } satisfies JobSpec,
    };
    expect(await retrySpecFor(meta, ctx, { fresh: true })).toMatchObject({
      options: { llm: "force", fresh: true },
    });
    const plain = await retrySpecFor(meta, ctx);
    expect(plain).toMatchObject({ options: { llm: "force" } });
    expect((plain as { options: object }).options).not.toHaveProperty("fresh");
    const inspect = await retrySpecFor(
      {
        id: "01B",
        kind: "inspect",
        spec: { kind: "inspect", url: "https://example.com/pie" },
      },
      ctx,
      { fresh: true },
    );
    expect(inspect).toEqual({
      kind: "inspect",
      url: "https://example.com/pie",
    });
    /* The route refuses a body it does not know. */
    const id = await finishedJob();
    const refused = await retryRoute.POST(
      new Request(`http://editor.test/api/jobs/${id}/retry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fresh: "yes" }),
      }),
      params(id),
    );
    expect(refused.status).toBe(400);
  });

  it("needs a write-scoped caller", async () => {
    const id = await finishedJob();
    readOnly = true;
    expect(
      (await retryRoute.POST(post(`/api/jobs/${id}/retry`), params(id))).status,
    ).toBe(403);
  });
});

/* ------------------------------------------------------------------ */
/* `cancelled` and `job` on errors                                      */
/* ------------------------------------------------------------------ */

describe("the cancelled code, and job on a failure", () => {
  it("is cancelled on every transport: the error object, HTTP 409, the HTTP backend", async () => {
    const running = await runningJob();
    cancelJob(running.job, new Error("stop it"));
    const thrown = await running.done;
    const object = toErrorObject(thrown);
    expect(object.error).toEqual({
      code: "cancelled",
      message: "stop it",
      job: running.job,
    });
    const response = errorResponse(thrown);
    expect(response.status).toBe(409);

    /* The HTTP backend rehydrates it: the same code and job. */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(object, { status: 409 })),
    );
    const remote = createHttpBackend({ baseUrl: "http://editor.test" });
    await expect(remote.inspect("https://example.com/x")).rejects.toMatchObject(
      {
        code: "cancelled",
        job: running.job,
      },
    );
  });

  it("a failed import's error carries its job, over the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    const response = await importRoute.POST(
      new Request("http://editor.test/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://example.com/pie", dryRun: true }),
      }),
    );
    expect(response.status).toBe(502);
    const { error } = await response.json();
    expect(error.code).toBe("import_failed");
    expect(error.job).toMatch(/^[0-9A-Z]{26}$/);
    expect(await readJobMeta(dir, error.job)).toMatchObject({
      kind: "import-url",
      status: "failed",
      error: { code: "import_failed" },
    });
    /* The record's error does not name itself. */
    expect((await readJobMeta(dir, error.job))?.error).not.toHaveProperty(
      "job",
    );
  });
});

/* ------------------------------------------------------------------ */
/* The HTTP backend over the routes                                    */
/* ------------------------------------------------------------------ */

describe("the HTTP backend's job seats", () => {
  /** `fetch` answered by the route handlers themselves. */
  function routeFetch() {
    return vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const request = new Request(url, init);
      const match = /^\/api\/jobs(?:\/([^/]+))?(?:\/(cancel|retry))?$/.exec(
        url.pathname,
      );
      if (!match) return new Response("nope", { status: 404 });
      const [, id, action] = match;
      if (!id) return listRoute.GET(request);
      if (action === "cancel") return cancelRoute.POST(request, params(id));
      if (action === "retry") return retryRoute.POST(request, params(id));
      return jobRoute.GET(request, params(decodeURIComponent(id)));
    });
  }

  it("lists, reads from an offset, cancels and retries through /api/jobs", async () => {
    const done = await finishedJob("inspect", "remote page");
    vi.stubGlobal("fetch", routeFetch());
    const remote = createHttpBackend({ baseUrl: "http://editor.test" });

    const listed = await remote.listJobs({ status: "done", limit: 5 });
    expect(listed.jobs.map((job) => job.id)).toEqual([done]);

    const view = await remote.getJob(done);
    expect(view.lines.length).toBeGreaterThan(0);
    const tail = await remote.getJob(done, { from: view.next });
    expect(tail.lines).toEqual([]);

    expect(await remote.cancelJob(done)).toMatchObject({ outcome: "ended" });

    const failed = await runSpec({ kind: "form-text", text: "1 egg" });
    const retried = await remote.retryJob(failed.job);
    expect(retried).toMatchObject({ retryOf: failed.job, status: "running" });
    await settled(retried.job);
  });
});

/* ------------------------------------------------------------------ */
/* The CLI: jobs list | log | cancel | retry                           */
/* ------------------------------------------------------------------ */

describe("recipes jobs …", () => {
  /** Run the CLI in this process; stdout and the exit code. */
  async function cli(
    ...args: string[]
  ): Promise<{ code: number; stdout: string }> {
    let stdout = "";
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      });
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    try {
      const code = await main([...args, "--content-dir", contentDirectory]);
      return { code, stdout };
    } finally {
      write.mockRestore();
      stderr.mockRestore();
    }
  }

  it("lists jobs, filtered, as JSON and for a person", async () => {
    const id = await finishedJob("inspect", "listed page");
    await plant({
      spec: { kind: "import-url", url: "https://example.com/z" },
      kind: "import-url",
      status: "failed",
    });
    const json = await cli("jobs", "list", "--status", "done", "--json");
    expect(json.code).toBe(0);
    const parsed = JSON.parse(json.stdout);
    expect(parsed.jobs.map((job: { id: string }) => job.id)).toEqual([id]);

    const human = await cli("jobs", "list", "--kind", "inspect");
    expect(human.stdout).toContain(id);
    expect(human.stdout).toContain("listed page");
    expect(human.stdout).not.toContain("import-url");

    const bad = await cli("jobs", "list", "--status", "asleep", "--json");
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.stdout).error.code).toBe("usage");
  });

  it("log --follow prints a running job's lines until it ends", async () => {
    vi.stubEnv("RECIPE_JOBS_FOLLOW_MS", "30");
    const running = await runningJob();
    setTimeout(() => running.release(), 150);
    const followed = await cli(
      "jobs",
      "log",
      running.job,
      "--follow",
      "--json",
    );
    expect(followed.code).toBe(0);
    const parsed = JSON.parse(followed.stdout);
    expect(parsed.status).toBe("done");
    expect(
      parsed.lines.map(
        (line: { step: string; phase: string }) => `${line.step}:${line.phase}`,
      ),
    ).toEqual(["job:start", "fetch:start", "fetch:end", "job:end"]);

    /* A person's follow prints the lines as they come, then the status. */
    const again = await cli("jobs", "log", running.job, "--follow");
    expect(again.stdout).toMatch(/\[job \w{8}\] fetch example.com/);
    expect(again.stdout.trim().split("\n").at(-1)).toBe(`${running.job} done`);

    const badFrom = await cli(
      "jobs",
      "log",
      running.job,
      "--from",
      "x",
      "--json",
    );
    expect(JSON.parse(badFrom.stdout).error.code).toBe("usage");
  });

  it("cancel stops a running job; retry runs one again and refuses another directory", async () => {
    const running = await runningJob();
    const cancelled = await cli(
      "jobs",
      "cancel",
      running.job.slice(-8),
      "--json",
    );
    expect(cancelled.code).toBe(0);
    expect(JSON.parse(cancelled.stdout)).toMatchObject({
      job: running.job,
      outcome: "cancelled",
    });
    await running.done;
    expect((await settled(running.job)).status).toBe("cancelled");

    const failed = await runSpec({ kind: "form-text", text: "3 eggs" });
    const retried = await cli("jobs", "retry", failed.job, "--json");
    /* Locally the retry runs here and answers its end: failed, so exit 1. */
    expect(retried.code).toBe(1);
    expect(JSON.parse(retried.stdout)).toMatchObject({
      retryOf: failed.job,
      status: "failed",
      error: { code: "import_failed" },
    });

    const elsewhere = await plant({
      spec: {
        kind: "import-url",
        contentDirectory: join(tmpdir(), "not-this-one"),
        url: "https://example.com/pie",
        options: {},
      },
      kind: "import-url",
    });
    const refused = await cli("jobs", "retry", elsewhere.id, "--json");
    expect(refused.code).toBe(1);
    const { error } = JSON.parse(refused.stdout);
    expect(error.code).toBe("usage");
    expect(error.message).toContain("not-this-one");
  });

  it("show goes through the backend too", async () => {
    const id = await finishedJob();
    const shown = await cli("jobs", "show", id, "--json");
    expect(JSON.parse(shown.stdout)).toMatchObject({
      job: id,
      meta: { id, status: "done" },
    });
  });
});

/* ------------------------------------------------------------------ */
/* 37c review: orphans, retry storms, the spec as read, result rows     */
/* ------------------------------------------------------------------ */

/** A pid that is certainly dead: a child already exited and reaped. */
function deadPid(): number {
  return Number(String(spawnSync("sh", ["-c", "echo $$"]).stdout).trim());
}

describe("an orphaned live job, read", () => {
  it("is reported — and written — interrupted by the view, the list and cancel", async () => {
    const orphan = () =>
      plant({
        spec: { kind: "inspect", url: "https://example.com/orphan" },
        status: "running",
        endedAt: undefined,
        pid: deadPid(),
      });

    const viewed = await orphan();
    const body = await (
      await jobRoute.GET(get(`/api/jobs/${viewed.id}`), params(viewed.id))
    ).json();
    expect(body.live).toBe(false);
    expect(body.meta).toMatchObject({
      status: "interrupted",
      error: { code: "interrupted" },
    });
    expect(body.meta.error.message).toMatch(/ended before it finished/);
    expect(body.lines.at(-1)).toMatchObject({ step: "job", level: "warn" });
    /* Persisted: the next reader finds it closed. */
    expect((await readJobMeta(dir, viewed.id))?.status).toBe("interrupted");

    const listed = await orphan();
    const live = await (
      await listRoute.GET(get("/api/jobs?status=live"))
    ).json();
    expect(live.jobs).toEqual([]);
    expect((await readJobMeta(dir, listed.id))?.status).toBe("interrupted");

    const cancelled = await orphan();
    expect(
      await (
        await cancelRoute.POST(
          post(`/api/jobs/${cancelled.id}/cancel`),
          params(cancelled.id),
        )
      ).json(),
    ).toMatchObject({ outcome: "ended", status: "interrupted" });

    /* A live job whose process is alive (this one) is left alone. */
    const alive = await plant({
      spec: { kind: "inspect", url: "https://example.com/alive" },
      status: "running",
      endedAt: undefined,
    });
    const still = await (
      await jobRoute.GET(get(`/api/jobs/${alive.id}`), params(alive.id))
    ).json();
    expect(still).toMatchObject({ live: true, meta: { status: "running" } });
  });

  it("ends `jobs log --follow`", async () => {
    vi.stubEnv("RECIPE_JOBS_FOLLOW_MS", "30");
    const orphan = await plant({
      spec: { kind: "inspect", url: "https://example.com/orphan" },
      status: "running",
      endedAt: undefined,
      pid: deadPid(),
    });
    let stdout = "";
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      });
    try {
      const code = await main([
        "jobs",
        "log",
        orphan.id,
        "--follow",
        "--json",
        "--content-dir",
        contentDirectory,
      ]);
      expect(code).toBe(1);
    } finally {
      write.mockRestore();
    }
    expect(JSON.parse(stdout).status).toBe("interrupted");
  });
});

describe("a retry storm", () => {
  /** A model that takes the request and never answers (until aborted). */
  function hangingModel() {
    vi.stubEnv("RECIPE_LLM_URL", "http://model.test");
    vi.stubGlobal(
      "fetch",
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal!.reason),
            { once: true },
          );
        }),
    );
  }

  it("refuses a job that is still live: 409 job_live, naming it", async () => {
    const running = await runningJob();
    try {
      const response = await retryRoute.POST(
        post(`/api/jobs/${running.job}/retry`),
        params(running.job),
      );
      expect(response.status).toBe(409);
      const { error } = await response.json();
      expect(error).toMatchObject({ code: "job_live", job: running.job });
      expect(afterTasks).toHaveLength(0);
    } finally {
      running.release();
      await running.done;
    }
  });

  it("starts one retry for two presses at once, and refuses more while it runs", async () => {
    const first = await runSpec({ kind: "form-text", text: "2 cups flour" });
    expect((await readJobMeta(dir, first.job))?.status).toBe("failed");
    hangingModel();

    const responses = await Promise.all([
      retryRoute.POST(post(`/api/jobs/${first.job}/retry`), params(first.job)),
      retryRoute.POST(post(`/api/jobs/${first.job}/retry`), params(first.job)),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([202, 409]);
    const bodies = await Promise.all(
      responses.map((response) => response.json()),
    );
    const started = bodies.find((body) => !body.error);
    const refused = bodies.find((body) => body.error);
    expect(refused.error).toMatchObject({
      code: "job_live",
      job: started.job,
    });
    expect(refused.error.message).toContain(started.job);

    /* Later, while it still runs: refused the same way, from its record. */
    const later = await retryRoute.POST(
      post(`/api/jobs/${first.job}/retry`),
      params(first.job),
    );
    expect(later.status).toBe(409);
    expect((await later.json()).error.job).toBe(started.job);
    const listed = await (await listRoute.GET(get("/api/jobs"))).json();
    expect(listed.jobs).toHaveLength(2);

    /* Once it has ended, Retry starts another. */
    cancelJob(started.job, new Error("enough"));
    expect((await settled(started.job)).status).toBe("cancelled");
    const fresh = await retryRoute.POST(
      post(`/api/jobs/${first.job}/retry`),
      params(first.job),
    );
    expect(fresh.status).toBe(202);
    const third = (await fresh.json()).job;
    cancelJob(third, new Error("enough"));
    await settled(third);
  });

  it("is refused through the CLI too (exit 1, the live job named)", async () => {
    const running = await runningJob();
    let stdout = "";
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      });
    try {
      const code = await main([
        "jobs",
        "retry",
        running.job,
        "--json",
        "--content-dir",
        contentDirectory,
      ]);
      expect(code).toBe(1);
    } finally {
      write.mockRestore();
      running.release();
      await running.done;
    }
    expect(JSON.parse(stdout).error).toMatchObject({
      code: "job_live",
      job: running.job,
    });
  });
});

describe("the spec as a reader gets it", () => {
  it("has no URL credentials, no author and no content directory", async () => {
    expect(
      summarizeSpec({
        kind: "import-text",
        text: "abc",
        source: "https://cook:hunter2@example.com/video",
        contentDirectory: "/srv/content",
        author: { name: "cook", email: "cook@test.local" },
        options: {},
      }),
    ).toEqual({
      kind: "import-text",
      source: "https://example.com/video",
      textChars: 3,
      options: {},
    });
    const meta = await plant({
      spec: {
        kind: "import-url",
        url: "https://cook:hunter2@example.com/pie",
        contentDirectory,
        author: { name: "cook", email: "cook@test.local" },
        options: {},
      },
      kind: "import-url",
    });
    const body = await (
      await jobRoute.GET(get(`/api/jobs/${meta.id}`), params(meta.id))
    ).json();
    expect(body.meta.spec).toEqual({
      kind: "import-url",
      url: "https://example.com/pie",
      options: {},
    });
    expect(JSON.stringify(body)).not.toContain("hunter2");
    /* The record keeps it all, for Retry. */
    expect((await readJobMeta(dir, meta.id))?.spec).toMatchObject({
      url: "https://cook:hunter2@example.com/pie",
      contentDirectory,
    });
  });
});

describe("resultRows", () => {
  it("names a several-recipe import's readings by recipe.name, and the picker's rows by name", () => {
    /* A `form-url` batch: `SplitReading`s, the name nested. */
    expect(
      resultRows({
        recipes: [
          { n: 1, trusted: true, recipe: { name: "Potato Puree" } },
          { n: 2, trusted: false, recipe: { name: "Stuffing" } },
          { n: 4, trusted: true, recipe: {} },
        ],
      }),
    ).toEqual([
      { n: 1, name: "Potato Puree" },
      { n: 2, name: "Stuffing" },
      { n: 4, name: "Recipe 4" },
    ]);
    /* "Import N selected": `ImportBatchItem`s, the name their own. */
    expect(
      resultRows({
        recipes: [
          {
            n: 4,
            name: "Fried Shallots",
            status: "imported",
            slug: "fried-shallots",
          },
          { n: 1, status: "failed", error: { message: "no" } },
        ],
      }),
    ).toEqual([
      {
        n: 4,
        name: "Fried Shallots",
        status: "imported",
        slug: "fried-shallots",
      },
      { n: 1, name: "Recipe 1", status: "failed", error: { message: "no" } },
    ]);
    expect(resultRows({ slug: "pie" })).toBeUndefined();
    expect(resultRows({ found: [{ name: "Pie" }] })).toEqual([{ name: "Pie" }]);
  });
});

describe("recipes jobs log --follow, interrupted", () => {
  const EDITOR_DIR = resolve(__dirname, "../websites/recipe-website/editor");
  const TSX = resolve(EDITOR_DIR, "node_modules/.bin/tsx");

  it("exits 130 at once on Ctrl-C, leaving the followed job running", async () => {
    /* A job this test process "runs": alive, so the follow goes on. */
    const followed = await plant({
      spec: { kind: "inspect", url: "https://example.com/followed" },
      status: "running",
      endedAt: undefined,
    });
    await appendFile(
      join(dir, `${followed.id}.log.jsonl`),
      `${JSON.stringify({
        t: new Date().toISOString(),
        step: "fetch",
        phase: "start",
        level: "info",
        n: 1,
        data: { host: "example.com" },
      })}\n`,
    );
    const cli = spawn(
      TSX,
      [
        "cli/index.ts",
        "jobs",
        "log",
        followed.id,
        "--follow",
        "--content-dir",
        contentDirectory,
      ],
      {
        cwd: EDITOR_DIR,
        env: {
          ...process.env,
          RECIPE_ENV_FILE: "/dev/null",
          RECIPE_JOBS_DIR: dir,
          /* Longer than the grace period: before the fix, Ctrl-C waited it out. */
          RECIPE_JOBS_FOLLOW_MS: "20000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    try {
      let stdout = "";
      let stderr = "";
      cli.stdout?.on("data", (chunk) => (stdout += String(chunk)));
      cli.stderr?.on("data", (chunk) => (stderr += String(chunk)));
      const closed = new Promise<number | null>((done) =>
        cli.on("close", (code) => done(code)),
      );
      await vi.waitFor(() => expect(stdout, stderr).toMatch(/fetch/), {
        timeout: 30_000,
        interval: 50,
      });
      const asked = Date.now();
      cli.kill("SIGINT");
      expect(await closed, stderr).toBe(130);
      expect(Date.now() - asked).toBeLessThan(3_000);
      expect(stdout.trim().split("\n").at(-1)).toBe(`${followed.id} running`);
      /* Following is not owning: the job was not cancelled. */
      expect((await readJobMeta(dir, followed.id))?.status).toBe("running");
    } finally {
      if (cli.exitCode === null && cli.signalCode === null) {
        cli.kill("SIGKILL");
      }
    }
  }, 60_000);
});

/* ------------------------------------------------------------------ */
/* MCP: job_list and job_get                                           */
/* ------------------------------------------------------------------ */

describe("MCP job_list and job_get", () => {
  async function connect(readOnlySession = false) {
    const backend = createLocalBackend({ contentDirectory });
    const server = createRecipeServer(backend, { readOnly: readOnlySession });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "job-tools-test", version: "0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    return {
      client,
      close: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  it("lists and reads jobs, read-only, and answers not_found as the layer does", async () => {
    const id = await finishedJob("inspect", "mcp page");
    const { client, close } = await connect();
    try {
      const listed = await client.callTool({
        name: "job_list",
        arguments: { status: "done" },
      });
      expect(listed.isError).not.toBe(true);
      expect(
        (listed.structuredContent as { jobs: { id: string }[] }).jobs.map(
          (job) => job.id,
        ),
      ).toEqual([id]);

      const got = await client.callTool({
        name: "job_get",
        arguments: { id: id.slice(-8) },
      });
      const view = got.structuredContent as {
        job: string;
        lines: { step: string }[];
        next: number;
        live: boolean;
      };
      expect(view.job).toBe(id);
      expect(view.live).toBe(false);
      expect(
        buildStepTree(view.lines as never).flat.map((node) => node.step),
      ).toEqual(["fetch"]);
      const after = await client.callTool({
        name: "job_get",
        arguments: { id, from: view.next },
      });
      expect((after.structuredContent as { lines: unknown[] }).lines).toEqual(
        [],
      );

      const missing = await client.callTool({
        name: "job_get",
        arguments: { id: "01ZZZZZZZZZZZZZZZZZZZZZZZZ" },
      });
      expect(missing.isError).toBe(true);
      expect(
        (missing.structuredContent as { error: { code: string } }).error.code,
      ).toBe("not_found");
    } finally {
      await close();
    }
  });

  it("keeps both tools in a read-scoped session", async () => {
    const { client, close } = await connect(true);
    try {
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining(["job_list", "job_get"]));
    } finally {
      await close();
    }
  });
});

/* ------------------------------------------------------------------ */
/* The step tree the panel and the timeline draw                       */
/* ------------------------------------------------------------------ */

describe("buildStepTree", () => {
  it("pairs starts and ends by n, nests by parent, and keeps a running step running", () => {
    const t = (ms: number) =>
      new Date(Date.UTC(2026, 9, 15, 0, 0, 0, ms)).toISOString();
    const tree = buildStepTree([
      { t: t(0), step: "job", phase: "start", level: "info", n: 1 },
      {
        t: t(10),
        step: "ytdlp",
        phase: "start",
        level: "info",
        n: 2,
        parent: 1,
      },
      {
        t: t(900),
        step: "ytdlp",
        phase: "end",
        level: "info",
        n: 2,
        parent: 1,
        ms: 890,
        ok: true,
      },
      {
        t: t(910),
        step: "split",
        phase: "note",
        level: "info",
        parent: 1,
        msg: "the gate",
      },
      {
        t: t(920),
        step: "llm.extract",
        phase: "start",
        level: "info",
        n: 3,
        parent: 1,
        data: { part: "1/2", name: "Stuffing" },
      },
      {
        t: t(930),
        step: "queue.wait",
        phase: "start",
        level: "info",
        n: 4,
        parent: 3,
        data: { resource: "gpu", position: 2 },
      },
      {
        t: t(940),
        step: "llm.placement",
        phase: "note",
        level: "warn",
        parent: 3,
        msg: "2% GPU",
      },
    ]);
    expect(tree.root?.step).toBe("job");
    expect(tree.steps.map((node) => node.step)).toEqual([
      "ytdlp",
      "llm.extract",
    ]);
    expect(tree.steps[0]).toMatchObject({ status: "ok", ms: 890, depth: 0 });
    expect(tree.steps[1].children[0]).toMatchObject({
      step: "queue.wait",
      status: "running",
      depth: 1,
    });
    expect(tree.notes.map((note) => note.step)).toEqual(["split"]);
    expect(tree.warnings.map((note) => note.msg)).toEqual(["2% GPU"]);
    expect(tree.flat).toHaveLength(3);
  });
});
