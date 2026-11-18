// @vitest-environment node
//
// 47h, the fixes found along the way — their pure halves:
//
// - rows 1, 4: a page read that read nothing (a 402 or 404, no recipe) is
//   not "done" — its curator row, its job's outcome (stored status kept);
// - row 2: the curator's rows name recipes, not slugs;
// - row 9: `/git`'s history and conflicts in names;
// - row 10: a mirror sync's outcome in words;
// - rows 12–13: the homepage shows a recipe once, a past holiday not as a
//   feature, the plan above not twice;
// - row 15: a create takes `null` as "none".
//
// Temp dirs only; never the content repository, never a model.

import { mkdtemp, outputJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildConversation,
  toolPhrase,
} from "../websites/recipe-website/editor/controller/agent/conversation";
import type { TranscriptRecord } from "../websites/recipe-website/editor/controller/agent/transcript";
import type { AgentMessage } from "../websites/recipe-website/editor/controller/agent/types";
import {
  jobOutcome,
  readNothingInToolResult,
  readNothingNote,
} from "../websites/recipe-website/editor/controller/jobs/outcome";
import type { JobMeta } from "../websites/recipe-website/editor/controller/jobs/store";
import { summarizeJob } from "../websites/recipe-website/editor/controller/jobs/views";
import { labelForPath } from "../websites/recipe-website/editor/controller/curation/git";
import {
  commitTitle,
  contentNames,
  namedLabelForPath,
} from "../websites/recipe-website/editor/controller/curation/historyNames";
import { syncOutcomeWords } from "../websites/recipe-website/editor/controller/curation/syncWords";
import {
  RecipeInputSchema,
  parseInput,
} from "../websites/recipe-website/editor/controller/curation/schema";
import { wrapUntrusted } from "../websites/recipe-website/editor/controller/agent/loop";
import { homepageShown } from "../websites/recipe-website/common/controller/homepageComingUp";

/** An inspect's result as `inspectUrl` answers a page that answered 404. */
const NOT_FOUND = {
  url: "https://www.gimmesomeoven.com/eggnog-recipe",
  finalUrl: "https://www.gimmesomeoven.com/eggnog-recipe",
  status: 404,
  partial: false,
  meta: { title: "Page not found" },
  images: [],
};

const READ = {
  url: "https://example.com/pie",
  finalUrl: "https://example.com/pie",
  status: 200,
  partial: false,
  recipe: { name: "Pie" },
  draft: { name: "Pie" },
  images: [],
};

