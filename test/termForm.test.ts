// @vitest-environment node
//
// The term edit form's server half (31e): FormData → the term seat's input,
// the seat's refusals → form state, and the Parent select's choices.
//
// Three groups:
//
//  1. **The error mapping, pure** (`termFormStateFromError`): every seat code
//     the form can meet lands on the field it is about — `term_cycle` and
//     `unknown_term` on Parent, `slug_conflict` on Slug, `import_failed` on the
//     picture, each validation issue under its path's field.
//  2. **The FormData shapes, pure**: what a create sends (only what was filled
//     in) and what an edit sends (every shown field stated; blank = clear).
//  3. **`submitTermForm` against the real seat** in a tmpdir (the harness from
//     `test/terms.test.ts`): a create, a re-parent, a refused cycle that writes
//     nothing, and the edit page's "no record yet" create.

import { mkdtemp, pathExists, readJson, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SlugConflictError } from "@discontent/cms/content/createContent";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import type { TermTree } from "@discontent/cms/taxonomies/tree";

import { termParentOptions } from "../websites/recipe-website/common/controller/tagVocabulary";
import type { TagTerm } from "../websites/recipe-website/common/controller/types";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  CurationError,
  ImportError,
  NotFoundError,
  TermCycleError,
  UnknownTermError,
  ValidationError,
} from "../websites/recipe-website/editor/controller/curation/errors";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { createTerm } from "../websites/recipe-website/editor/controller/curation/terms";
import {
  TERM_NOT_SAVED,
  parseTermFormData,
  submitTermForm,
  termFormStateFromError,
  termInputFromForm,
  termPatchFromForm,
} from "../websites/recipe-website/editor/controller/termForm";

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => data.append(`${key}[${index}]`, item));
    } else {
      data.append(key, value);
    }
  }
  return data;
}

function parsed(entries: Record<string, string | string[]>) {
  const result = parseTermFormData(form(entries));
  if (!result.success) throw result.error;
  return result.data;
}

/* ------------------------------------------------------------------ */
/* 1. The error mapping                                                */
/* ------------------------------------------------------------------ */

describe("termFormStateFromError", () => {
  it("files a cycle under Parent, once", () => {
    const state = termFormStateFromError(
      new TermCycleError(["dessert", "cookies", "dessert"]),
    );
    expect(state.errors).toEqual({
      parent: [
        "That would put a term underneath itself: dessert → cookies → dessert.",
      ],
    });
    expect(state.message).toBe(TERM_NOT_SAVED);
  });

  it("files a parent with no record under Parent", () => {
    const state = termFormStateFromError(new UnknownTermError(["nope"]));
    expect(state.errors?.parent).toEqual(["No term record at slug: nope."]);
    expect(state.message).toBe(TERM_NOT_SAVED);
  });

  it("files a slug conflict under Slug, from the engine or the seat", () => {
    const engine = termFormStateFromError(new SlugConflictError("cookies"));
    expect(engine.errors?.slug).toEqual([
      'Content with slug "cookies" already exists',
    ]);
    expect(engine.slugConflict).toBe("cookies");

    const seat = termFormStateFromError(
      new CurationError("slug_conflict", "Term taken.", { slug: "cookies" }),
    );
    expect(seat.errors?.slug).toEqual(["Term taken."]);
    expect(seat.slugConflict).toBe("cookies");
  });

  it("files an image fetch failure under the picture", () => {
    const state = termFormStateFromError(
      new ImportError("Image https://x.test/a.jpg answered HTTP 404"),
    );
    expect(state.errors?.image).toEqual([
      "Image https://x.test/a.jpg answered HTTP 404",
    ]);
  });

  it("files each validation issue under its path's field", () => {
    const state = termFormStateFromError(
      new ValidationError('Pinned recipes must carry the term "cookies"', [
        { path: "pinned.1", message: "Recipe x does not carry it" },
        { path: "label", message: "A term needs a label" },
        { path: "imageImportUrl", message: "Bad URL" },
      ]),
    );
    expect(state.errors).toEqual({
      pinned: ["Recipe x does not carry it"],
      label: ["A term needs a label"],
      image: ["Bad URL"],
    });
    expect(state.message).toBe(
      `${TERM_NOT_SAVED} Pinned recipes must carry the term "cookies".`,
    );
  });

  it("keeps an issue with no field on the form in the message", () => {
    const state = termFormStateFromError(
      new ValidationError("Invalid input", [
        { path: "label", message: "A term needs a label" },
        { path: "date", message: "Expected a number" },
      ]),
    );
    expect(state.errors).toEqual({ label: ["A term needs a label"] });
    expect(state.message).toBe(`${TERM_NOT_SAVED} date: Expected a number`);
  });

  it("puts a reason with no field in the message", () => {
    expect(
      termFormStateFromError(
        new ValidationError('Could not derive a slug from label "!!"'),
      ),
    ).toEqual({
      message: 'Could not derive a slug from label "!!"',
      errors: {},
    });
    expect(
      termFormStateFromError(new NotFoundError('No term record at "x"', "x")),
    ).toEqual({ message: 'No term record at "x"', errors: {} });
    expect(termFormStateFromError(new Error("disk full")).message).toBe(
      "disk full",
    );
  });

  it("echoes the submitted values back", () => {
    const state = termFormStateFromError(new UnknownTermError(["nope"]), {
      label: "Linzer",
      parent: "nope",
      pinned: [],
    });
    expect(state.formData).toEqual({
      label: "Linzer",
      parent: "nope",
      pinned: [],
    });
  });
});

