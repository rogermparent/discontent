// @vitest-environment node
//
// 51e: review notes on a curator run — the check (`reviewNotes.ts`), the
// store beside the run (`reviewNoteStore.ts`), the run view's
// `reviewNotes`, `/api/agent/<id>/note` with the route's own auth (27b, as
// agentRoute.test.ts: a guest 401, a read token 403 on a write and 200 on a
// read, a write token and a session 201), `recipes agent note` (local and
// over HTTP), `--hold` / `--claude` reaching the editor, and the runner's
// score summary (`summarizeRuns`). No model anywhere: the runs are job
// records written by hand.

import { mkdtemp, pathExists, readFile, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ulid } from "@discontent/cms/util/ulid";

import {
  addTokenToUser,
  writeUser,
} from "../websites/recipe-website/editor/src/users";
import { auth } from "./stub_auth.js";
import {
  REVIEW_NOTES_MAX,
  REVIEW_NOTE_TEXT_MAX,
  ReviewNoteInputSchema,
  readStoredNote,
} from "../websites/recipe-website/editor/controller/agent/reviewNotes";
import {
  addReviewNote,
  listReviewNotes,
  readReviewNotes,
} from "../websites/recipe-website/editor/controller/agent/reviewNoteStore";
import { getAgentRunView } from "../websites/recipe-website/editor/controller/agent/runs";
import {
  newJobMeta,
  notesPath,
  pruneJobs,
  writeJobMeta,
  type JobMeta,
} from "../websites/recipe-website/editor/controller/jobs/store";
import { createHttpBackend } from "../websites/recipe-website/editor/cli/backend/http";
import { main, splitArgv } from "../websites/recipe-website/editor/cli/index";
import {
  formatDuration,
  formatSummary,
  median,
  modelList,
  summarizeRuns,
  summaryPathFor,
  type RunLine,
} from "../websites/recipe-website/editor/scripts/agentMeasure";

const { GET: notesRoute, POST: noteRoute } =
  await import("../websites/recipe-website/editor/src/app/api/agent/[id]/note/route");
const { GET: viewRoute } =
  await import("../websites/recipe-website/editor/src/app/api/agent/[id]/route");

const EDITOR = "admin@nextmail.com";

let dir: string;
let contentDirectory: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "curator-notes-"));
  contentDirectory = await mkdtemp(join(tmpdir(), "curator-notes-content-"));
  vi.stubEnv("RECIPE_JOBS_DIR", dir);
  vi.stubEnv("CONTENT_DIRECTORY", contentDirectory);
  auth.mockReset();
  auth.mockResolvedValue({ user: { email: EDITOR } });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
  await rm(contentDirectory, { recursive: true, force: true });
});

/** An agent run's record, ended unless told otherwise. */
async function agentRun({
  kind = "agent",
  status = "done",
}: {
  kind?: JobMeta["kind"];
  status?: JobMeta["status"];
} = {}): Promise<string> {
  const id = ulid();
  await writeJobMeta(dir, {
    ...newJobMeta(id, {
      kind,
      label: "Agent: three pulled pork recipes",
      spec: { kind, contentDirectory, prompt: "3 pulled pork recipes" },
      status,
    }),
    ...(status === "done" ? { endedAt: Date.now() } : {}),
  } as JobMeta);
  return id;
}

/** A read token and a write token for one user. */
async function mintBoth(): Promise<{ read: string; write: string }> {
  await writeUser(contentDirectory, { email: EDITOR, password: "hashed" });
  return {
    read: await addTokenToUser(contentDirectory, EDITOR, "notes-read", {
      scope: "read",
    }),
    write: await addTokenToUser(contentDirectory, EDITOR, "notes-write", {
      scope: "write",
    }),
  };
}

