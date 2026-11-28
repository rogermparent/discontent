/**
 * An intent's plan as `/curator` shows it (51d): the steps the plan takes,
 * in words — before an ask (what it will do) and while it runs (where it
 * is), read from the job's top-level step lines.
 *
 * A plan's tools are steps named by the tool (`recipe_search`, `web_search`,
 * `page_inspect`, `recipe_import`, `holiday_get`, `group_create`, each with
 * `plan: true`), its model calls are `llm.intent` steps whose `task` names
 * them (51b), and the judge's chunks are `llm.judge` steps with a `judge`
 * note that tallies them (51c). Each step of the page's list matches some
 * of those lines; a step that logs nothing (code deciding, "Skip what you
 * have") is done once a later step has started.
 *
 * Pure and browser-safe (types only from the job log).
 */
import type { JobLine } from "../jobs/log";
import type { AgentIntent } from "./intents/guess";

/** Who does a step: code, the model, or a web search. */
export type PlanStepWho = "code" | "model" | "web";

export const PLAN_STEP_WHO_WORDS: Readonly<Record<PlanStepWho, string>> = {
  code: "code",
  model: "the model",
  web: "web search",
};

interface StepDef {
  key: string;
  title: string;
  /** What it does, in a few words (the page's preview, before an ask). */
  about: string;
  who: PlanStepWho;
  /** Which top-level started steps are this one's; none: code, unlogged. */
  match?: (step: string, data: Record<string, unknown>) => boolean;
  /** A step the plan may not need ("Pick the best" when few are left). */
  optional?: boolean;
  /** Its detail from what ran: "3 searches", "4 pages read, 1 failed". */
  detail?: (stats: StepStats) => string | undefined;
}

/** What ran of one step of the list. */
export interface StepStats {
  started: number;
  ok: number;
  failed: number;
  open: number;
  /** The judge's tally note ("5 fit, 1 maybe, 12 no"), when it logged one. */
  tally?: string;
}

const tool =
  (name: string) =>
  (step: string): boolean =>
    step === name;
const task =
  (name: string) =>
  (step: string, data: Record<string, unknown>): boolean =>
    step === "llm.intent" && data.task === name;
const judge = (step: string): boolean => step === "llm.judge";

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function withFailed(text: string, stats: StepStats): string {
  return stats.failed > 0 ? `${text}, ${stats.failed} failed` : text;
}

/** The classify call, before the plan: only when the model decides (51b). */
const CLASSIFY: StepDef = {
  key: "classify",
  title: "Decide what kind of ask it is",
  about: "the words didn't say, so the model picks",
  who: "model",
  match: task("classify"),
};

/**
 * The plans, step by step (the mock-up's "What it will do", true to
 * `online.ts`, `mine.ts` and `plan.ts`). `organize` and `any` are the open
 * loop: the model chooses its tools, so their steps are a preview only.
 */
