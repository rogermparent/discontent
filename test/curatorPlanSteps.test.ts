// 51d: `/curator` by intent — an intent's plan as steps, live from the job's
// step lines (`planSteps.ts`), and the picker's second local model (Dd2).
import { describe, expect, it } from "vitest";

import type { JobLine } from "../websites/recipe-website/editor/controller/jobs/log";
import {
  currentStep,
  hasLivePlan,
  planPreview,
  planProgress,
} from "../websites/recipe-website/editor/controller/agent/planSteps";
import {
  curatorModelFor,
  curatorModels,
} from "../websites/recipe-website/editor/controller/agent/job";
import { curatorSetup } from "../websites/recipe-website/editor/controller/agent/curator";
import {
  agentModelOverride,
  setAgentModelOverride,
} from "../websites/recipe-website/editor/controller/llm/client";

let n = 0;
const T = "2026-11-28T10:00:00.000Z";

/** A step that started (and ended, unless `open`) at the top level. */
function step(
  name: string,
  data: Record<string, unknown> = {},
  { open = false, ok = true }: { open?: boolean; ok?: boolean } = {},
): JobLine[] {
  n += 1;
  const start: JobLine = {
    t: T,
    step: name,
    phase: "start",
    level: "info",
    n,
    data,
  };
  if (open) return [start];
  return [
    start,
    { t: T, step: name, phase: "end", level: ok ? "info" : "warn", n, ok },
  ];
}

const states = (steps: { key: string; state: string }[]) =>
  Object.fromEntries(steps.map((each) => [each.key, each.state]));

describe("an intent's plan as steps (51d)", () => {
  it("previews each intent's steps, and only the three plans run live", () => {
    expect(planPreview("online").map((each) => each.title)).toEqual([
      "Read the ask",
      "Check what you have",
      "Search the web",
      "Skip what you have",
      "Read the best pages",
      "Pick the best",
      "Hold them for your OK",
    ]);
    expect(planPreview("mine").map((each) => each.key)).toEqual([
      "read",
      "gather",
      "judge",
      "sort",
    ]);
    expect(planPreview("plan").at(-1)?.title).toBe("Hold the plan for your OK");
    expect(planPreview("any")[0].about).toContain("chooses its own tools");
    expect(planPreview("online").every((each) => each.state === "todo")).toBe(
      true,
    );
    expect(hasLivePlan("online")).toBe(true);
    expect(hasLivePlan("mine")).toBe(true);
    expect(hasLivePlan("plan")).toBe(true);
    expect(hasLivePlan("organize")).toBe(false);
    expect(hasLivePlan("any")).toBe(false);
  });

  it("follows an online run as it goes: the step running now, counts, the code step between", () => {
    const lines = [
      ...step("agent.start"),
      ...step("llm.intent", { task: "read the ask", model: "qwen3.5:9b" }),
      ...step("recipe_search", { id: "call_plan_1", plan: true }),
      ...step("web_search", { id: "call_plan_2", plan: true }),
      ...step("web_search", { id: "call_plan_3", plan: true }, { ok: false }),
      ...step("page_inspect", { id: "call_plan_4", plan: true }),
      ...step(
        "page_inspect",
        { id: "call_plan_5", plan: true },
        { open: true },
      ),
    ];
    const steps = planProgress("online", lines, { ended: false, done: false });
    expect(states(steps)).toEqual({
      read: "done",
      have: "done",
      web: "done",
      skip: "done",
      pages: "current",
      pick: "todo",
      hold: "todo",
    });
    expect(steps.find((each) => each.key === "web")?.detail).toBe(
      "2 searches, 1 failed",
    );
    expect(steps.find((each) => each.key === "pages")?.detail).toBe(
      "1 page read",
    );
    expect(currentStep(steps)?.title).toBe("Read the best pages");
  });

  it("marks a step the plan didn't need as skipped once a later one ran, and a finished run done", () => {
    const lines = [
      ...step("llm.intent", { task: "read the ask" }),
      ...step("recipe_search"),
      ...step("web_search"),
      ...step("page_inspect"),
      ...step("recipe_import"),
      ...step("recipe_import"),
      ...step("recipe_import"),
    ];
    const steps = planProgress("online", lines, { ended: true, done: true });
    expect(states(steps)).toMatchObject({
      pick: "skipped",
      hold: "done",
    });
    expect(steps.find((each) => each.key === "pick")?.note).toBe("not needed");
    expect(steps.find((each) => each.key === "hold")?.detail).toBe("3 held");
    expect(currentStep(steps)).toBeUndefined();
  });

  it("says a step never reached when the run stopped early", () => {
    const lines = [
      ...step("llm.intent", { task: "widen the search" }),
      ...step("recipe_search"),
    ];
    const steps = planProgress("mine", lines, { ended: true, done: false });
    expect(states(steps)).toEqual({
      read: "done",
      gather: "done",
      judge: "skipped",
      sort: "skipped",
    });
    expect(steps.find((each) => each.key === "judge")?.note).toBe(
      "not reached",
    );
  });

  it("reads the judge's tally, and a step whose every call failed as failed", () => {
    const lines: JobLine[] = [
      ...step("llm.intent", { task: "widen the search" }),
      ...step("recipe_search"),
      ...step("recipe_search"),
      ...step("llm.judge", { recipes: 12, part: "1/2" }),
      ...step("llm.judge", { recipes: 6, part: "2/2" }),
      {
        t: T,
        step: "judge",
        phase: "note",
        level: "info",
        msg: "5 fit, 1 maybe, 12 no",
        data: { fit: 5, maybe: 1, no: 12, unjudged: 0 },
      },
    ];
    const steps = planProgress("mine", lines, { ended: true, done: true });
    expect(steps.find((each) => each.key === "gather")?.detail).toBe(
      "2 searches",
    );
    expect(steps.find((each) => each.key === "judge")?.detail).toBe(
      "5 fit, 1 maybe, 12 no",
    );
    expect(states(steps).sort).toBe("done");

    const failed = planProgress(
      "plan",
      [
        ...step("llm.intent", { task: "read the ask" }),
        ...step("group_create", {}, { ok: false }),
      ],
      { ended: true, done: true },
    );
    expect(states(failed)).toMatchObject({
      read: "done",
      menu: "skipped",
      hold: "failed",
    });
  });

  it("shows the model deciding the intent first, and ignores a step's inner steps", () => {
    const lines: JobLine[] = [
      ...step("llm.intent", { task: "classify" }),
      ...step("llm.intent", { task: "read the ask" }, { open: true }),
      /* An import's own steps: under their parent, not the plan's. */
      {
        t: T,
        step: "recipe_import",
        phase: "start",
        level: "info",
        n: 99,
        parent: 3,
      },
    ];
    const steps = planProgress("plan", lines, { ended: false, done: false });
    expect(steps[0]).toMatchObject({ key: "classify", state: "done" });
    expect(states(steps)).toMatchObject({ read: "current", hold: "todo" });
  });
});

