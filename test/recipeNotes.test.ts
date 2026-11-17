// @vitest-environment node
//
// 47j: a recipe's own notes — the "(Note N)" linker, the migration's pick,
// the write paths' limits, the plugin reader on hand-written fixture pages
// (no fetch), the selector grammar and its check, the learned-selector
// store, and the import's notes step with the model stubbed.

import { readFileSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanNotes,
  isNotesName,
  linkNoteRefs,
  noteRefs,
  notesMigration,
} from "../websites/recipe-website/common/util/recipeNotes";
import {
  checkNotesSelector,
  notesHeadings,
  notesOutline,
  notesPage,
  parseSelector,
  pluginNotes,
  selectAll,
} from "../websites/recipe-website/common/util/pageNotes";
import {
  NotesSchema,
  RecipeInputSchema,
  RecipePatchSchema,
  parseInput,
} from "../websites/recipe-website/editor/controller/curation/schema";
import { buildRecipeWrite } from "../websites/recipe-website/editor/controller/curation/recipes";
import parseRecipeFormData from "../websites/recipe-website/editor/controller/parseFormData";
import {
  forgetNoteSelector,
  listNoteSelectors,
  noteSelectorFor,
  recordNoteSelectorUse,
  storeNoteSelector,
} from "../websites/recipe-website/editor/controller/notes/noteSelectors";
import {
  readPageNotes,
  withPageNotes,
} from "../websites/recipe-website/editor/controller/notes/importNotes";
import { editModels } from "../websites/recipe-website/editor/controller/llm/askEdit";
import { fillGaps } from "../websites/recipe-website/editor/controller/curation/fillGaps";
import { normalizeRecipeText } from "../websites/recipe-website/common/util/recipeText";

const FIXTURES = resolve(__dirname, "fixtures/notes");
const fixture = (name: string) =>
  readFileSync(join(FIXTURES, `${name}.html`), "utf8");

describe("the (Note N) linker", () => {
  it("links a reference to a note the recipe has", () => {
    expect(linkNoteRefs("Add the sauce (Note 2).", 3)).toBe(
      "Add the sauce ([Note 2](#recipe-note-2)).",
    );
    expect(linkNoteRefs("Bake, see note 1, then cool.", 1)).toBe(
      "Bake, see [note 1](#recipe-note-1), then cool.",
    );
    expect(linkNoteRefs("Use Note #3 here.", 3)).toBe(
      "Use [Note #3](#recipe-note-3) here.",
    );
  });

  it("links each number of a list, and only the ones the recipe has", () => {
    expect(linkNoteRefs("(see notes 1 and 3)", 3)).toBe(
      "(see notes [1](#recipe-note-1) and [3](#recipe-note-3))",
    );
    expect(linkNoteRefs("(notes 1 and 4)", 2)).toBe(
      "(notes [1](#recipe-note-1) and 4)",
    );
  });

  it("leaves the text alone with no notes, past them, or inside links and code", () => {
    expect(linkNoteRefs("Add the sauce (Note 2).", 0)).toBe(
      "Add the sauce (Note 2).",
    );
    expect(linkNoteRefs("Add the sauce (Note 5).", 2)).toBe(
      "Add the sauce (Note 5).",
    );
    expect(linkNoteRefs("[Note 1](https://x.example) and `note 1`", 2)).toBe(
      "[Note 1](https://x.example) and `note 1`",
    );
    expect(linkNoteRefs("A footnote 2 is not a note.", 3)).toBe(
      "A footnote 2 is not a note.",
    );
    expect(linkNoteRefs("Note: it is hot.", 3)).toBe("Note: it is hot.");
    expect(noteRefs("Preheat the oven.", 3)).toEqual([]);
  });

  it("says where each reference is", () => {
    expect(noteRefs("x (Note 2) y note 1", 2)).toEqual([
      { start: 3, end: 9, notes: [2] },
      { start: 13, end: 19, notes: [1] },
    ]);
  });
});

