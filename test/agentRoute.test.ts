// @vitest-environment node
//
// 44c: `POST /api/agent` and `GET /api/agent/<id>`, with the route's own
// auth for real (27b, as ask.test.ts): the session from the `@/auth` stub,
// tokens minted per test. The Claude API is `fetch` stubbed — never a real
// model. Pinned (E5): a guest 401, a read token 403 on a start and 200 on
// a read, a write token and a session 202; no model configured 400; an
// over-long ask 413; a follow-up and its refusals; the view's two offsets.

import { appendFile, mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import {
  addTokenToUser,
  writeUser,
} from "../websites/recipe-website/editor/src/users";
import { auth } from "./stub_auth.js";
import { AGENT_TRANSCRIPT_MAX_BYTES } from "../websites/recipe-website/editor/controller/agent/runs";
import { transcriptPath } from "../websites/recipe-website/editor/controller/jobs/store";

/* `after()` outside Next: each task kept, so a test can await the run. */
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

const { POST: startRoute } =
  await import("../websites/recipe-website/editor/src/app/api/agent/route");
const { GET: viewRoute } =
  await import("../websites/recipe-website/editor/src/app/api/agent/[id]/route");
const { POST: cancelRoute } =
  await import("../websites/recipe-website/editor/src/app/api/jobs/[id]/cancel/route");

const EDITOR = "admin@nextmail.com";
const KEY = "sk-ant-test-0000-not-a-real-key-44c-route";

let dir: string;
let contentDirectory: string;

function signIn(on: boolean) {
  auth.mockReset();
  auth.mockResolvedValue(on ? { user: { email: EDITOR } } : null);
}

async function mint(scope: "read" | "write"): Promise<string> {
  await writeUser(contentDirectory, { email: EDITOR, password: "hashed" });
  return addTokenToUser(contentDirectory, EDITOR, `agent-${scope}`, { scope });
}

/** The Claude API answering every turn with `reply`, no tools. */
function stubModel(reply = "Nothing to do."): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "msg_1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: reply }],
            stop_reason: "end_turn",
            usage: { input_tokens: 100, output_tokens: 5 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
}

function post(body: unknown, { token }: { token?: string } = {}) {
  return startRoute(
    new Request("http://editor/api/agent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function view(id: string, query = "", { token }: { token?: string } = {}) {
  return viewRoute(
    new Request(`http://editor/api/agent/${id}${query}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-route-"));
  contentDirectory = await mkdtemp(join(tmpdir(), "agent-route-content-"));
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  vi.stubEnv("CONTENT_DIRECTORY", contentDirectory);
  vi.stubEnv("RECIPE_LLM_API", "anthropic");
  vi.stubEnv("RECIPE_LLM_API_KEY", KEY);
  vi.stubEnv("RECIPE_LLM_URL", "https://claude.test");
  vi.stubEnv("RECIPE_LLM_MODEL", "claude-sonnet-5");
  afterTasks.length = 0;
  signIn(true);
});

afterEach(async () => {
  await Promise.all(afterTasks);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await closeCachedEnvironments();
  await rm(dir, { recursive: true, force: true });
  await rm(contentDirectory, { recursive: true, force: true });
});

describe("POST /api/agent", () => {
  it("answers a guest 401 and a read token 403, before any model call", async () => {
    stubModel();
    signIn(false);
    expect((await post({ prompt: "find a pie" })).status).toBe(401);
    const read = await mint("read");
    const refused = await post({ prompt: "find a pie" }, { token: read });
    expect(refused.status).toBe(403);
    expect((await refused.json()).error.code).toBe("forbidden");
    expect(fetch).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(0);
  });

  it("starts a run for a write token, and for a session (202)", async () => {
    stubModel("Here you go.");
    const write = await mint("write");
    signIn(false);
    const byToken = await post({ prompt: "find a pie" }, { token: write });
    expect(byToken.status).toBe(202);
    const started = await byToken.json();
    expect(started).toMatchObject({ status: "running" });
    expect(typeof started.job).toBe("string");
    /* The run outlives the answer: its outcome went to `after()`. */
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0];

    signIn(true);
    const bySession = await post({ prompt: "find a cake" });
    expect(bySession.status).toBe(202);
    await Promise.all(afterTasks);

    /* A read token may read a run (E5). */
    const read = await mint("read");
    signIn(false);
    const seen = await view(started.job, "", { token: read });
    expect(seen.status).toBe(200);
    const body = await seen.json();
    expect(body).toMatchObject({
      job: started.job,
      live: false,
      meta: {
        kind: "agent",
        status: "done",
        spec: { kind: "agent", prompt: "find a pie" },
        result: { text: "Here you go.", stopReason: "done" },
      },
    });
    /* The spec as a reader sees it: no author, no server path. */
    expect(body.meta.spec).not.toHaveProperty("contentDirectory");
    expect(body.meta.spec).not.toHaveProperty("author");
    expect(
      body.transcript.map((record: { type: string }) => record.type),
    ).toEqual(["start", "message", "message", "end"]);
    expect(body.next).toBeGreaterThan(0);
    expect(body.transcriptNext).toBeGreaterThan(0);

    /* From both offsets: nothing new. */
    const tail = await view(
      started.job,
      `?from=${body.next}&transcriptFrom=${body.transcriptNext}`,
      { token: read },
    );
    expect(await tail.json()).toMatchObject({ lines: [], transcript: [] });
    signIn(false);
    expect((await view(started.job)).status).toBe(401);
  });

  it("is 400 with no model configured, and 413 for an ask over 4,000 characters", async () => {
    stubModel();
    expect((await post({ prompt: "x".repeat(4_001) })).status).toBe(413);
    const long = await post({ prompt: "x".repeat(4_001) });
    expect((await long.json()).error.code).toBe("validation");
    expect((await post({ prompt: "" })).status).toBe(400);
    expect((await post({ prompt: "hi", extra: 1 })).status).toBe(400);
    expect((await post({ prompt: "hi", maxTurns: 41 })).status).toBe(400);

    vi.stubEnv("RECIPE_LLM_API", "");
    vi.stubEnv("RECIPE_LLM_URL", "");
    const none = await post({ prompt: "find a pie" });
    expect(none.status).toBe(400);
    expect((await none.json()).error).toMatchObject({
      code: "usage",
      message: expect.stringContaining("No model is configured"),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows up on a run, and refuses a job that is not one", async () => {
    stubModel("First.");
    const first = await (await post({ prompt: "find a pie" })).json();
    await Promise.all(afterTasks);

    stubModel("Second.");
    const followUp = await post({ prompt: "another", runId: first.job });
    expect(followUp.status).toBe(202);
    const second = await followUp.json();
    expect(second).toMatchObject({ continues: first.job });
    await Promise.all(afterTasks);

    /* A conversation past the cap (2 MB): 413, start a new one. */
    await appendFile(
      transcriptPath(dir, second.job),
      `${JSON.stringify({ type: "note", pad: "x".repeat(AGENT_TRANSCRIPT_MAX_BYTES) })}\n`,
    );
    const long = await post({ prompt: "and more", runId: second.job });
    expect(long.status).toBe(413);
    expect((await long.json()).error).toMatchObject({
      code: "validation",
      message: expect.stringContaining("start a new one"),
    });

    expect(
      (await post({ prompt: "x", runId: "01JNOPENOPENOPENOPENOPENOPE" }))
        .status,
    ).toBe(404);
    /* A view of a job that is not a run is 404 too. */
    expect((await view("01JNOPENOPENOPENOPENOPENOPE")).status).toBe(404);
  });

  it("is cancelled through the jobs route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );
    const started = await (await post({ prompt: "slow" })).json();
    /* A continue of a live run is 409, naming it. */
    const busy = await post({ prompt: "more", runId: started.job });
    expect(busy.status).toBe(409);
    expect((await busy.json()).error).toMatchObject({
      code: "job_live",
      job: started.job,
    });

    const cancelled = await cancelRoute(
      new Request(`http://editor/api/jobs/${started.job}/cancel`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: started.job }) },
    );
    expect(await cancelled.json()).toMatchObject({ outcome: "cancelled" });
    await Promise.all(afterTasks);
    const body = await (await view(started.job)).json();
    expect(body.meta.status).toBe("cancelled");
    expect(body.transcript.at(-1)).toMatchObject({
      type: "end",
      stop: "cancelled",
    });
  });
});