describe("who answers: the import model beside the curator's own (51d, Dd2)", () => {
  const env = { RECIPE_LLM_URL: "http://localhost:11434" };

  it("offers the curator's model first, then the import model, then Claude", () => {
    const models = curatorModels({
      ...env,
      RECIPE_LLM_MODEL: "qwen3:8b",
      RECIPE_AGENT_MODEL: "qwen3.5:9b",
    });
    expect(models.local?.model).toBe("qwen3.5:9b");
    expect(models.import?.model).toBe("qwen3:8b");
    expect(curatorModelFor("import", models).config.model).toBe("qwen3:8b");
    const setup = curatorSetup({
      ...env,
      RECIPE_AGENT_MODEL: "qwen3.5:9b",
      RECIPE_LLM_CLAUDE_API_KEY: "sk-ant-x",
    });
    expect(setup?.models?.map((option) => [option.id, option.name])).toEqual([
      ["local", "qwen3.5:9b"],
      ["import", "qwen3:8b"],
      ["claude", "Claude Sonnet 5"],
    ]);
    /* No key: Claude shown, not offered. */
    const keyless = curatorSetup({ ...env, RECIPE_AGENT_MODEL: "qwen3.5:9b" });
    expect(keyless?.models?.map((option) => option.id)).toEqual([
      "local",
      "import",
    ]);
    expect(keyless?.unavailable?.map((option) => option.id)).toEqual([
      "claude",
    ]);
  });

  it("offers no second local model when the curator has none of its own, or the same one", () => {
    expect(curatorModels(env).import).toBeUndefined();
    expect(
      curatorModels({ ...env, RECIPE_AGENT_MODEL: "qwen3:8b" }).import,
    ).toBeUndefined();
    expect(() => curatorModelFor("import", curatorModels(env))).toThrow(
      /no local model of its own/,
    );
  });

  it("reads the test override only under TEST_MODE", () => {
    setAgentModelOverride("qwen3.5:9b");
    try {
      expect(agentModelOverride({})).toBeUndefined();
      expect(agentModelOverride({ TEST_MODE: "1" })).toBe("qwen3.5:9b");
      expect(curatorModels(env).import).toBeUndefined();
      expect(curatorModels({ ...env, TEST_MODE: "1" }).import?.model).toBe(
        "qwen3:8b",
      );
    } finally {
      setAgentModelOverride(undefined);
    }
  });
});
