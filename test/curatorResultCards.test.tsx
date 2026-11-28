import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

/*
 * 51d review 2–4: `/curator`'s result cards against a stubbed editor (`fetch`
 * routed per path: no editor, no model). Pinned: a decided card never goes
 * back to pending when an older answer lands (`keepDecided`); a refused
 * decision says why on its card and reads the review again; the cards and
 * the review panel never save at once; a run that held nothing settles
 * (written as it ran, or not held), never "Reading what it holds…"; and
 * asking again with another intent keeps the run's newer web tools.
 */

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) => (
    <a href={href}>{children as never}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
}));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { CuratorApp } =
  await import("../websites/recipe-website/editor/src/curator/CuratorApp");
const { keepDecided } =
  await import("../websites/recipe-website/editor/src/curator/ReviewPanel");
type CuratorReview =
  import("../websites/recipe-website/editor/controller/agent/review").CuratorReview;

afterEach(() => {
  vi.unstubAllGlobals();
});

const RUN = "01JD51DCARDS000000000000001";
const T0 = "2026-11-28T10:00:00.000Z";

const PIE = {
  url: "https://example.com/apple-pie",
  name: "Apple Pie",
  slug: "apple-pie",
};
const TART = {
  url: "https://example.com/pear-tart",
  name: "Pear Tart",
  slug: "pear-tart",
};

interface Held {
  id: string;
  tool: string;
  phrase: string;
  input: Record<string, unknown>;
  held: Record<string, unknown>;
}

const IMPORTS: Held[] = [
  {
    id: "call_plan_6",
    tool: "recipe_import",
    phrase: "Import a recipe from example.com",
    input: { url: PIE.url },
    held: { url: PIE.url, slug: PIE.slug, name: PIE.name },
  },
  {
    id: "call_plan_7",
    tool: "recipe_import",
    phrase: "Import a recipe from example.com",
    input: { url: TART.url },
    held: { url: TART.url, slug: TART.slug, name: TART.name },
  },
];
/* A held write no card applies: the review panel shows it. */
const TAG: Held = {
  id: "call_plan_8",
  tool: "recipe_update",
  phrase: "Update Existing Recipe",
  input: { slug: "existing-recipe", recipe: { name: "Existing Recipe" } },
  held: { slug: "existing-recipe" },
};

function view({
  held,
  hold,
  newerWebTools = false,
}: {
  held: Held[];
  hold: boolean;
  newerWebTools?: boolean;
}) {
  const prompt = "2 fruit desserts I don't already have";
  const intent = {
    id: "online",
    by: "rules",
    why: "you asked for recipes you don't have",
  };
  const transcript: Record<string, unknown>[] = [
    {
      t: T0,
      type: "start",
      job: RUN,
      model: "claude-sonnet-5",
      api: "anthropic",
      tools: ["recipe_import"],
      ...(hold ? { hold: true } : {}),
      intent,
    },
    {
      t: T0,
      type: "message",
      job: RUN,
      message: { role: "user", text: prompt },
    },
  ];
  for (const call of held) {
    transcript.push(
      {
        t: T0,
        type: "message",
        job: RUN,
        message: {
          role: "assistant",
          text: "",
          toolCalls: [{ id: call.id, name: call.tool, input: call.input }],
        },
      },
      {
        t: T0,
        type: "message",
        job: RUN,
        message: {
          role: "tool",
          toolCallId: call.id,
          name: call.tool,
          content: JSON.stringify({ held: true }),
          held: call.held,
        },
      },
    );
  }
  const answer = "Two new fruit desserts.";
  transcript.push(
    {
      t: T0,
      type: "message",
      job: RUN,
      message: { role: "assistant", text: answer, toolCalls: [] },
    },
    {
      t: T0,
      type: "end",
      job: RUN,
      stop: "done",
      model: "claude-sonnet-5",
      api: "anthropic",
      turns: 2,
      toolCalls: held.length,
      trimmed: 0,
      durationMs: 1_000,
    },
  );
  return {
    job: RUN,
    live: false,
    lines: [],
    next: 0,
    transcript,
    transcriptNext: transcript.length,
    meta: {
      id: RUN,
      kind: "agent",
      label: `ask: ${prompt}`,
      status: "done",
      queuedAt: Date.parse(T0),
      startedAt: Date.parse(T0),
      endedAt: Date.parse(T0) + 1_000,
      spec: {
        kind: "agent",
        prompt,
        intent: "auto",
        ...(hold ? { hold: true } : {}),
        ...(newerWebTools ? { newerWebTools: true } : {}),
      },
      result: {
        text: answer,
        stopReason: "done",
        intent,
        outcome: {
          kind: "online",
          subject: "fruit desserts",
          count: 2,
          proposed: [PIE, TART],
          close: [],
          had: [],
        },
      },
    },
  };
}