const PLANS: Readonly<Record<AgentIntent, readonly StepDef[]>> = {
  online: [
    {
      key: "read",
      title: "Read the ask",
      about: "what you want, how many, and any conditions",
      who: "model",
      match: task("read the ask"),
    },
    {
      key: "have",
      title: "Check what you have",
      about: "your recipes on the subject, and every name you have",
      who: "code",
      match: tool("recipe_search"),
    },
    {
      key: "web",
      title: "Search the web",
      about: "Sally's Baking Addiction first, then the rest",
      who: "web",
      match: tool("web_search"),
      detail: (stats) =>
        withFailed(count(stats.started, "search", "searches"), stats),
    },
    {
      key: "skip",
      title: "Skip what you have",
      about:
        "the same page, or a name close to one of yours, is marked rather than counted",
      who: "code",
    },
    {
      key: "pages",
      title: "Read the best pages",
      about: "up to 6 that look like real recipes, one at a time",
      who: "code",
      match: tool("page_inspect"),
      detail: (stats) => withFailed(count(stats.ok, "page") + " read", stats),
    },
    {
      key: "pick",
      title: "Pick the best",
      about: "when more are left than you asked for, each with a reason",
      who: "model",
      match: task("pick the recipes"),
      optional: true,
    },
    {
      key: "hold",
      title: "Hold them for your OK",
      about: "each import waits as a card: Import, or Skip",
      who: "code",
      match: tool("recipe_import"),
      detail: (stats) => withFailed(`${stats.ok} held`, stats),
    },
  ],
  mine: [
    {
      key: "read",
      title: "Widen the search",
      about: "what suits the ask, and what a fitting recipe would say",
      who: "model",
      match: task("widen the search"),
    },
    {
      key: "gather",
      title: "Gather candidates",
      about: "up to 30 of your recipes, steps and notes searched too",
      who: "code",
      match: tool("recipe_search"),
      detail: (stats) => count(stats.started, "search", "searches"),
    },
    {
      key: "judge",
      title: "Judge each one",
      about: "reads ingredients, steps and yield against the ask",
      who: "model",
      match: judge,
      detail: (stats) =>
        stats.tally ??
        (stats.started > 1
          ? `${stats.ok} of ${stats.started} parts`
          : undefined),
    },
    {
      key: "sort",
      title: "Sort them",
      about: "the fits, the maybes and the near misses, each with why",
      who: "code",
    },
  ],
  plan: [
    {
      key: "read",
      title: "Read the ask",
      about: "the holiday or dates, the dishes you named, who's eating",
      who: "model",
      match: task("read the ask"),
    },
    {
      key: "menu",
      title: "Read the holiday's menu",
      about: "its dishes by course",
      who: "code",
      match: tool("holiday_get"),
      optional: true,
    },
    {
      key: "find",
      title: "Find a dish per course",
      about: "the dishes you named by name, then the menu's or your recipes",
      who: "code",
      match: tool("recipe_search"),
      optional: true,
      detail: (stats) =>
        stats.started > 0
          ? count(stats.started, "search", "searches")
          : undefined,
    },
    {
      key: "judge",
      title: "Judge the picks",
      about: "which candidate suits each course",
      who: "model",
      match: judge,
      optional: true,
      detail: (stats) => stats.tally,
    },
    {
      key: "hold",
      title: "Hold the plan for your OK",
      about: "one meal plan, scaled to the servings: Approve, or Skip",
      who: "code",
      match: tool("group_create"),
    },
  ],
  organize: [
    {
      key: "find",
      title: "Find what to change",
      about: "the model searches and reads your recipes",
      who: "model",
    },
    {
      key: "show",
      title: "Show each change",
      about: "every tag or collection change, recipe by recipe",
      who: "code",
    },
    {
      key: "hold",
      title: "Hold the writes for your OK",
      about: "nothing is written until you save",
      who: "code",
    },
  ],
  any: [
    {
      key: "loop",
      title: "The open loop",
      about: "the model chooses its own tools; best with Claude",
      who: "model",
    },
    {
      key: "hold",
      title: "Hold the writes for your OK",
      about: "nothing is written until you save",
      who: "code",
    },
  ],
};

/** One step as the page draws it. */
export interface PlanStepView {
  key: string;
  title: string;
  about: string;
  who: PlanStepWho;
  /**
   * `todo` not reached yet; `current` running now; `done`; `failed` (every
   * call of it failed); `skipped` (not needed, or never reached once the run
   * ended — `note` says which).
   */
  state: "todo" | "current" | "done" | "failed" | "skipped";
  detail?: string;
  note?: string;
}

/** The steps an intent's plan will take, before it runs. */
export function planPreview(intent: AgentIntent): PlanStepView[] {
  return PLANS[intent].map((def) => ({
    key: def.key,
    title: def.title,
    about: def.about,
    who: def.who,
    state: "todo",
  }));
}