describe("a page read that read nothing (rows 1, 4)", () => {
  it("says so for a non-2xx page and for a page with no recipe", () => {
    expect(readNothingNote(NOT_FOUND)).toBe(
      "gimmesomeoven.com answered HTTP 404 (not found): nothing was read.",
    );
    expect(readNothingNote({ ...NOT_FOUND, status: 402 })).toBe(
      "gimmesomeoven.com answered HTTP 402 (payment required): nothing was read.",
    );
    expect(readNothingNote({ ...NOT_FOUND, status: 200 })).toBe(
      "No recipe on the page at gimmesomeoven.com: nothing was read.",
    );
    expect(readNothingNote(READ)).toBeUndefined();
    /* A video's several recipes are a reading. */
    expect(
      readNothingNote({ ...NOT_FOUND, status: 200, recipes: [{ n: 1 }] }),
    ).toBeUndefined();
    /* Not a page read's shape: not judged. */
    expect(readNothingNote({ slug: "x" })).toBeUndefined();
    expect(readNothingNote(undefined)).toBeUndefined();
  });

  it("judges a done inspect only; the stored status stays done", () => {
    const meta = (overrides: Partial<JobMeta>) =>
      ({
        id: "01M7BJEJKFM59BP9R6FW0HNA0X",
        kind: "inspect",
        label: "gimmesomeoven.com/eggnog-recipe",
        status: "done",
        tier: "interactive",
        queuedAt: 1,
        startedAt: 1,
        endedAt: 2,
        pid: 1,
        host: "here",
        result: NOT_FOUND,
        ...overrides,
      }) as unknown as JobMeta;
    const summary = summarizeJob(meta({}), 3);
    expect(summary.status).toBe("done");
    expect(summary.outcome).toEqual({
      kind: "nothing",
      note: "gimmesomeoven.com answered HTTP 404 (not found): nothing was read.",
    });
    expect(jobOutcome(meta({ result: READ }))).toBeUndefined();
    expect(jobOutcome(meta({ status: "failed" }))).toBeUndefined();
    expect(jobOutcome(meta({ kind: "agent" }))).toBeUndefined();
    expect(summarizeJob(meta({ result: READ }), 3)).not.toHaveProperty(
      "outcome",
    );
  });

  it("reads a tool result wrapped as page text, and one cut at the cap", () => {
    const whole = JSON.stringify(NOT_FOUND);
    expect(readNothingInToolResult(wrapUntrusted("page_inspect", whole))).toBe(
      "gimmesomeoven.com answered HTTP 404 (not found): nothing was read.",
    );
    const cut = `${JSON.stringify({ ...NOT_FOUND, meta: { title: "x".repeat(500) } }).slice(0, 200)}… [cut]`;
    expect(readNothingInToolResult(wrapUntrusted("page_inspect", cut))).toBe(
      "gimmesomeoven.com answered HTTP 404 (not found): nothing was read.",
    );
    const cutRead = `${JSON.stringify({ ...READ, recipe: { name: "y".repeat(500) } }).slice(0, 200)}…`;
    expect(readNothingInToolResult(cutRead)).toBeUndefined();
    expect(readNothingInToolResult(JSON.stringify(READ))).toBeUndefined();
    /* The local model's view drops `recipe` and leads with `draft` (review):
     * cut, a 2xx answer read something. */
    const { recipe: _recipe, ...local } = READ;
    void _recipe;
    const cutLocal = `${JSON.stringify({ ...local, draft: { name: "z".repeat(500) } }).slice(0, 200)}…`;
    expect(readNothingInToolResult(cutLocal)).toBeUndefined();
    expect(readNothingInToolResult("not json")).toBeUndefined();
  });
});

function message(t: string, body: AgentMessage): TranscriptRecord {
  return { t, type: "message", job: "A", message: body };
}

function at(seconds: number): string {
  return new Date(Date.UTC(2026, 10, 17, 12, 0, seconds)).toISOString();
}

describe("the curator's rows (rows 1, 2)", () => {
  const records: TranscriptRecord[] = [
    {
      t: at(0),
      type: "start",
      job: "A",
      model: "qwen3:8b",
      api: "ollama",
      tools: ["page_inspect"],
    },
    message(at(0), { role: "user", text: "import the eggnog" }),
    message(at(1), {
      role: "assistant",
      text: "",
      toolCalls: [
        { id: "c1", name: "page_inspect", input: { url: NOT_FOUND.url } },
        { id: "c2", name: "recipe_search", input: { query: "pork" } },
        { id: "c3", name: "recipe_get", input: { slug: "pork-braise" } },
        {
          id: "c4",
          name: "recipe_import",
          input: { url: "https://example.com/pie" },
        },
        { id: "c5", name: "recipe_update", input: { slug: "naan" } },
      ],
    }),
    message(at(2), {
      role: "tool",
      toolCallId: "c1",
      name: "page_inspect",
      content: wrapUntrusted("page_inspect", JSON.stringify(NOT_FOUND)),
    }),
    message(at(3), {
      role: "tool",
      toolCallId: "c2",
      name: "recipe_search",
      content: JSON.stringify({
        total: 2,
        recipes: [
          { slug: "pork-braise", name: "Pork Braise" },
          { slug: "naan", name: "Naan" },
        ],
      }),
    }),
    message(at(4), {
      role: "tool",
      toolCallId: "c3",
      name: "recipe_get",
      content: JSON.stringify({
        slug: "pork-braise",
        recipe: { name: "Pork Braise" },
      }),
    }),
    message(at(5), {
      role: "tool",
      toolCallId: "c4",
      name: "recipe_import",
      content: JSON.stringify({ slug: "pie-2", name: "Apple Pie" }),
    }),
    message(at(6), {
      role: "tool",
      toolCallId: "c5",
      name: "recipe_update",
      content: JSON.stringify({ slug: "naan" }),
    }),
  ];

  it("shows an inspect that read nothing as such, with why", () => {
    const { items } = buildConversation(records, { live: false });
    const turn = items.find((item) => item.kind === "assistant");
    const [inspect] = turn?.kind === "assistant" ? turn.tools : [];
    expect(inspect.status).toBe("nothing");
    expect(inspect.note).toBe(
      "gimmesomeoven.com answered HTTP 404 (not found): nothing was read.",
    );
    expect(inspect.phrase).toBe("Inspected a page on gimmesomeoven.com");
  });

  it("names recipes the conversation's results named", () => {
    const { items } = buildConversation(records, { live: false });
    const turn = items.find((item) => item.kind === "assistant");
    const phrases =
      turn?.kind === "assistant" ? turn.tools.map((t) => t.phrase) : [];
    expect(phrases.slice(2)).toEqual([
      "Read “Pork Braise”",
      "Imported “Apple Pie” from example.com",
      "Updated “Naan”",
    ]);
    /* Unknown names stay slugs. */
    expect(
      toolPhrase({ id: "x", name: "recipe_get", input: { slug: "mystery" } }),
    ).toBe("Read mystery");
  });
});