describe("the migration's pick", () => {
  const steps = [{ text: "Mix." }, { text: "Bake." }];

  it("moves a trailing notes group, each step a note, after the notes there", () => {
    const move = notesMigration({
      instructions: [
        ...steps,
        {
          name: "Recipe Notes:",
          instructions: [
            { text: "Use cold butter." },
            { name: "Storage", text: "Keeps 3 days." },
            { text: "  " },
          ],
        },
      ],
      notes: ["Already here."],
    });
    expect(move).toEqual({
      group: "Recipe Notes:",
      moved: ["Use cold butter.", "**Storage:** Keeps 3 days."],
      notes: [
        "Already here.",
        "Use cold butter.",
        "**Storage:** Keeps 3 days.",
      ],
      instructions: steps,
    });
  });

  it("knows the notes names, and nothing else", () => {
    for (const name of [
      "Notes",
      "notes:",
      "Recipe Notes",
      "Tips",
      "Cook’s notes",
      "Notes & Tips",
      "Tips and tricks",
      "Note",
    ]) {
      expect(isNotesName(name), name).toBe(true);
    }
    for (const name of ["Notes on the dough", "For the sauce", ""]) {
      expect(isNotesName(name), name).toBe(false);
    }
  });

  it("leaves a notes group in the middle, a choice option, a lone step or an empty group", () => {
    const notes = { name: "Notes", instructions: [{ text: "Hot." }] };
    expect(notesMigration({ instructions: [notes, ...steps] })).toBeUndefined();
    expect(
      notesMigration({
        instructions: [...steps, { ...notes, choice: "Then make" }],
      }),
    ).toBeUndefined();
    expect(
      notesMigration({
        instructions: [...steps, { name: "Notes", text: "x" }],
      }),
    ).toBeUndefined();
    expect(
      notesMigration({
        instructions: [...steps, { name: "Notes", instructions: [] }],
      }),
    ).toBeUndefined();
    expect(notesMigration({})).toBeUndefined();
  });

  it("takes a recipe that is only its notes group to no steps", () => {
    expect(
      notesMigration({
        instructions: [{ name: "Tips", instructions: [{ text: "Hot." }] }],
      })?.instructions,
    ).toEqual([]);
  });
});

describe("the write paths", () => {
  it("trims notes, drops blank ones, and holds the limits", () => {
    expect(cleanNotes([" a ", "", "b\r\nc", 3 as unknown as string])).toEqual([
      "a",
      "b\nc",
    ]);
    expect(NotesSchema.parse([" one ", "  "])).toEqual(["one"]);
    expect(NotesSchema.safeParse(new Array(51).fill("x")).success).toBe(false);
    expect(NotesSchema.safeParse(["x".repeat(10_001)]).success).toBe(false);
    expect(
      parseInput(RecipeInputSchema, { name: "A", notes: ["Hot."] }).notes,
    ).toEqual(["Hot."]);
  });

  it("stores no `notes` key for none, and a patch's [] clears them", async () => {
    const created = await buildRecipeWrite(
      parseInput(RecipeInputSchema, { name: "A", notes: [" "] }),
      { date: 1 },
    );
    expect("notes" in created.data).toBe(false);
    const current = { name: "A", date: 1, notes: ["Old."] };
    const cleared = await buildRecipeWrite(
      parseInput(RecipePatchSchema, { notes: [] }),
      { date: 1, current },
    );
    expect("notes" in cleared.data).toBe(false);
    const kept = await buildRecipeWrite(
      parseInput(RecipePatchSchema, { name: "B" }),
      { date: 1, current },
    );
    expect(kept.data.notes).toEqual(["Old."]);
    const replaced = await buildRecipeWrite(
      parseInput(RecipePatchSchema, { notes: ["New."] }),
      { date: 1, current },
    );
    expect(replaced.data.notes).toEqual(["New."]);
  });

  it("reads the form's rows, blank ones dropped, none as no notes", () => {
    const form = new FormData();
    form.set("name", "A");
    form.set("notes[0]", " First. ");
    form.set("notes[1]", "");
    form.set("notes[2]", "Third.\r\nSecond line.");
    const parsed = parseRecipeFormData(form);
    expect(parsed.success && parsed.data.notes).toEqual([
      "First.",
      "Third.\nSecond line.",
    ]);
    const none = new FormData();
    none.set("name", "A");
    none.set("notes[0]", "  ");
    const empty = parseRecipeFormData(none);
    expect(empty.success && empty.data.notes).toBeUndefined();
    const long = new FormData();
    long.set("name", "A");
    long.set("notes[0]", "x".repeat(10_001));
    expect(parseRecipeFormData(long).success).toBe(false);
  });

  it("stores notes with \\n line endings", () => {
    expect(normalizeRecipeText({ notes: ["a\r\nb"] }).notes).toEqual(["a\nb"]);
  });

  it("fills empty notes from the source, never over notes there", () => {
    const draft = { notes: ["From the page."] };
    expect(fillGaps({ name: "A" }, draft).recipe.notes).toEqual([
      "From the page.",
    ]);
    expect(fillGaps({ name: "A" }, draft).filled).toContain("notes");
    const kept = fillGaps({ name: "A", notes: ["Mine."] }, draft);
    expect(kept.recipe.notes).toEqual(["Mine."]);
    expect(kept.filled).not.toContain("notes");
  });
});