/** Whether an intent's run follows a plan in code (and logs its steps). */
export function hasLivePlan(intent: AgentIntent): boolean {
  return intent === "online" || intent === "mine" || intent === "plan";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * The plan's steps as they stand, from the job's top-level lines. `ended`:
 * the run is over (`done`: it finished, rather than stopped or failed).
 */
export function planProgress(
  intent: AgentIntent,
  lines: readonly JobLine[],
  { ended, done }: { ended: boolean; done: boolean },
): PlanStepView[] {
  /* The steps started, by their number, with their name and data. */
  const started = new Map<
    number,
    { step: string; data: Record<string, unknown> }
  >();
  const ends = new Map<number, boolean>();
  const tallies: string[] = [];
  for (const line of lines) {
    if (line.parent !== undefined) continue;
    if (line.phase === "start" && line.n !== undefined) {
      started.set(line.n, {
        step: line.step,
        data: isObject(line.data) ? line.data : {},
      });
    } else if (line.phase === "end" && line.n !== undefined) {
      ends.set(line.n, line.ok !== false);
    } else if (
      line.phase === "note" &&
      line.step === "judge" &&
      isObject(line.data) &&
      typeof line.data.fit === "number" &&
      line.msg
    ) {
      tallies.push(line.msg);
    }
  }
  const defs = [
    ...([...started.values()].some(({ step, data }) =>
      CLASSIFY.match?.(step, data),
    )
      ? [CLASSIFY]
      : []),
    ...PLANS[intent],
  ];
  /* Each started step goes to the first of the list's steps it matches. */
  const stats: StepStats[] = defs.map(() => ({
    started: 0,
    ok: 0,
    failed: 0,
    open: 0,
  }));
  for (const [n, { step, data }] of [...started.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    const index = defs.findIndex((def) => def.match?.(step, data));
    if (index < 0) continue;
    const each = stats[index];
    each.started += 1;
    const ok = ends.get(n);
    if (ok === undefined) each.open += 1;
    else if (ok) each.ok += 1;
    else each.failed += 1;
  }
  /* The judge's tally: mine's one judge says it; a plan judges per course. */
  defs.forEach((def, index) => {
    if (def.match === judge && tallies.length > 0) {
      stats[index].tally =
        tallies.length === 1 ? tallies[0] : `${tallies.length} judged`;
    }
  });
  let lastActive = -1;
  stats.forEach((each, index) => {
    if (each.started > 0) lastActive = index;
  });
  return defs.map((def, index): PlanStepView => {
    const each = stats[index];
    const base = {
      key: def.key,
      title: def.title,
      about: def.about,
      who: def.who,
    };
    const detail = def.detail?.(each);
    const withDetail = detail ? { detail } : {};
    if (each.open > 0 && !ended) {
      return { ...base, ...withDetail, state: "current" };
    }
    if (each.started > 0) {
      if (each.ok === 0 && each.failed > 0 && (ended || index < lastActive)) {
        return { ...base, ...withDetail, state: "failed" };
      }
      if (!ended && index === lastActive) {
        return { ...base, ...withDetail, state: "current" };
      }
      return { ...base, ...withDetail, state: "done" };
    }
    /* Nothing logged for it. */
    if (!def.match) {
      if (index < lastActive || (ended && done)) {
        return { ...base, state: "done" };
      }
      if (ended) return { ...base, state: "skipped", note: "not reached" };
      return { ...base, state: "todo" };
    }
    if (index < lastActive || (ended && done)) {
      return { ...base, state: "skipped", note: "not needed" };
    }
    if (ended) return { ...base, state: "skipped", note: "not reached" };
    return { ...base, state: "todo" };
  });
}

/** The step running now, for the one polite line that says it. */
export function currentStep(
  steps: readonly PlanStepView[],
): PlanStepView | undefined {
  return steps.find((step) => step.state === "current");
}