describe("the git page's words (rows 9, 10)", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "history-names-"));
    await outputJson(join(dir, "recipes/data/naan/recipe.json"), {
      name: "Naan",
    });
    await outputJson(join(dir, "groups/data/week-one/group.json"), {
      name: "Week One",
    });
    await outputJson(join(dir, "taxonomies/tag/data/punch/term.json"), {
      label: "Punch",
    });
    await outputJson(
      join(
        dir,
        "featured-recipes/data/01m676tr9jpw4w5naadh9dp98h/featured-recipe.json",
      ),
      { recipe: "naan", date: 1 },
    );
    await outputJson(
      join(
        dir,
        "featured-recipes/data/01m5p8nw8kbf1p11fx6jgy7xte/featured-recipe.json",
      ),
      { term: "punch", date: 1 },
    );
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("titles commits with names, and leaves the rest as they are", async () => {
    const names = contentNames(dir);
    const title = (message: string) => commitTitle(message, names);
    expect(
      await title("Add new featured recipe: 01m676tr9jpw4w5naadh9dp98h"),
    ).toBe("Add new featured recipe: “Naan”");
    expect(
      await title("Add new featured recipe: 01m5p8nw8kbf1p11fx6jgy7xte"),
    ).toBe("Add new featured recipe: “Punch” (tag)");
    expect(await title("Create recipe: naan")).toBe("Create recipe: “Naan”");
    expect(await title("Update recipe image: naan")).toBe(
      "Update recipe image: “Naan”",
    );
    expect(await title("Assign term: punch (+8 recipes)")).toBe(
      "Assign term: “Punch” (+8 recipes)",
    );
    expect(await title("Update group: week-one")).toBe(
      "Update group: “Week One”",
    );
    /* Gone since, or no slug at all: the message. */
    expect(await title("Delete recipe: gone")).toBe("Delete recipe: gone");
    expect(await title("Merge remote-tracking branch 'x/y'")).toBe(
      "Merge remote-tracking branch 'x/y'",
    );
    expect(
      await title("Update shopping list: +The Best Pumpkin Bars (20 items)"),
    ).toBe("Update shopping list: +The Best Pumpkin Bars (20 items)");
  });

  it("labels every kind of content path, named where it can be", async () => {
    expect(labelForPath("taxonomies/tag/data/punch/term.json")).toBe(
      "Tag: punch",
    );
    expect(labelForPath("shopping/settings.json")).toBe(
      "Shopping list settings",
    );
    expect(labelForPath("shopping/items/01abc.json")).toBe(
      "Shopping list item",
    );
    expect(labelForPath("inventory/on-hand.json")).toBe("What's on hand");
    expect(labelForPath("pages/data/about/page.json")).toBe("Page: about");
    const names = contentNames(dir);
    expect(
      await namedLabelForPath("recipes/data/naan/recipe.json", names),
    ).toBe("Recipe: Naan");
    expect(
      await namedLabelForPath(
        "featured-recipes/data/01m676tr9jpw4w5naadh9dp98h/featured-recipe.json",
        names,
      ),
    ).toBe("Homepage feature: “Naan”");
    expect(
      await namedLabelForPath("taxonomies/tag/data/punch/term.json", names),
    ).toBe("Tag: Punch");
    expect(
      await namedLabelForPath("recipes/data/gone/recipe.json", names),
    ).toBe("Recipe: gone");
    /* Not a slug: never a path to read. */
    expect(await names.recipe("../../etc")).toBeUndefined();
  });

  it("says a sync's outcome in words", () => {
    expect(syncOutcomeWords("nothing")).toBe(
      "already in sync, nothing to move",
    );
    expect(syncOutcomeWords("synced")).toBe("synced");
    expect(syncOutcomeWords("mirror_dirty")).toMatch(/uncommitted changes/);
    expect(syncOutcomeWords("something_new")).toBe("something new");
  });
});