describe("a card plugin's notes block", () => {
  it("splits WP Recipe Maker's paragraphs, its heading, links and pictures left out", () => {
    const found = pluginNotes(notesPage(fixture("wprm")));
    expect(found?.plugin).toBe("WP Recipe Maker");
    expect(found?.notes).toEqual([
      "**Spiciness –** It is meant to be spicy, see my guide.",
      "**1. Peppercorns** give the numbing effect.",
      "**Leftovers** keep 3 days.",
    ]);
  });

  it("splits Tasty Recipes' list items", () => {
    expect(pluginNotes(notesPage(fixture("tasty")))).toMatchObject({
      plugin: "Tasty Recipes",
      notes: [
        "**Storage:** Keep covered in the fridge for up to 5 days.",
        "For thicker bars, use an 8-inch pan and bake 5 minutes longer.",
      ],
    });
  });

  it("joins Mediavine's bold lead to its paragraph and keeps a note's paragraphs", () => {
    expect(pluginNotes(notesPage(fixture("mediavine")))?.notes).toEqual([
      "**Make ahead:** The salad keeps two days; add the herbs just before serving.",
      "Any bean works here.\n\nChickpeas are my favourite.",
    ]);
  });

  it("finds nothing on a card with no notes, or a site with no plugin", () => {
    expect(pluginNotes(notesPage(fixture("no-notes")))).toBeUndefined();
    expect(pluginNotes(notesPage(fixture("plain-site")))).toBeUndefined();
  });
});