/* ------------------------------------------------------------------ */
/* 2. FormData → seat input                                            */
/* ------------------------------------------------------------------ */

describe("the FormData shapes", () => {
  it("a create sends only what was filled in", () => {
    expect(
      termInputFromForm(
        parsed({
          label: " Linzer ",
          slug: "",
          description: "  ",
          parent: "",
          imageImportUrl: "",
        }),
      ),
    ).toEqual({ label: " Linzer " });

    expect(
      termInputFromForm(
        parsed({
          label: "Linzer",
          slug: "linzer-cookies",
          description: "Jam.",
          parent: "cookies",
          pinned: ["a", " ", "b"],
          imageImportUrl: "https://x.test/a.jpg",
        }),
      ),
    ).toEqual({
      label: "Linzer",
      slug: "linzer-cookies",
      description: "Jam.",
      parent: "cookies",
      pinned: ["a", "b"],
      imageImportUrl: "https://x.test/a.jpg",
    });
  });

  it("a create at a page's slug ignores the form's Slug field", () => {
    expect(
      termInputFromForm(
        parsed({ label: "Christmas", slug: "other" }),
        "christmas",
      ),
    ).toEqual({ label: "Christmas", slug: "christmas" });
  });

  it("an edit states every shown field, blank meaning clear", () => {
    expect(termPatchFromForm(parsed({ label: "Cookies" }))).toEqual({
      label: "Cookies",
      description: null,
      parent: null,
      pinned: null,
    });
    expect(
      termPatchFromForm(
        parsed({
          label: "Cookies",
          description: "Sweet.",
          parent: "dessert",
          pinned: ["linzer"],
        }),
      ),
    ).toEqual({
      label: "Cookies",
      description: "Sweet.",
      parent: "dessert",
      pinned: ["linzer"],
    });
  });

  it("an edit leaves the picture unless a URL is typed or it is removed", () => {
    expect(termPatchFromForm(parsed({ label: "C" }))).not.toHaveProperty(
      "imageImportUrl",
    );
    expect(
      termPatchFromForm(parsed({ label: "C", clearImage: "on" })),
    ).toMatchObject({ imageImportUrl: null });
    expect(
      termPatchFromForm(
        parsed({
          label: "C",
          clearImage: "on",
          imageImportUrl: "https://x.test/a.jpg",
        }),
      ),
    ).toMatchObject({ imageImportUrl: "https://x.test/a.jpg" });
  });
});

/* ------------------------------------------------------------------ */
/* 3. The Parent select                                                */
/* ------------------------------------------------------------------ */

