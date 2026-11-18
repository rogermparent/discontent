// 48c: `/jobs` variant B's words, from the step log and the job records —
// `editor/controller/jobs/story.ts` (the timeline of sentences, "where the
// minute went", a live card's strip and why it waits) and `attention.ts`
// ("Needs a look" grouped by cause, History's rounds folded). Pure helpers:
// hand-written logs on a fixed clock, no store, no model.

import { describe, expect, it } from "vitest";

import type { JobLine } from "../websites/recipe-website/editor/controller/jobs/log";
import {
  jobStory,
  liveStrip,
  timeSplit,
  whyWaiting,
  type StoryJob,
} from "../websites/recipe-website/editor/controller/jobs/story";
import {
  attentionGroups,
  dismissalKey,
  foldRounds,
  kindGroup,
  kindWords,
  type BoardJobLike,
} from "../websites/recipe-website/editor/controller/jobs/attention";

const T0 = Date.parse("2026-11-09T19:59:00.000Z");
const iso = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

interface StepSpec {
  n: number;
  step: string;
  from: number;
  /** Seconds; absent: still running. */
  to?: number;
  parent?: number;
  data?: Record<string, unknown>;
  end?: Record<string, unknown>;
  ok?: boolean;
  error?: string;
}

/** A log from step specs: each a start line and (if it ended) an end line. */
function log(...specs: StepSpec[]): JobLine[] {
  const lines: JobLine[] = [
    { t: iso(0), step: "job", phase: "start", level: "info", n: 0 },
  ];
  for (const spec of specs) {
    const parent = spec.parent ?? 0;
    lines.push({
      t: iso(spec.from),
      step: spec.step,
      phase: "start",
      level: "info",
      n: spec.n,
      parent,
      ...(spec.data ? { data: spec.data } : {}),
    });
    if (spec.to !== undefined) {
      lines.push({
        t: iso(spec.to),
        step: spec.step,
        phase: "end",
        level: spec.ok === false ? "error" : "info",
        n: spec.n,
        parent,
        ms: Math.round((spec.to - spec.from) * 1000),
        ok: spec.ok ?? true,
        ...(spec.end ? { data: spec.end } : {}),
        ...(spec.error ? { error: spec.error } : {}),
      });
    }
  }
  return lines.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

/* A URL import: the page, the GPU's line, the model (loading first), the
 * polite gap before the picture, the picture, the write. */
const IMPORT = log(
  {
    n: 1,
    step: "fetch",
    from: 0,
    to: 0.4,
    data: { host: "www.example.com" },
    end: { status: 200, bytes: 86_016 },
  },
  {
    n: 2,
    step: "parse",
    from: 0.4,
    to: 0.45,
    end: { schema: true, ingredients: 10, steps: 7 },
  },
  { n: 3, step: "llm.extract", from: 0.45, to: 20 },
  {
    n: 4,
    step: "queue.wait",
    from: 0.45,
    to: 3.45,
    parent: 3,
    data: { resource: "gpu", tier: "interactive", position: 1 },
  },
  {
    n: 5,
    step: "pace.wait",
    from: 20,
    to: 34.6,
    data: { site: "example.com", gapMs: 15_000, waitMs: 14_600 },
  },
  {
    n: 6,
    step: "image",
    from: 34.6,
    to: 35,
    data: { host: "www.example.com", mode: "get" },
    end: { bytes: 120_000 },
  },
  { n: 7, step: "write", from: 35, to: 35.2, data: { slug: "pie" } },
).map((line) =>
  /* The model's numbers on its end line. */
  line.n === 3 && line.phase === "end"
    ? {
        ...line,
        data: {
          model: "qwen3:8b",
          total: 12,
          grounded: 12,
          outputTokens: 410,
          loadMs: 9_000,
        },
      }
    : line,
);

const IMPORT_JOB: StoryJob = {
  kind: "import-url",
  status: "done",
  start: T0,
  end: T0 + 35_300,
};

/* A curator run: a search, a page behind the polite gap that answered
 * 404, then the answer. */
const AGENT = log(
  { n: 1, step: "agent.turn", from: 0, to: 3, data: { turn: 1 } },
  { n: 2, step: "recipe_search", from: 3, to: 3.05, data: { turn: 1 } },
  { n: 3, step: "agent.turn", from: 3.05, to: 7.9, data: { turn: 2 } },
  { n: 4, step: "web_fetch", from: 7.9, to: 24, data: { turn: 2 } },
  {
    n: 5,
    step: "pace.wait",
    from: 7.9,
    to: 22.5,
    parent: 4,
    data: { site: "example.com", gapMs: 15_000, waitMs: 14_600 },
  },
  {
    n: 6,
    step: "fetch",
    from: 22.5,
    to: 24,
    parent: 4,
    data: { host: "example.com" },
    end: { status: 404, bytes: 512 },
    ok: false,
    error: "HTTP 404",
  },
  {
    n: 7,
    step: "agent.turn",
    from: 24,
    to: 31,
    data: { turn: 3 },
    end: { outputTokens: 490 },
  },
);

const AGENT_JOB: StoryJob = {
  kind: "agent",
  status: "done",
  start: T0,
  end: T0 + 31_000,
  model: "claude-sonnet-5",
};

describe("jobStory: what it did, in sentences", () => {
  it("tells an import step by step, its waits on lines of their own", () => {
    const story = jobStory(IMPORT, IMPORT_JOB);
    expect(story.map((line) => line.title)).toEqual([
      "Read www.example.com",
      "Found the recipe card",
      "Waited 3.0 s for the GPU",
      "Model reads the recipe",
      "Waited 14.6 s for example.com",
      "Downloaded the picture from www.example.com",
      "Saved pie",
      "Done",
    ]);
    const [read, found, gpu, model, gap, picture, , done] = story;
    expect(read).toMatchObject({
      step: "fetch",
      status: "ok",
      tone: "step",
      atMs: 0,
      detail: "200 · 84 kB",
    });
    expect(found.detail).toBe("10 ingredients, 7 steps");
    expect(gpu).toMatchObject({
      step: "queue.wait",
      tone: "wait",
      ms: 3_000,
      detail: "next in line when it joined",
    });
    /* After its wait for the GPU, and only its own time. */
    expect(model).toMatchObject({
      step: "llm.extract",
      tone: "model",
      atMs: 3_450,
      ms: 16_550,
      detail: "qwen3:8b · 12/12 lines found in the text · 410 tokens",
      aside: "9.0 s of that was loading qwen3:8b onto the GPU.",
    });
    expect(gap).toMatchObject({
      tone: "wait",
      detail: "its polite gap: one request every 15 s",
      waitShare: 1,
    });
    expect(gpu.waitShare).toBeCloseTo(3 / 14.6, 3);
    expect(picture.detail).toBe("117 kB");
    expect(done).toMatchObject({ step: "job", tone: "end", atMs: 35_300 });
  });

  it("tells a curator run by its tools, the turns folded, a 404 as a failure", () => {
    const story = jobStory(AGENT, AGENT_JOB);
    expect(story.map((line) => [line.step, line.title, line.tone])).toEqual([
      ["job", "Asked claude-sonnet-5", "model"],
      ["recipe_search", "Searched your recipes", "tool"],
      ["pace.wait", "Waited 14.6 s for example.com", "wait"],
      ["web_fetch", "example.com answered HTTP 404 (not found)", "fail"],
      ["agent.turn", "Wrote the answer", "model"],
      ["job", "Done", "end"],
    ]);
    expect(story[1].detail).toBe("turn 1");
    expect(story[3]).toMatchObject({
      status: "failed",
      atMs: 22_500,
      detail: "Fetched a page · nothing read",
    });
    expect(story[4].detail).toBe("turn 3 · 490 tokens");
  });

  it("ends on how the job ended, and not at all while it runs", () => {
    const failed = jobStory(IMPORT.slice(0, 3), {
      ...IMPORT_JOB,
      status: "failed",
      error: { code: "import_failed", message: "No recipe found" },
    });
    expect(failed.at(-1)).toMatchObject({
      title: "Failed",
      detail: "No recipe found",
      tone: "fail",
    });
    expect(
      jobStory(IMPORT, { ...IMPORT_JOB, status: "cancelled" }).at(-1),
    ).toMatchObject({ title: "Stopped", tone: "end" });
    expect(
      jobStory(IMPORT, {
        ...IMPORT_JOB,
        nothing: "example.com answered HTTP 404 (not found): nothing was read.",
      }).at(-1),
    ).toMatchObject({ title: "Ended, having read nothing", tone: "fail" });
    const early = IMPORT.filter((line) => Date.parse(line.t) <= T0 + 2_000);
    const live = jobStory(
      early,
      {
        ...IMPORT_JOB,
        status: "running",
        end: undefined,
      },
      T0 + 2_000,
    );
    expect(live.map((line) => line.step)).not.toContain("job");
    expect(live.at(-1)).toMatchObject({
      title: "Waiting for the GPU",
      status: "running",
    });
  });
});

describe("timeSplit: where the minute went", () => {
  it("splits a curator run by kind, nothing counted twice", () => {
    const split = timeSplit(AGENT, AGENT_JOB);
    expect(split.totalMs).toBe(31_000);
    expect(split.parts.map((part) => [part.key, part.ms, part.label])).toEqual([
      ["model", 14_850, "the model, 3 turns"],
      ["wait", 14_600, "waiting for example.com, 1 polite gap"],
      ["fetch", 1_500, "fetching"],
    ]);
    expect(split.parts[0].share).toBeCloseTo(14_850 / 31_000, 5);
    expect(split.note).toBe(
      "47% of it was waiting: example.com gets one request every 15 s, the polite gap.",
    );
  });

  it("counts a job's untracked time as everything else, and says nothing of short waits", () => {
    const split = timeSplit(IMPORT, { ...IMPORT_JOB, end: T0 + 40_000 });
    const by = Object.fromEntries(
      split.parts.map((part) => [part.key, part.ms]),
    );
    expect(by).toMatchObject({
      model: 16_550,
      wait: 17_600,
      fetch: 800,
      /* The parse's 50 ms, and what no step covers. */
      other: 4_850,
    });
    /* The write's 200 ms is under 1 % of it: left out. */
    expect(by.save).toBeUndefined();
    expect(split.parts.find((part) => part.key === "wait")?.label).toBe(
      "waiting for example.com and the GPU, 1 polite gap",
    );
    const quick = timeSplit(IMPORT.slice(0, 5), { start: T0, end: T0 + 500 });
    expect(quick.note).toBeUndefined();
  });
});

describe("a live job: its strip, and why it waits", () => {
  const running = log(
    { n: 1, step: "agent.turn", from: 0, to: 3, data: { turn: 1 } },
    { n: 2, step: "recipe_search", from: 3, to: 3.05, data: { turn: 1 } },
    { n: 3, step: "recipe_search", from: 3.05, to: 3.1, data: { turn: 1 } },
    { n: 4, step: "web_fetch", from: 3.1, data: { turn: 1 } },
    {
      n: 5,
      step: "pace.wait",
      from: 3.1,
      parent: 4,
      data: { site: "example.com", gapMs: 15_000, waitMs: 15_000 },
    },
  );
  const job = { kind: "agent", status: "running", start: T0 };

  it("folds a run of one step into one item, the running one now", () => {
    expect(liveStrip(running, job, T0 + 9_000)).toEqual([
      {
        step: "recipe_search",
        title: "Searched your recipes ×2",
        status: "ok",
      },
      { step: "web_fetch", title: "Fetched a page", status: "now" },
    ]);
  });

  it("says the polite pause for a site and when it ends", () => {
    const why = whyWaiting(
      { id: "J1", status: "running" },
      running,
      [],
      T0 + 9_100,
    );
    expect(why).toEqual({
      lead: "Waiting 9.0 s for example.com.",
      rest: "A site gets one request every 15 s: the polite pause.",
      untilAt: T0 + 18_100,
    });
  });

  it("says its place in a line, and who holds it", () => {
    const queue = [
      {
        resource: "gpu",
        holder: { jobId: "J0", label: 'ask: "find two pies"' },
        waiters: [{ jobId: "J9" }, { jobId: "J1" }],
      },
    ];
    expect(
      whyWaiting(
        {
          id: "J1",
          status: "running",
          waiting: { resource: "gpu", position: 2 },
        },
        [],
        queue,
        T0,
      ),
    ).toEqual({
      lead: "2nd in line for the GPU, behind “find two pies”.",
      rest: "One model call at a time on this machine; your own imports go before batch work.",
    });
    expect(
      whyWaiting(
        {
          id: "J1",
          status: "running",
          waiting: { resource: "site:example.com", position: 1 },
        },
        [],
        [
          {
            resource: "site:example.com",
            holder: { label: "example.com/r/pie" },
            waiters: [],
          },
        ],
        T0,
      ).lead,
    ).toBe("Next in line for example.com, behind “example.com/r/pie”.");
    expect(
      whyWaiting(
        {
          id: "J1",
          status: "running",
          waiting: { resource: "repo:recipe-content-1a2b3c4d", position: 1 },
        },
        [],
        [],
        T0,
      ).lead,
    ).toBe("Next in line for the recipe-content repository.");
  });

  it("says what a model step holds and who waits behind it", () => {
    const model = log({ n: 1, step: "llm.extract", from: 0 });
    const queue = [
      { resource: "gpu", holder: { jobId: "J1" }, waiters: [{ jobId: "J2" }] },
    ];
    expect(
      whyWaiting({ id: "J1", status: "running" }, model, queue, T0 + 1_000),
    ).toEqual({
      lead: "Model reads the recipe: holding the GPU.",
      rest: "1 job is waiting behind it.",
    });
    expect(
      whyWaiting(
        { id: "J1", status: "running" },
        model,
        [{ resource: "gpu", holder: { jobId: "J1" }, waiters: [] }],
        T0,
      ).rest,
    ).toBe("Nothing is waiting behind it.");
    expect(whyWaiting({ id: "J1", status: "queued" }, [], [], T0).lead).toBe(
      "Queued: it starts as soon as its process picks it up.",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Needs a look, and History                                            */
/* ------------------------------------------------------------------ */

let seq = 0;
function job(patch: Partial<BoardJobLike> & { at: number }): BoardJobLike {
  seq += 1;
  const { at, ...rest } = patch;
  return {
    id: `J${String(seq).padStart(3, "0")}`,
    kind: "import-url",
    label: rest.url ?? `job ${seq}`,
    status: "done",
    queuedAt: T0 + at * 1000,
    startedAt: T0 + at * 1000,
    endedAt: T0 + at * 1000 + 2_000,
    durationMs: 2_000,
    ...rest,
  };
}

describe("attentionGroups: what didn't work, by cause", () => {
  it("groups a site's wall, notices the paste that worked, and offers the next step", () => {
    const walled = [1, 2, 3].map((n) =>
      job({
        at: n * 30,
        status: "failed",
        url: `https://walled.test/jam-${n}`,
        error: {
          code: "import_failed",
          message: `Could not fetch https://walled.test/jam-${n}: HTTP 402`,
        },
      }),
    );
    const pasted = job({
      at: 200,
      kind: "form-text",
      url: "https://www.walled.test/jam-3/",
      name: "Tomato Jam",
    });
    const groups = attentionGroups([...walled, pasted]);
    expect(groups).toHaveLength(1);
    const [group] = groups;
    expect(group).toMatchObject({
      key: "wall:402:walled.test",
      title:
        "walled.test answered HTTP 402 (payment required) to 3 URL imports",
      next: { label: "Paste the text", href: "/new-recipe" },
      newest: walled[2].id,
    });
    expect(group.open.map((item) => item.job.id)).toEqual([
      walled[1].id,
      walled[0].id,
    ]);
    expect(group.resolved).toEqual([{ job: walled[2], resolvedBy: pasted }]);
    expect(dismissalKey(group)).toBe(`wall:402:walled.test@${walled[2].id}`);
    /* One left open: the button names its page. */
    expect(attentionGroups([walled[0], pasted])[0].next).toEqual({
      label: "Paste jam-1",
      href: "/new-recipe",
    });
  });

  it("puts every 404 in one group, with the list behind a button", () => {
    const gone = [
      job({
        at: 10,
        kind: "inspect",
        url: "https://a.test/x",
        httpStatus: 404,
        outcome: { kind: "nothing", note: "a.test answered HTTP 404" },
      }),
      job({
        at: 20,
        kind: "inspect",
        url: "https://b.test/y",
        httpStatus: 404,
        outcome: { kind: "nothing", note: "b.test answered HTTP 404" },
      }),
      job({
        at: 30,
        kind: "inspect",
        url: "https://a.test/z",
        status: "failed",
        error: { code: "import_failed", message: "a.test answered HTTP 404" },
      }),
    ];
    const [group] = attentionGroups(gone);
    expect(group).toMatchObject({
      key: "gone",
      title: "3 pages answered 404",
      detail: "Addresses that don't exist (any more): a.test ×2, b.test.",
      next: { label: "Show the 3", show: true },
    });
  });

  it("drops what a later read put right, and never lists the cancelled or the live", () => {
    const missed = job({
      at: 0,
      kind: "inspect",
      url: "https://c.test/pie",
      httpStatus: 404,
      outcome: { kind: "nothing", note: "c.test answered HTTP 404" },
    });
    const found = job({ at: 30, kind: "inspect", url: "http://c.test/pie" });
    expect(
      attentionGroups([
        missed,
        found,
        job({ at: 40, status: "cancelled", error: { message: "cancelled" } }),
        job({ at: 50, status: "running" }),
      ]),
    ).toEqual([]);
  });

  it("names a process that ended, and any other failure by its kind", () => {
    const stopped = job({ at: 0, status: "interrupted" });
    const broken = job({
      at: 10,
      kind: "fill",
      status: "failed",
      error: { code: "internal", message: "The model answered nothing." },
    });
    const groups = attentionGroups([stopped, broken]);
    expect(groups.map((group) => [group.title, group.next])).toEqual([
      [
        "Fill from the source failed",
        { label: "Open it", href: `/jobs/${broken.id}` },
      ],
      [
        "1 job stopped when its process did",
        { label: "Open it", href: `/jobs/${stopped.id}` },
      ],
    ]);
    expect(groups[0].detail).toBe("The model answered nothing.");
  });
});

describe("foldRounds: History, a round in one row", () => {
  it("folds one kind's jobs less than ten minutes apart, newest first", () => {
    const round = [0, 60, 120, 180].map((at, n) =>
      job({
        at,
        kind: "inspect",
        url: `https://drinks.test/r/${n}`,
        name: ["Shandy", "Agua Fresca", "Michelada", "Egg Cream"][n],
        ...(n === 2
          ? {
              httpStatus: 404,
              outcome: { kind: "nothing", note: "404" },
            }
          : {}),
      }),
    );
    const earlier = job({
      at: -1_500,
      kind: "import-url",
      url: "https://cooking.test/soup",
      name: "Cranberry Carrot Soup",
    });
    const rows = foldRounds([
      ...round,
      earlier,
      job({ at: 400, status: "running" }),
    ]);
    expect(rows.map((row) => row.title)).toEqual([
      "4 inspects · drinks.test",
      "Cranberry Carrot Soup",
    ]);
    expect(rows[0]).toMatchObject({
      key: round[0].id,
      kind: "inspect",
      detail: "Shandy · Agua Fresca · Michelada · Egg Cream",
      state: "1 not found",
      tone: "none",
      at: T0,
      durationMs: 182_000,
    });
    expect(rows[0].jobs.map((entry) => entry.id)).toEqual(
      [...round].reverse().map((entry) => entry.id),
    );
    expect(rows[1]).toMatchObject({
      detail: "URL import · cooking.test",
      state: "done",
      tone: "ok",
      durationMs: 2_000,
    });
  });

  it("starts a new round after a ten-minute gap or another kind, and sums a round's cost", () => {
    const rows = foldRounds([
      job({ at: 0, kind: "agent", label: 'ask: "a"', costUsd: 0.1 }),
      job({ at: 100, kind: "agent", label: 'ask: "b"', costUsd: 0.18 }),
      job({ at: 800, kind: "agent", label: 'ask: "c"' }),
      job({ at: 900, kind: "git-sync", label: "sync with uraninite (manual)" }),
    ]);
    expect(rows.map((row) => [row.title, row.state])).toEqual([
      ["sync with uraninite (manual)", "done"],
      ['ask: "c"', "done"],
      ["2 curator runs · $0.28", "done"],
    ]);
  });

  it("says a round's failures, and all read when every inspect read", () => {
    const failed = foldRounds([
      job({ at: 0 }),
      job({ at: 10, status: "failed", error: { message: "x" } }),
    ]);
    expect(failed[0]).toMatchObject({ state: "1 failed", tone: "fail" });
    const read = foldRounds([
      job({ at: 0, kind: "inspect" }),
      job({ at: 10, kind: "inspect" }),
    ]);
    expect(read[0].state).toBe("all read");
  });
});

describe("kind words", () => {
  it("names each kind, one and many, and files it under B's filters", () => {
    expect(kindWords("form-text")).toBe("paste import");
    expect(kindWords("inspect", 31)).toBe("31 inspects");
    expect(kindWords("brand-new")).toBe("brand-new");
    expect(
      ["form-url", "inspect-list", "agent", "fill", "reindex", "git-sync"].map(
        kindGroup,
      ),
    ).toEqual(["imports", "inspects", "curator", "curator", "repo", "repo"]);
  });
});