describe("the selector grammar and its check", () => {
  it("reads tags, ids, classes, attributes and three combinators", () => {
    expect(parseSelector("div.recipe-notes > p")?.compounds).toHaveLength(2);
    expect(parseSelector('h2.title + div[data-x="y"]')?.combinators).toEqual([
      "+",
    ]);
    expect(parseSelector("#notes")?.compounds[0].id).toBe("notes");
  });

  it("refuses positions, pseudo-classes, lists and nonsense", () => {
    for (const bad of [
      "div:nth-child(2)",
      "p:first-of-type",
      "a, b",
      "div ~ p",
      "> p",
      "p >",
      "",
      "x".repeat(201),
      "a b c d e f g",
      "div..x",
    ]) {
      expect(parseSelector(bad), bad).toBeUndefined();
    }
  });

  it("matches as a browser would", () => {
    const page = notesPage(fixture("plain-site"));
    const of = (selector: string) => selectAll(page, parseSelector(selector)!);
    expect(of(".recipe-extra__body")).toHaveLength(3);
    expect(of(".recipe-notes .recipe-extra__body")).toHaveLength(1);
    expect(of("section.recipe-notes > div")).toHaveLength(1);
    expect(of("h2.section-title + div")).toHaveLength(2);
    expect(of("article > div")).toHaveLength(0);
  });

  it("keeps a selector for one block of notes by a notes heading", () => {
    const page = notesPage(fixture("plain-site"));
    expect(notesHeadings(page).map((h) => h.tagName)).toEqual(["h2"]);
    const check = checkNotesSelector(page, ".recipe-notes .recipe-extra__body");
    expect(check).toMatchObject({
      ok: true,
      notes: [
        "Roll the dough as thin as you can; thick crackers stay chewy.",
        "They keep a week in a tin.",
      ],
    });
    /* The section around the heading is fine too: its heading is left out. */
    expect(checkNotesSelector(page, "section.recipe-notes")).toMatchObject({
      ok: true,
    });
  });

  it("refuses two matches, the recipe itself, a block by no notes heading, or too little", () => {
    const page = notesPage(fixture("plain-site"));
    const problem = (selector: string) => {
      const check = checkNotesSelector(page, selector);
      return check.ok ? "ok" : check.problem;
    };
    expect(problem(".recipe-extra__body")).toMatch(/matches 2 elements/);
    expect(problem("article.recipe-page")).toMatch(/ingredients and steps/);
    expect(problem(".recipe-method")).toMatch(/not by a “Notes” heading/);
    expect(problem("h1")).toMatch(/next to no text/);
    expect(problem("div:nth-child(2)")).toMatch(/not a selector/);
  });

  it("refuses a generated class, and leaves generated names out of the outline", () => {
    const page = notesPage(
      '<body><section class="jsx-1098722538 recipe__notessection"><h3 class="jsx-1098722538 Recipe__notesHeading">Recipe Notes</h3><div class="jsx-1098722538 recipe__notes"><p>Best eaten fresh; leftovers keep 4 days.</p></div></section></body>',
    );
    const check = checkNotesSelector(page, "div.jsx-1098722538.recipe__notes");
    expect(check.ok ? "ok" : check.problem).toMatch(/looks generated/);
    expect(checkNotesSelector(page, "div.recipe__notes").ok).toBe(true);
    expect(notesOutline(page)).not.toContain("jsx-");
    expect(notesOutline(page)).toContain("section.recipe__notessection");
  });

  it("takes a lone label as a heading, never a sentence's lead", () => {
    const lead = notesPage(
      "<body><p><strong>Tip:</strong> chill the dough for an hour first.</p></body>",
    );
    expect(notesHeadings(lead)).toEqual([]);
    const alone = notesPage(
      "<body><p><strong>Tips:</strong></p><p>Chill the dough for an hour.</p></body>",
    );
    expect(notesHeadings(alone).map((h) => h.tagName)).toEqual(["strong"]);
  });

  it("outlines the page around its notes heading, never its chrome", () => {
    const outline = notesOutline(notesPage(fixture("plain-site")))!;
    expect(outline).toContain('h2.section-title "Recipe Notes" <<');
    expect(outline).toContain("section.recipe-extra.recipe-notes");
    expect(outline).not.toContain("newsletter");
    expect(notesOutline(notesPage(fixture("no-notes")))).toBeUndefined();
    /* A nav's or a comment's "Notes" is not the page's heading. */
    expect(
      notesHeadings(notesPage(fixture("wprm"))).map((h) => h.tagName),
    ).toEqual(["h3"]);
  });
});