describe("termParentOptions", () => {
  const tree: TermTree = {
    dessert: { label: "Dessert", children: ["cookies", "cake"] },
    cookies: { label: "Cookies", parent: "dessert", children: ["linzer"] },
    linzer: { label: "Linzer", parent: "cookies", children: [] },
    cake: { label: "Cake", parent: "dessert", children: [] },
    holiday: { label: "Holiday", children: [] },
  };

  it("lists every record depth-first, siblings by label", () => {
    expect(termParentOptions(tree)).toEqual([
      { slug: "dessert", label: "Dessert", depth: 0 },
      { slug: "cake", label: "Cake", depth: 1 },
      { slug: "cookies", label: "Cookies", depth: 1 },
      { slug: "linzer", label: "Linzer", depth: 2 },
      { slug: "holiday", label: "Holiday", depth: 0 },
    ]);
  });

  it("leaves out the term and everything under it", () => {
    expect(
      termParentOptions(tree, "cookies").map((option) => option.slug),
    ).toEqual(["dessert", "cake", "holiday"]);
    expect(
      termParentOptions(tree, "dessert").map((option) => option.slug),
    ).toEqual(["holiday"]);
  });

  it("keeps the members of a hand-edited cycle, at depth 0", () => {
    const cyclic: TermTree = {
      a: { label: "A", parent: "b", children: ["b"] },
      b: { label: "B", parent: "a", children: ["a"] },
    };
    expect(termParentOptions(cyclic).map((option) => option.slug)).toEqual([
      "a",
      "b",
    ]);
    expect(termParentOptions(null)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 4. submitTermForm against the seat                                  */
/* ------------------------------------------------------------------ */

describe("submitTermForm", () => {
  let contentDirectory: string;
  let ctx: CurationContext;
  let previousContentDirectory: string | undefined;

  beforeEach(async () => {
    contentDirectory = await mkdtemp(join(tmpdir(), "term-form-"));
    ctx = { contentDirectory };
    previousContentDirectory = process.env.CONTENT_DIRECTORY;
    process.env.CONTENT_DIRECTORY = contentDirectory;

    await createRecipe(ctx, {
      name: "Linzer Cookies",
      slug: "linzer-cookies",
      date: 1_000,
      tags: ["cookies", "christmas"],
    });
    await createTerm(ctx, { label: "Dessert", date: 1 });
    await createTerm(ctx, { label: "Cookies", parent: "dessert", date: 2 });
  });

  afterEach(async () => {
    await closeCachedEnvironments();
    if (previousContentDirectory === undefined) {
      delete process.env.CONTENT_DIRECTORY;
    } else {
      process.env.CONTENT_DIRECTORY = previousContentDirectory;
    }
    await rm(contentDirectory, { recursive: true, force: true });
  });

  const termFile = (slug: string) =>
    join(contentDirectory, "taxonomies/tag/data", slug, "term.json");
  const readTerm = (slug: string): Promise<TagTerm> => readJson(termFile(slug));

  it("creates a child term, then moves it to another parent", async () => {
    const created = await submitTermForm(
      ctx,
      { kind: "new" },
      form({ label: "Bar Cookies", parent: "cookies", description: "Pan." }),
    );
    expect(created).toEqual({ ok: true, slug: "bar-cookies" });
    expect(await readTerm("bar-cookies")).toMatchObject({
      label: "Bar Cookies",
      parent: "cookies",
      description: "Pan.",
    });

    const moved = await submitTermForm(
      ctx,
      { kind: "edit", slug: "bar-cookies" },
      form({ label: "Bar Cookies", parent: "dessert", description: "Pan." }),
    );
    expect(moved).toEqual({ ok: true, slug: "bar-cookies" });
    expect((await readTerm("bar-cookies")).parent).toBe("dessert");
  });

  it("refuses a cycle on Parent and writes nothing", async () => {
    const before = await readTerm("dessert");
    const outcome = await submitTermForm(
      ctx,
      { kind: "edit", slug: "dessert" },
      form({ label: "Dessert", parent: "cookies", description: "Changed." }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.state.errors?.parent).toEqual([
      "That would put a term underneath itself: dessert → cookies → dessert.",
    ]);
    expect(outcome.state.formData).toMatchObject({
      label: "Dessert",
      parent: "cookies",
      description: "Changed.",
    });
    expect(await readTerm("dessert")).toEqual(before);
  });

  it("refuses a pinned recipe that does not carry the term, on Pinned", async () => {
    const outcome = await submitTermForm(
      ctx,
      { kind: "edit", slug: "cookies" },
      form({ label: "Cookies", parent: "dessert", pinned: ["nope"] }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.state.errors?.pinned).toEqual(['No recipe at slug "nope"']);
    expect((await readTerm("cookies")).pinned).toBeUndefined();
  });

  it("refuses a blank label on Label, on create and on edit", async () => {
    for (const target of [
      { kind: "new" as const },
      { kind: "edit" as const, slug: "cookies" },
    ]) {
      const outcome = await submitTermForm(ctx, target, form({ label: " " }));
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.state.errors?.label).toEqual(["A term needs a label"]);
    }
  });

  it("refuses a taken slug on Slug from /tags/new", async () => {
    const outcome = await submitTermForm(
      ctx,
      { kind: "new" },
      form({ label: "Biscuits", slug: "cookies" }),
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.state.errors?.slug).toHaveLength(1);
    expect(outcome.state.slugConflict).toBe("cookies");
  });

  it("creates the record at the page's slug for a carried-only term", async () => {
    expect(await pathExists(termFile("christmas"))).toBe(false);
    const outcome = await submitTermForm(
      ctx,
      { kind: "edit", slug: "christmas" },
      form({ label: "Christmas", parent: "", pinned: ["linzer-cookies"] }),
    );
    expect(outcome).toEqual({ ok: true, slug: "christmas" });
    expect(await readTerm("christmas")).toMatchObject({
      label: "Christmas",
      pinned: ["linzer-cookies"],
    });
    expect((await readTerm("christmas")).parent).toBeUndefined();
  });
});