function postNote(id: string, body: unknown, token?: string) {
  return noteRoute(
    new Request(`http://editor/api/agent/${id}/note`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function getNotes(id: string, token?: string) {
  return notesRoute(
    new Request(`http://editor/api/agent/${id}/note`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("the note's check", () => {
  const parse = (body: unknown) => ReviewNoteInputSchema.safeParse(body);

  it("takes a verdict and plain text, folding CRLF and trimming", () => {
    const parsed = parse({ verdict: "miss", text: "  one\r\ntwo  " });
    expect(parsed.success && parsed.data).toEqual({
      verdict: "miss",
      text: "one\ntwo",
    });
    expect(
      parse({ verdict: "approved", text: "VRAM < 2 GB, 3<4" }).success,
    ).toBe(true);
  });

  it("refuses HTML, control characters, empty or long text, a bad verdict, case or key", () => {
    for (const text of ["<b>bold</b>", "a </p>", "<!-- x -->", "<script>"]) {
      expect(parse({ verdict: "miss", text }).success).toBe(false);
    }
    expect(parse({ verdict: "miss", text: "bell\u0007" }).success).toBe(false);
    /* Review fix 2: C1 controls and the bidi overrides and isolates. */
    for (const char of ["\u0080", "\u0085", "\u009f", "‪", "‮", "⁦", "⁩"]) {
      expect(parse({ verdict: "miss", text: `a${char}b` }).success).toBe(false);
    }
    expect(
      parse({ verdict: "miss", text: "tabs\tand\nnewlines, é, “quotes” — ok" })
        .success,
    ).toBe(true);
    expect(parse({ verdict: "miss", text: "   " }).success).toBe(false);
    expect(
      parse({ verdict: "miss", text: "x".repeat(REVIEW_NOTE_TEXT_MAX + 1) })
        .success,
    ).toBe(false);
    expect(
      parse({ verdict: "miss", text: "x".repeat(REVIEW_NOTE_TEXT_MAX) })
        .success,
    ).toBe(true);
    expect(parse({ verdict: "great", text: "x" }).success).toBe(false);
    expect(
      parse({ verdict: "miss", text: "x", cases: ["Not A Case"] }).success,
    ).toBe(false);
    expect(parse({ verdict: "miss", text: "x", by: "someone" }).success).toBe(
      false,
    );
    expect(parse({ verdict: "miss", text: "x", html: "<b>" }).success).toBe(
      false,
    );
  });

  it("reads back only a note it can vouch for", () => {
    expect(readStoredNote({ id: "1", by: "you", at: "t", verdict: "x" })).toBe(
      undefined,
    );
    /* Review fix 3: markup or controls in a stored note drop it. */
    for (const text of ["<img src=x onerror=alert(1)>", "a‮b", "a\u0007b"]) {
      expect(
        readStoredNote({ id: "1", by: "you", at: "t", verdict: "miss", text }),
      ).toBe(undefined);
    }
    expect(
      readStoredNote({
        id: "1",
        by: "you",
        at: "t",
        verdict: "rerun",
        text: "ok",
        cases: ["i", "BAD", 3],
      }),
    ).toEqual({
      id: "1",
      by: "you",
      at: "t",
      verdict: "rerun",
      text: "ok",
      cases: ["i"],
    });
  });
});

describe("the store", () => {
  it("keeps notes beside the run, oldest first, Claude Code by default", async () => {
    const id = await agentRun();
    const first = await addReviewNote(
      id,
      {
        verdict: "left-for-you",
        text: "The three imports are new; which to keep is yours.",
      },
      { dir, now: () => new Date("2026-11-28T12:00:00Z") },
    );
    expect(first.note).toMatchObject({
      by: "claude-code",
      at: "2026-11-28T12:00:00.000Z",
      verdict: "left-for-you",
    });
    const second = await addReviewNote(
      id.slice(0, 8),
      {
        verdict: "miss",
        text: "Held a video.",
        by: "you",
        cases: ["i", "i", "j"],
      },
      { dir },
    );
    expect(second.job).toBe(id);
    expect(second.note.cases).toEqual(["i", "j"]);
    expect(second.notes.map((note) => note.verdict)).toEqual([
      "left-for-you",
      "miss",
    ]);
    expect(await readReviewNotes(dir, id)).toEqual(second.notes);
    expect(await listReviewNotes(id, { dir })).toEqual({
      job: id,
      notes: second.notes,
    });
    const file = JSON.parse(await readFile(notesPath(dir, id), "utf8"));
    expect(file.v).toBe(1);
  });

  it("refuses a live run (job_live), a job that is not a run, an unknown id and a bad body", async () => {
    const live = await agentRun({ status: "running" });
    await expect(
      addReviewNote(live, { verdict: "miss", text: "x" }, { dir }),
    ).rejects.toMatchObject({ code: "job_live" });
    const imported = await agentRun({ kind: "import" });
    await expect(
      addReviewNote(imported, { verdict: "miss", text: "x" }, { dir }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      addReviewNote(ulid(), { verdict: "miss", text: "x" }, { dir }),
    ).rejects.toMatchObject({ code: "not_found" });
    const done = await agentRun();
    await expect(
      addReviewNote(done, { verdict: "miss", text: "<i>x</i>" }, { dir }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(await pathExists(notesPath(dir, done))).toBe(false);
  });

  it("keeps at most REVIEW_NOTES_MAX notes, and two writers never lose one", async () => {
    const id = await agentRun();
    await Promise.all(
      Array.from({ length: REVIEW_NOTES_MAX }, (_, index) =>
        addReviewNote(id, { verdict: "rerun", text: `note ${index}` }, { dir }),
      ),
    );
    expect(await readReviewNotes(dir, id)).toHaveLength(REVIEW_NOTES_MAX);
    await expect(
      addReviewNote(id, { verdict: "rerun", text: "one more" }, { dir }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("is in the run view only when there are notes, and is pruned with its run", async () => {
    const id = await agentRun();
    expect(await getAgentRunView(id, { dir })).not.toHaveProperty(
      "reviewNotes",
    );
    await addReviewNote(
      id,
      { verdict: "approved", text: "Approved all three." },
      { dir },
    );
    const view = await getAgentRunView(id, { dir });
    expect(view.reviewNotes).toEqual([
      expect.objectContaining({
        verdict: "approved",
        text: "Approved all three.",
      }),
    ]);
    await pruneJobs(dir, {
      force: true,
      count: 0,
      maxAgeMs: 0,
      now: Date.now() + 1_000,
    });
    expect(await pathExists(notesPath(dir, id))).toBe(false);
  });

  it("drops a hand-edited note with markup from the view, and keeps the good ones", async () => {
    const id = await agentRun();
    await addReviewNote(id, { verdict: "rerun", text: "Busy GPU." }, { dir });
    const file = JSON.parse(await readFile(notesPath(dir, id), "utf8"));
    file.notes.push({
      ...file.notes[0],
      id: "edited",
      text: "<script>alert(1)</script>",
    });
    await writeFile(notesPath(dir, id), JSON.stringify(file));
    expect((await readReviewNotes(dir, id)).map((note) => note.text)).toEqual([
      "Busy GPU.",
    ]);
    expect((await getAgentRunView(id, { dir })).reviewNotes).toHaveLength(1);
  });
});

describe("/api/agent/<id>/note", () => {
  it("is 401 for a guest, 403 for a read token on POST, 201 for a write token and a session", async () => {
    const id = await agentRun();
    auth.mockResolvedValue(null);
    expect((await postNote(id, { verdict: "miss", text: "x" })).status).toBe(
      401,
    );
    expect((await getNotes(id)).status).toBe(401);
    const { read, write } = await mintBoth();
    const refused = await postNote(id, { verdict: "miss", text: "x" }, read);
    expect(refused.status).toBe(403);
    expect((await refused.json()).error.code).toBe("forbidden");

    const made = await postNote(
      id,
      { verdict: "left-for-you", text: "Two fit, one is taste." },
      write,
    );
    expect(made.status).toBe(201);
    expect((await made.json()).note).toMatchObject({
      by: "claude-code",
      verdict: "left-for-you",
    });

    auth.mockResolvedValue({ user: { email: EDITOR } });
    const mine = await postNote(id, {
      verdict: "approved",
      text: "OK",
      by: "you",
    });
    expect(mine.status).toBe(201);

    auth.mockResolvedValue(null);
    const listed = await getNotes(id, read);
    expect(listed.status).toBe(200);
    expect(
      (await listed.json()).notes.map((note: { by: string }) => note.by),
    ).toEqual(["claude-code", "you"]);
    const view = await viewRoute(
      new Request(`http://editor/api/agent/${id}`, {
        headers: { authorization: `Bearer ${read}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect((await view.json()).reviewNotes).toHaveLength(2);
  });

  it("answers 400 with issues for a bad body, 409 for a live run, 404 for no run", async () => {
    const id = await agentRun();
    const bad = await postNote(id, { verdict: "miss", text: "<b>no</b>" });
    expect(bad.status).toBe(400);
    const body = await bad.json();
    expect(body.error.code).toBe("validation");
    expect(JSON.stringify(body.error.issues)).toContain("plain text");
    const live = await agentRun({ status: "running" });
    expect((await postNote(live, { verdict: "miss", text: "x" })).status).toBe(
      409,
    );
    expect(
      (await postNote(ulid(), { verdict: "miss", text: "x" })).status,
    ).toBe(404);
  });
});

describe("recipes agent note", () => {
  function captureStdout(): { text: () => string } {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation(
      (() => true) as typeof process.stderr.write,
    );
    return { text: () => chunks.join("") };
  }

  it("is a subcommand only as the bare word after agent", () => {
    expect(
      splitArgv(["agent", "note", "01ABC", "--verdict", "miss"]),
    ).toMatchObject({
      command: "agent",
      subcommand: "note",
      tail: ["01ABC", "--verdict", "miss"],
    });
    expect(splitArgv(["agent", "note the pie for later"])).toMatchObject({
      command: "agent",
      tail: ["note the pie for later"],
    });
    expect(splitArgv(["agent", "note the pie for later"]).subcommand).toBe(
      undefined,
    );
    expect(splitArgv(["agent", "--json", "note"]).subcommand).toBe(undefined);
  });

  it("adds a note to this machine's store, --json one object", async () => {
    const id = await agentRun();
    const out = captureStdout();
    const code = await main([
      "agent",
      "note",
      id,
      "--verdict",
      "miss",
      "--text",
      "It held a video as one of the three.",
      "--case",
      "i,j",
      "--case",
      "k",
      "--json",
      "--content-dir",
      contentDirectory,
    ]);
    expect(code).toBe(0);
    const result = JSON.parse(out.text().trim());
    expect(result).toMatchObject({
      job: id,
      note: { by: "claude-code", verdict: "miss", cases: ["i", "j", "k"] },
    });
    expect(await readReviewNotes(dir, id)).toHaveLength(1);
  });

  it("refuses a bad verdict, both or neither text, and a bad --by (usage)", async () => {
    const id = await agentRun();
    for (const args of [
      ["--verdict", "great", "--text", "x"],
      ["--verdict", "miss"],
      ["--verdict", "miss", "--text", "x", "--text-file", "-"],
      ["--verdict", "miss", "--text", "x", "--by", "bob"],
    ]) {
      const out = captureStdout();
      const code = await main([
        "agent",
        "note",
        id,
        ...args,
        "--json",
        "--content-dir",
        contentDirectory,
      ]);
      expect(code).toBe(1);
      expect(JSON.parse(out.text().trim()).error.code).toBe("usage");
    }
    expect(await readReviewNotes(dir, id)).toEqual([]);
  });

  describe("over HTTP", () => {
    const ORIGIN = "http://workstation.test:3000";

    function answer(status: number, body: unknown, type = "application/json") {
      const seen: Array<{
        url: string;
        method?: string;
        body?: unknown;
        auth?: string;
      }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          const headers = (init?.headers ?? {}) as Record<string, string>;
          seen.push({
            url: String(input),
            method: init?.method,
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
            auth: headers.authorization,
          });
          return new Response(
            typeof body === "string" ? body : JSON.stringify(body),
            { status, headers: { "content-type": type } },
          );
        }),
      );
      return seen;
    }

    it("posts the note with the token", async () => {
      const seen = answer(201, { job: "01J", note: {}, notes: [] });
      await createHttpBackend({
        baseUrl: ORIGIN,
        token: "rcp_test",
      }).noteAgentRun("01J", { verdict: "approved", text: "OK" });
      expect(seen).toEqual([
        {
          url: `${ORIGIN}/api/agent/01J/note`,
          method: "POST",
          body: { verdict: "approved", text: "OK" },
          auth: "Bearer rcp_test",
        },
      ]);
    });

    it("says an editor without the route predates review notes", async () => {
      answer(
        404,
        "<html>404: This page could not be found.</html>",
        "text/html",
      );
      await expect(
        createHttpBackend({ baseUrl: ORIGIN }).noteAgentRun("01J", {
          verdict: "miss",
          text: "x",
        }),
      ).rejects.toThrow(
        /predates review notes \(51e\).*pnpm workstation update/,
      );
      answer(404, { error: { code: "not_found", message: 'No job "01J"' } });
      await expect(
        createHttpBackend({ baseUrl: ORIGIN }).noteAgentRun("01J", {
          verdict: "miss",
          text: "x",
        }),
      ).rejects.toThrow('No job "01J"');
    });

    it("sends --hold and --claude to POST /api/agent, and hold false without them", async () => {
      const bodies: unknown[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          const url = String(input);
          if (init?.method === "POST") {
            bodies.push(JSON.parse(String(init.body)));
            return Response.json(
              { job: "01J", status: "running" },
              { status: 202 },
            );
          }
          expect(url).toContain("/api/agent/01J");
          return Response.json({
            job: "01J",
            meta: {
              status: "done",
              result: { stopReason: "done", text: "ok" },
            },
            lines: [],
            next: 0,
            live: false,
            transcript: [],
            transcriptNext: 0,
          });
        }),
      );
      const backend = createHttpBackend({ baseUrl: ORIGIN, token: "rcp_test" });
      await backend.runAgent(
        {
          prompt: "plan christmas",
          hold: true,
          model: "claude",
          intent: "auto",
        },
        { pollMs: 1 },
      );
      await backend.runAgent({ prompt: "plan christmas" }, { pollMs: 1 });
      expect(bodies).toEqual([
        {
          prompt: "plan christmas",
          intent: "auto",
          hold: true,
          model: "claude",
        },
        { prompt: "plan christmas", hold: false },
      ]);
    });
  });
});

describe("the runner's score summary", () => {
  const line = (
    model: string,
    ask: string,
    matched: boolean,
    wallMs?: number,
    extra: Partial<RunLine> = {},
  ): RunLine => ({
    model,
    ask,
    matched,
    ...(wallMs !== undefined ? { wallMs } : {}),
    ...extra,
  });

  it("counts passes over the repeats and takes the median time, case × model", () => {
    const lines: RunLine[] = [
      line("qwen3:8b", "e", false, 8_000),
      line("qwen3:8b", "e", false, 24_000),
      line("qwen3:8b", "e", true, 12_000),
      line("qwen3:8b", "f", false, undefined, { elapsedMs: 58_000 }),
      line("qwen3.5:9b", "e", true, 71_000),
      line("qwen3.5:9b", "e", true, 55_000),
      line("qwen3.5:9b", "f", true, 46_000),
      line("qwen3.5:9b", "a", true, 1_000),
    ];
    const summary = summarizeRuns(lines, { only: new Set(["e", "f"]) });
    expect(summary.models).toEqual(["qwen3:8b", "qwen3.5:9b"]);
    expect(summary.cases).toEqual(["e", "f"]);
    expect(summary.cells).toEqual([
      {
        case: "e",
        model: "qwen3:8b",
        runs: 3,
        passed: 1,
        skipped: 0,
        medianMs: 12_000,
      },
      {
        case: "e",
        model: "qwen3.5:9b",
        runs: 2,
        passed: 2,
        skipped: 0,
        medianMs: 63_000,
      },
      {
        case: "f",
        model: "qwen3:8b",
        runs: 1,
        passed: 0,
        skipped: 0,
        medianMs: 58_000,
      },
      {
        case: "f",
        model: "qwen3.5:9b",
        runs: 1,
        passed: 1,
        skipped: 0,
        medianMs: 46_000,
      },
    ]);
    expect(summary.totals).toEqual([
      { model: "qwen3:8b", runs: 4, passed: 1 },
      { model: "qwen3.5:9b", runs: 3, passed: 3 },
    ]);
    expect(formatSummary(summary)).toBe(
      [
        "case   qwen3:8b    qwen3.5:9b",
        "e      1/3 · 12 s  2/2 · 63 s",
        "f      0/1 · 58 s  1/1 · 46 s",
        "total  1/4         3/3",
      ].join("\n"),
    );
  });

  it("counts a skipped run apart, and leaves an empty cell blank", () => {
    const summary = summarizeRuns([
      line("m1", "e", true, 5_000),
      { model: "m2", ask: "d", skipped: "no search" },
    ]);
    expect(summary.cells).toEqual([
      {
        case: "e",
        model: "m1",
        runs: 1,
        passed: 1,
        skipped: 0,
        medianMs: 5_000,
      },
      {
        case: "d",
        model: "m2",
        runs: 0,
        passed: 0,
        skipped: 1,
        medianMs: null,
      },
    ]);
    expect(formatSummary(summary).split("\n")).toEqual([
      "case   m1           m2",
      "e      1/1 · 5.0 s",
      "d                   skipped ×1",
      "total  1/1          0/0",
    ]);
  });

  it("has its small parts right", () => {
    expect(median([])).toBe(null);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2])).toBe(2);
    expect(formatDuration(8_400)).toBe("8.4 s");
    expect(formatDuration(71_400)).toBe("71 s");
    expect(formatDuration(192_000)).toBe("192 s");
    expect(formatDuration(900_000)).toBe("15.0 min");
    expect(summaryPathFor("/x/runs.jsonl")).toBe("/x/runs.summary.json");
    expect(summaryPathFor("/x/runs.out")).toBe("/x/runs.out.summary.json");
    expect(modelList("qwen3:8b, qwen3.5:9b", "qwen3:8b,,gemma")).toEqual([
      "qwen3:8b",
      "qwen3.5:9b",
      "gemma",
    ]);
    expect(modelList(undefined)).toEqual([]);
  });
});
