// @vitest-environment node
//
// 48c: the board `/jobs` reads (`GET /api/jobs/board`, `jobsBoard`,
// `boardJob`) and the masthead chip's count (`GET /api/jobs/live`,
// `liveJobCounts`) — over planted records in a temp store, with the
// curation context mocked as `jobSurfaces.test.ts` does.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ulid } from "@discontent/cms/util/ulid";
import { UnauthenticatedError } from "../websites/recipe-website/editor/controller/curation/errors";
import {
  logPath,
  newJobMeta,
  readJobMeta,
  writeJobMeta,
  type JobMeta,
} from "../websites/recipe-website/editor/controller/jobs/store";
import {
  boardJob,
  jobsBoard,
  liveJobCounts,
} from "../websites/recipe-website/editor/controller/jobs/views";

let authed = true;
vi.mock("recipe-editor/controller/apiContext", () => ({
  requireCurationContext: async () => {
    if (!authed) throw new UnauthenticatedError();
    return { contentDirectory: "/nowhere", author: { name: "a", email: "a" } };
  },
}));

const boardRoute =
  await import("../websites/recipe-website/editor/src/app/api/jobs/board/route");
const liveRoute =
  await import("../websites/recipe-website/editor/src/app/api/jobs/live/route");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jobs-board-"));
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  vi.stubEnv("RECIPE_QUEUE_DIR", join(dir, "queue"));
  authed = true;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

/** A record as another process leaves one, dated `ago` ms back. */
async function plant(
  patch: Partial<JobMeta> & {
    spec: { kind: string } & Record<string, unknown>;
  },
  ago = 1_000,
): Promise<JobMeta> {
  const at = Date.now() - ago;
  const id = ulid(at);
  const meta: JobMeta = {
    ...newJobMeta(
      id,
      { kind: patch.spec.kind, label: "planted", spec: patch.spec },
      at,
    ),
    status: "done",
    startedAt: at,
    endedAt: at + 500,
    ...patch,
  };
  await writeJobMeta(dir, meta);
  return meta;
}

describe("boardJob", () => {
  it("adds the page read, a non-2xx status, the name, the slug and a run's cost", async () => {
    const inspect = await plant({
      spec: { kind: "inspect", url: "https://user:secret@a.test/x" },
      result: {
        url: "https://a.test/x",
        status: 404,
        partial: false,
      },
    });
    const row = boardJob(inspect);
    expect(row).toMatchObject({
      id: inspect.id,
      kind: "inspect",
      url: "https://a.test/x",
      httpStatus: 404,
      outcome: { kind: "nothing" },
    });
    expect(JSON.stringify(row)).not.toContain("secret");

    const imported = await plant({
      spec: { kind: "import-url", url: "https://b.test/pie" },
      result: { slug: "pie", name: "Apple Pie", status: 200 },
    });
    expect(boardJob(imported)).toMatchObject({
      slug: "pie",
      name: "Apple Pie",
    });
    expect(boardJob(imported)).not.toHaveProperty("httpStatus");

    const dry = await plant({
      spec: { kind: "import-url", url: "https://b.test/tart" },
      result: { slug: "tart", dryRun: true, recipe: { name: "Tart" } },
    });
    expect(boardJob(dry)).not.toHaveProperty("slug");
    expect(boardJob(dry).name).toBe("Tart");

    const pasted = await plant({
      spec: { kind: "form-text", text: "x", source: "https://c.test/jam" },
    });
    expect(boardJob(pasted).url).toBe("https://c.test/jam");

    const run = await plant({
      spec: { kind: "agent", prompt: "find pies" },
      result: { model: "claude-sonnet-5", usage: { costEstimateUsd: 0.31 } },
    });
    expect(boardJob(run)).toMatchObject({
      costUsd: 0.31,
      model: "claude-sonnet-5",
    });
  });
});

describe("GET /api/jobs/board", () => {
  it("answers the rows, the live jobs' logs and the queue", async () => {
    /* Older than the live one: two ids in one millisecond sort at random. */
    const done = await plant(
      { spec: { kind: "inspect", url: "https://a.test/" } },
      60_000,
    );
    const live = await plant({
      spec: { kind: "import-url", url: "https://a.test/slow" },
      status: "running",
      endedAt: undefined,
    });
    await writeFile(
      logPath(dir, live.id),
      `${JSON.stringify({ t: new Date().toISOString(), step: "job", phase: "start", level: "info", n: 0 })}\n`,
    );
    const response = await boardRoute.GET(
      new Request("http://editor.test/api/jobs/board"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.jobs.map((job: { id: string }) => job.id)).toEqual([
      live.id,
      done.id,
    ]);
    expect(body.live).toEqual([
      { id: live.id, lines: [expect.objectContaining({ step: "job" })] },
    ]);
    expect(
      body.queue.map((entry: { resource: string }) => entry.resource),
    ).toEqual(["gpu", "ytdlp"]);
    expect(typeof body.readAt).toBe("number");
    expect(body).toMatchObject({ total: 2, more: false });
  });

  it("refuses without a session or token, and a bad limit", async () => {
    authed = false;
    expect(
      (await boardRoute.GET(new Request("http://editor.test/api/jobs/board")))
        .status,
    ).toBe(401);
    authed = true;
    expect(
      (
        await boardRoute.GET(
          new Request("http://editor.test/api/jobs/board?limit=0"),
        )
      ).status,
    ).toBe(400);
  });

  it("keeps a live job's card past the list's limit", async () => {
    const live = await plant(
      {
        spec: { kind: "import-url", url: "https://a.test/old" },
        status: "running",
        endedAt: undefined,
      },
      60_000,
    );
    await plant({ spec: { kind: "inspect", url: "https://a.test/new" } });
    const board = await jobsBoard({ limit: 1 }, dir, join(dir, "queue"));
    expect(board.jobs.map((job) => job.id)).toContain(live.id);
    expect(board.more).toBe(true);
  });
});

describe("GET /api/jobs/live", () => {
  it("counts the running and the queued, from the last day only", async () => {
    await plant({
      spec: { kind: "inspect", url: "https://a.test/1" },
      status: "running",
      endedAt: undefined,
    });
    await plant({
      spec: { kind: "inspect", url: "https://a.test/2" },
      status: "queued",
      endedAt: undefined,
    });
    await plant({ spec: { kind: "inspect", url: "https://a.test/3" } });
    /* Two days old and still "running": outside the window. */
    await plant(
      {
        spec: { kind: "inspect", url: "https://a.test/4" },
        status: "running",
        endedAt: undefined,
      },
      2 * 24 * 60 * 60 * 1000,
    );
    const response = await liveRoute.GET(
      new Request("http://editor.test/api/jobs/live"),
    );
    expect(await response.json()).toEqual({ running: 1, queued: 1 });
  });

  it("closes an orphan first: a live record whose process is gone counts nothing", async () => {
    const orphan = await plant({
      spec: { kind: "inspect", url: "https://a.test/o" },
      status: "running",
      endedAt: undefined,
      /* A pid that cannot be running. */
      pid: 2 ** 22 + 7,
    });
    expect(await liveJobCounts(dir)).toEqual({ running: 0, queued: 0 });
    expect((await readJobMeta(dir, orphan.id)).status).toBe("interrupted");
  });
});