describe("the homepage shows a recipe once (rows 12, 13)", () => {
  /* 17 November 2026: Thanksgiving (26 Nov) and Christmas in the window,
   * Halloween past. */
  const today = { year: 2026, month: 11, day: 17 };
  const season = [
    { slug: "halloween", picks: ["dirt-pudding"] },
    {
      slug: "thanksgiving",
      picks: ["pie", "rolls", "stuffing", "gravy", "turkey"],
    },
    {
      slug: "christmas",
      picks: ["pie", "cookies", "rolls", "fudge", "nog", "stollen"],
    },
  ];

  it("lets the earliest section keep a recipe, and the next one fill in", () => {
    const shown = homepageShown({
      today,
      season,
      featured: [
        { key: "0-recipe-fudge", recipe: "fudge" },
        { key: "1-recipe-soup", recipe: "soup" },
        { key: "2-recipe-soup-again", recipe: "soup" },
      ],
      featuredLimit: 6,
      fresh: ["turkey", "soup", "salad", "pie", "bread"],
      freshLimit: 2,
    });
    expect(shown.season).toEqual([
      expect.objectContaining({
        slug: "thanksgiving",
        picks: ["pie", "rolls", "stuffing", "gravy"],
      }),
      expect.objectContaining({
        slug: "christmas",
        picks: ["cookies", "fudge", "nog", "stollen"],
      }),
    ]);
    /* Fudge is in Christmas's strip; soup once. */
    expect(shown.featured).toEqual(["1-recipe-soup"]);
    /* Turkey was not in a strip (the fifth Thanksgiving candidate). */
    expect(shown.fresh).toEqual(["turkey", "salad"]);
  });

  it("drops a past holiday's feature and the plan above, keeping dangling slots", () => {
    const shown = homepageShown({
      today,
      season,
      featured: [
        { key: "0-term-halloween", holiday: "halloween" },
        { key: "1-term-thanksgiving", holiday: "thanksgiving" },
        { key: "2-group-connor", group: "connors-birthday" },
        { key: "3-dangling", dangling: true },
        { key: "4-term-fall" },
        { key: "5-recipe-x", recipe: "x" },
      ],
      featuredLimit: 2,
      planGroup: "connors-birthday",
      fresh: [],
      freshLimit: 6,
    });
    /* Halloween is past, Thanksgiving has its row, Connor's is the plan;
     * the dangling entry takes the first of two slots. */
    expect(shown.featured).toEqual(["4-term-fall"]);
  });

  it("shows the newest anyway when every candidate is above", () => {
    const shown = homepageShown({
      today,
      season,
      featured: [],
      featuredLimit: 6,
      fresh: ["pie", "rolls"],
      freshLimit: 6,
    });
    expect(shown.fresh).toEqual(["pie", "rolls"]);
  });
});

describe("a create takes null as none (row 15)", () => {
  it("reads null in the patch's nullable fields as not set", () => {
    const input = parseInput(RecipeInputSchema, {
      name: "Toast",
      description: null,
      tags: null,
      prepTime: null,
      recipeYield: null,
      ingredients: null,
      instructions: null,
      source: null,
      drink: null,
      notes: null,
      imageImportUrl: null,
      videoUrl: null,
      videoImportUrl: null,
    });
    expect(input).toEqual({ name: "Toast" });
    expect(() => parseInput(RecipeInputSchema, { name: null })).toThrow();
  });
});