describe("the learned selectors and the import's notes step", () => {
  let dir: string;
  let previous: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "notes-selectors-"));
    previous = process.env.SETTINGS_DIRECTORY;
    process.env.SETTINGS_DIRECTORY = dir;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (previous === undefined) delete process.env.SETTINGS_DIRECTORY;
    else process.env.SETTINGS_DIRECTORY = previous;
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps one selector a registrable domain, counts its uses, and forgets it", async () => {
    await storeNoteSelector(
      "https://www.example.co.uk/recipes/a",
      { selector: ".notes", model: "local model qwen3:8b" },
      new Date("2026-11-17T12:00:00Z"),
    );
    const row = await noteSelectorFor("https://cdn.example.co.uk/b");
    expect(row).toMatchObject({
      site: "example.co.uk",
      selector: ".notes",
      hits: 0,
      misses: 0,
      learned: "2026-11-17T12:00:00.000Z",
    });
    await recordNoteSelectorUse("example.co.uk", true);
    await recordNoteSelectorUse("example.co.uk", false);
    expect(await listNoteSelectors()).toMatchObject([{ hits: 1, misses: 1 }]);
    expect(await forgetNoteSelector("example.co.uk")).toBe(true);
    expect(await forgetNoteSelector("example.co.uk")).toBe(false);
    expect(await listNoteSelectors()).toEqual([]);
  });

  /** An Ollama stand-in that answers `selectors` in turn. */
  function stubModel(selectors: string[]) {
    const prompts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body ?? "{}"));
        prompts.push(body.messages?.[1]?.content ?? "");
        const selector = selectors.shift() ?? "";
        return new Response(
          JSON.stringify({
            model: "qwen3:8b",
            message: {
              role: "assistant",
              content: JSON.stringify({ selector, note: "the notes block" }),
            },
            done: true,
            prompt_eval_count: 500,
            eval_count: 20,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    return prompts;
  }

  const local = editModels({ RECIPE_LLM_URL: "http://127.0.0.1:9" });

  it("reads a plugin's notes without a model", async () => {
    const prompts = stubModel([]);
    const found = await readPageNotes("https://a.example/x", fixture("tasty"), {
      mode: "learn",
      models: local,
    });
    expect(found).toMatchObject({ path: "plugin", plugin: "Tasty Recipes" });
    expect(prompts).toHaveLength(0);
  });

  it("learns a site's selector once — a refused answer retried with why — and reuses it", async () => {
    const prompts = stubModel([
      ".recipe-extra__body",
      ".recipe-notes .recipe-extra__body",
    ]);
    const first = await readPageNotes(
      "https://www.crackers.example/sourdough",
      fixture("plain-site"),
      { mode: "learn", models: local },
    );
    expect(first).toMatchObject({
      path: "learned",
      selector: ".recipe-notes .recipe-extra__body",
      site: "crackers.example",
      notes: [
        "Roll the dough as thin as you can; thick crackers stay chewy.",
        "They keep a week in a tin.",
      ],
    });
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("<<");
    expect(prompts[1]).toMatch(/was refused: it matches 2 elements/);

    const second = await readPageNotes(
      "https://crackers.example/rye",
      fixture("plain-site-2"),
      { mode: "learn", models: local },
    );
    expect(second).toMatchObject({
      path: "selector",
      notes: [
        "Rye flour drinks more water: add a spoonful if the dough cracks.",
        "Bake until the edges brown.",
      ],
    });
    expect(prompts).toHaveLength(2);
    expect(await listNoteSelectors()).toMatchObject([{ hits: 1, misses: 0 }]);
  });

  it("counts a miss, and asks no model without leave or without a heading", async () => {
    await storeNoteSelector("https://crackers.example/a", {
      selector: ".gone",
      model: "local model qwen3:8b",
    });
    const prompts = stubModel([]);
    const found = await readPageNotes(
      "https://crackers.example/b",
      fixture("plain-site"),
      { mode: "known", models: local },
    );
    expect(found.path).toBe("none");
    expect(found.why).toMatch(/learned selector ".gone" missed/);
    expect(await listNoteSelectors()).toMatchObject([{ misses: 1 }]);
    const none = await readPageNotes(
      "https://b.example/x",
      fixture("no-notes"),
      {
        mode: "learn",
        models: local,
      },
    );
    expect(none).toMatchObject({ path: "none" });
    expect(prompts).toHaveLength(0);
  });

  it("learns nothing on a page whose recipe card has no notes block", async () => {
    const prompts = stubModel([".post-notes"]);
    const found = await readPageNotes(
      "https://card.example/x",
      '<body><div class="wprm-recipe-container"><h3>Ingredients</h3><h3>Instructions</h3></div><h2>Notes</h2><div class="post-notes"><p>A note from the post, not the card.</p></div></body>',
      { mode: "learn", models: local },
    );
    expect(found).toMatchObject({
      path: "none",
      why: expect.stringMatching(/card has no notes/),
    });
    expect(prompts).toHaveLength(0);
  });

  it("never invents notes: every answer refused is none", async () => {
    stubModel(["article.recipe-page", ".recipe-method"]);
    const found = await readPageNotes(
      "https://crackers.example/c",
      fixture("plain-site"),
      { mode: "learn", models: local },
    );
    expect(found.path).toBe("none");
    expect(found.notes).toEqual([]);
    expect(await listNoteSelectors()).toEqual([]);
  });

  it("adds the page's notes to a reading that has none", async () => {
    const applied = await withPageNotes(
      { recipe: { name: "Bars" }, warnings: [] },
      "https://a.example/x",
      fixture("tasty"),
    );
    expect(applied.recipe?.notes).toHaveLength(2);
    const own = await withPageNotes(
      { recipe: { name: "Bars", notes: ["Mine."] }, warnings: [] },
      "https://a.example/x",
      fixture("tasty"),
    );
    expect(own.recipe?.notes).toEqual(["Mine."]);
  });
});