function reviewOf(held: Held[], states: Map<string, string>): CuratorReview {
  const calls = held.map((call) => ({
    id: call.id,
    job: RUN,
    tool: call.tool,
    phrase: call.phrase,
    input: call.input,
    held: call.held,
    state: states.get(call.id) ?? "pending",
  }));
  return {
    calls,
    pending: calls.filter((call) => call.state === "pending").length,
    live: false,
  } as unknown as CuratorReview;
}

/**
 * The editor, stubbed: the run view, its review (GET and POST, `onPost`
 * deciding each POST's answer), no changes, and `POST /api/agent`.
 */
function stubEditor(
  run: ReturnType<typeof view>,
  held: Held[],
  onPost?: (
    decisions: { call: string; apply: boolean }[],
    states: Map<string, string>,
  ) => Promise<Response | undefined> | Response | undefined,
) {
  const states = new Map<string, string>();
  const seen = {
    reviewReads: 0,
    posts: [] as unknown[],
    started: [] as unknown[],
  };
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), "http://editor");
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/agent" && method === "POST") {
        seen.started.push(JSON.parse(String(init?.body)));
        return Response.json(
          { job: "01NEW", status: "running" },
          { status: 202 },
        );
      }
      if (url.pathname === `/api/agent/${RUN}/review`) {
        if (method === "POST") {
          const body = JSON.parse(String(init?.body)) as {
            decisions: { call: string; apply: boolean }[];
          };
          seen.posts.push(body);
          const answer = await onPost?.(body.decisions, states);
          if (answer) return answer;
          for (const decision of body.decisions) {
            states.set(decision.call, decision.apply ? "applied" : "discarded");
          }
          return Response.json(reviewOf(held, states));
        }
        seen.reviewReads += 1;
        return Response.json(reviewOf(held, states));
      }
      if (url.pathname === `/api/agent/${RUN}/changes`) {
        return Response.json({ error: { message: "none" } }, { status: 404 });
      }
      if (url.pathname === `/api/agent/${RUN}`) {
        const from = Number(url.searchParams.get("transcriptFrom") ?? 0);
        return Response.json({
          ...run,
          transcript: run.transcript.slice(from),
        });
      }
      throw new Error(`unexpected ${method} ${url.pathname}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { states, seen };
}

function renderRun() {
  return render(
    <CuratorApp
      setup={{
        model: "Claude Sonnet 5 through the API",
        api: "anthropic",
        search: true,
        newerWebTools: true,
      }}
      runs={[]}
      run={RUN}
      maxPrompt={4_000}
      maxTurns={40}
    />,
  );
}

const cards = () => screen.findAllByTestId("curator-online-card");

describe("a card's decision (51d review 2)", () => {
  it("is never undone by an older answer", () => {
    const states = new Map([["call_plan_6", "applied"]]);
    const decided = reviewOf(IMPORTS, states);
    const stale = reviewOf(IMPORTS, new Map());
    const kept = keepDecided(decided, stale);
    expect(kept.calls.map((call) => call.state)).toEqual([
      "applied",
      "pending",
    ]);
    expect(kept.pending).toBe(1);
    /* Newer news still lands. */
    const later = reviewOf(
      IMPORTS,
      new Map([
        ["call_plan_6", "applied"],
        ["call_plan_7", "discarded"],
      ]),
    );
    expect(keepDecided(decided, later)).toBe(later);
    expect(keepDecided(undefined, stale)).toBe(stale);
  });

  it("says why on its card when refused, applies nothing, and reads the review again", async () => {
    const run = view({ held: IMPORTS, hold: true });
    const { seen, states } = stubEditor(run, IMPORTS, () =>
      Response.json(
        {
          error: {
            code: "validation",
            message: "Import a recipe from example.com was already reviewed.",
          },
        },
        { status: 400 },
      ),
    );
    renderRun();
    const [pie] = await cards();
    const importPie = await within(pie).findByRole("button", {
      name: "Import Apple Pie",
    });
    await waitFor(() => expect(seen.reviewReads).toBe(1));
    await act(async () => {
      fireEvent.click(importPie);
    });
    expect(await within(pie).findByRole("alert")).toHaveTextContent(
      "Import a recipe from example.com was already reviewed.",
    );
    expect(states.size).toBe(0);
    expect(pie).toHaveAttribute("data-state", "pending");
    await waitFor(() => expect(seen.reviewReads).toBe(2));
    expect(
      within(pie).getByRole("button", { name: "Import Apple Pie" }),
    ).toBeEnabled();
  });

  it("waits while the review panel saves, and the panel waits for a card", async () => {
    const held = [...IMPORTS, TAG];
    const run = view({ held, hold: true });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { seen } = stubEditor(run, held, async (decisions) => {
      if (decisions[0]?.call === "call_plan_6") await gate;
      return undefined;
    });
    renderRun();
    const [pie, tart] = await cards();
    const panel = await screen.findByTestId("curator-review");
    const save = await within(panel).findByRole("button", {
      name: "Save 1 change",
    });
    expect(save).toBeEnabled();

    /* A card saving: the panel waits. */
    act(() => {
      fireEvent.click(
        within(pie).getByRole("button", { name: "Import Apple Pie" }),
      );
    });
    await waitFor(() => expect(save).toBeDisabled());
    expect(
      within(tart).getByRole("button", { name: "Import Pear Tart" }),
    ).toBeDisabled();
    await act(async () => {
      release();
      await gate;
    });
    await waitFor(() => expect(save).toBeEnabled());
    expect(pie).toHaveAttribute("data-state", "applied");

    /* The panel saving: the cards wait. */
    let releasePanel: () => void = () => {};
    const panelGate = new Promise<void>((resolve) => {
      releasePanel = resolve;
    });
    vi.mocked(fetch).mockClear();
    const { seen: later } = stubEditor(run, held, async (decisions, states) => {
      if (decisions[0]?.call === "call_plan_8") await panelGate;
      states.set("call_plan_6", "applied");
      return undefined;
    });
    act(() => {
      fireEvent.click(save);
    });
    await waitFor(() =>
      expect(
        within(tart).getByRole("button", { name: "Import Pear Tart" }),
      ).toBeDisabled(),
    );
    await act(async () => {
      releasePanel();
      await panelGate;
    });
    await waitFor(() =>
      expect(
        within(tart).getByRole("button", { name: "Import Pear Tart" }),
      ).toBeEnabled(),
    );
    expect(seen.posts).toHaveLength(1);
    expect(later.posts).toEqual([
      { decisions: [{ call: "call_plan_8", apply: true }] },
    ]);
    /* The first card stays applied. */
    expect(pie).toHaveAttribute("data-state", "applied");
  });
});

describe("a run that held nothing (51d review 3)", () => {
  it("shows what it wrote as written, when it didn't hold", async () => {
    stubEditor(view({ held: [], hold: false }), []);
    renderRun();
    const [pie, tart] = await cards();
    for (const card of [pie, tart]) {
      expect(card).toHaveAttribute("data-state", "written");
      expect(within(card).getByTestId("curator-card-state")).toHaveTextContent(
        "Imported. Open it",
      );
      expect(within(card).queryByRole("button")).toBeNull();
    }
    expect(screen.getByTestId("curator-results")).toHaveTextContent(
      "Imported 2 new",
    );
    expect(screen.queryByText("Reading what it holds…")).toBeNull();
  });

  it("says a held run's card isn't held, never reading", async () => {
    const { seen } = stubEditor(view({ held: [], hold: true }), []);
    renderRun();
    const [pie] = await cards();
    expect(within(pie).getByTestId("curator-card-state")).toHaveTextContent(
      "Not held for review.",
    );
    expect(seen.reviewReads).toBe(0);
  });
});

describe("asking again with another intent (51d review 4)", () => {
  it("keeps the run's newer web tools", async () => {
    const { seen } = stubEditor(
      view({ held: [], hold: true, newerWebTools: true }),
      [],
    );
    renderRun();
    const row = await screen.findByTestId("curator-run-intents");
    const organize = within(row).getByRole("button", {
      name: "Organize and tag",
    });
    await waitFor(() => expect(organize).toBeEnabled());
    await act(async () => {
      fireEvent.click(organize);
    });
    await waitFor(() => expect(seen.started).toHaveLength(1));
    expect(seen.started[0]).toEqual({
      prompt: "2 fruit desserts I don't already have",
      newerWebTools: true,
      intent: "organize",
      hold: true,
    });
  });
});
