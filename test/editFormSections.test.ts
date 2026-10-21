// @vitest-environment node
//
// 43e1: edit form B's rail — the sections' statuses, the change count, the
// copy slug — and the duplicate check's lookup by source link.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import simpleGit from "simple-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import { recipeToFormValues } from "../websites/recipe-website/common/components/Form/formContext";
import {
  allLinesUsed,
  changeText,
  changedFields,
  errorSections,
  sectionStatuses,
  stepCount,
} from "../websites/recipe-website/common/components/Form/sections";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { recipeBySource } from "../websites/recipe-website/editor/controller/curation/importList";
import {
  createRecipe,
  nextCopySlug,
  resolveCopySlug,
} from "../websites/recipe-website/editor/controller/curation/recipes";

/** An imported recipe's shape: Sally's crisp molasses cookies, trimmed. */
const MOLASSES = {
  name: "Crisp Molasses Cookies",
  description: "Crisp edges, packed with spice.\r\n",
  recipeYield: "about 30 cookies",
  tags: ["dessert", "cookies", "american"],
  ingredients: [
    { ingredient: "2 cups all-purpose flour" },
    { ingredient: "1 tsp baking soda" },
    { ingredient: "1 cup granulated sugar" },
  ],
  instructions: [
    { text: "Whisk the flour and baking soda together." },
    { text: "Beat the sugar in, then bake for 13 minutes." },
  ],
  prepTime: 75,
  cookTime: 13,
  totalTime: 110,
  source: {
    url: "https://sallysbakingaddiction.com/crisp-molasses-cookies/",
    name: "Sally's Baking Addiction",
  },
};

describe("changedFields / changeText (43e1)", () => {
  it("counts nothing for the values the form was loaded with", () => {
    const loaded = recipeToFormValues(MOLASSES, "crisp-molasses-cookies");
    expect(changedFields(loaded, structuredClone(loaded))).toEqual([]);
    expect(changeText(0)).toEqual({ count: "No changes" });
  });

  it("does not count line endings, a trailing newline or a 0 minutes", () => {
    const loaded = recipeToFormValues(MOLASSES);
    const values = structuredClone(loaded);
    values.description = "Crisp edges, packed with spice.";
    values.ingredients = [
      { ingredient: "2 cups all-purpose flour", type: undefined },
      ...loaded.ingredients.slice(1),
    ];
    const noTimes = recipeToFormValues({ ...MOLASSES, cookTime: undefined });
    expect(changedFields(loaded, values)).toEqual([]);
    expect(
      changedFields(noTimes, { ...structuredClone(noTimes), cookTime: 0 }),
    ).toEqual([]);
  });

  it("counts real field changes, and a source part each", () => {
    const loaded = recipeToFormValues(MOLASSES);
    const values = structuredClone(loaded);
    values.name = "Crisper Molasses Cookies";
    values.tags = [...values.tags, "christmas"];
    values.ingredients = values.ingredients.slice(1);
    values.source.author = "Sally";
    values.drink.method = "shake";
    expect(changedFields(loaded, values)).toEqual([
      "name",
      "tags",
      "ingredients",
      "source.author",
      "drink.method",
    ]);
    expect(changeText(1)).toEqual({ count: "1 change", rest: "· not saved" });
    expect(changeText(5)).toEqual({ count: "5 changes", rest: "· not saved" });
  });

  it("a letter typed and deleted is no change", () => {
    const loaded = recipeToFormValues(MOLASSES);
    const typed = { ...structuredClone(loaded), name: `${loaded.name}s` };
    expect(changedFields(loaded, typed)).toEqual(["name"]);
    const back = { ...typed, name: loaded.name };
    expect(changedFields(loaded, back)).toEqual([]);
  });
});

describe("sectionStatuses (43e1)", () => {
  const loaded = recipeToFormValues(MOLASSES);

  it("says what came from the page and counts what is there", () => {
    const statuses = sectionStatuses(loaded, {
      fromLabel: "from the page",
      loaded,
      picture: "page",
    });
    expect(statuses).toEqual({
      /* 43e2: the drink spec's row (shown only on a drink). */
      drink: { text: "none yet" },
      recipe: { text: "from the page" },
      tags: { text: "3 chosen" },
      picture: { text: "from the page" },
      ingredients: { text: "3" },
      steps: { text: "2 · all lines used", tone: "ok" },
      times: { text: "1h 50m" },
      source: { text: "Sally's Baking Addiction" },
    });
  });

  it("drops 'from the page' once the section is edited, and flags errors", () => {
    const values = { ...structuredClone(loaded), name: "Mine now" };
    const statuses = sectionStatuses(values, {
      fromLabel: "from the page",
      loaded,
      picture: "none",
      errors: { slug: ['A recipe with slug "x" already exists.'] },
    });
    expect(statuses.recipe).toEqual({});
    expect(statuses.picture).toEqual({ text: "none" });
    expect(statuses.source).toEqual({ text: "check", tone: "error" });
  });

  it("an empty form asks for a name and counts nothing", () => {
    const empty = recipeToFormValues();
    const statuses = sectionStatuses(empty, { loaded: empty, picture: "none" });
    expect(statuses.recipe).toEqual({ text: "needs a name", tone: "warn" });
    expect(statuses.ingredients).toEqual({ text: "none yet" });
    expect(statuses.steps).toEqual({ text: "none yet" });
    expect(statuses.times).toEqual({});
    expect(statuses.source).toEqual({});
  });

  it("names the site from the link when there is no site name", () => {
    const values = structuredClone(loaded);
    values.source = {
      url: "https://www.example.com/pie",
      name: "",
      author: "",
    };
    expect(
      sectionStatuses(values, { loaded, picture: "saved" }).source,
    ).toEqual({ text: "example.com" });
  });

  it("says nothing about lines when a line is not named in a step", () => {
    const values = structuredClone(loaded);
    values.ingredients = [
      ...values.ingredients,
      { ingredient: "For rolling:", type: "heading" },
      { ingredient: "2/3 cup coarse sugar" },
      { ingredient: "1 tsp ground cloves" },
    ];
    expect(allLinesUsed(values)).toBe(false);
    expect(sectionStatuses(values, { loaded, picture: "none" }).steps).toEqual({
      text: "2",
    });
  });

  it("counts a group's steps, and maps error keys to their section", () => {
    expect(
      stepCount([
        { text: "One" },
        { name: "Crust", instructions: [{ text: "Two" }, { text: "Three" }] },
      ]),
    ).toBe(3);
    expect([
      ...errorSections({
        name: ["required"],
        "ingredients[2].ingredient": ["empty"],
        "source.url": ["bad"],
        prepTime: [],
      }),
    ]).toEqual(["recipe", "ingredients", "source"]);
  });
});

describe("nextCopySlug (43e1)", () => {
  it("adds -2, or the first free number after it", async () => {
    expect(await nextCopySlug("cookies", () => false)).toBe("cookies-2");
    const taken = new Set(["cookies-2", "cookies-3"]);
    expect(await nextCopySlug("cookies", (slug) => taken.has(slug))).toBe(
      "cookies-4",
    );
  });

  it("counts on from a slug that already ends in a number", async () => {
    const original = (slug: string) => slug === "cookies";
    expect(await nextCopySlug("cookies-2", original)).toBe("cookies-3");
    /* A year is part of the name, not a copy number. */
    const year = (slug: string) => slug === "best-of";
    expect(await nextCopySlug("best-of-2024", year)).toBe("best-of-2024-2");
    /* A small number with no original under it is a name too. */
    expect(await nextCopySlug("top-10", () => false)).toBe("top-10-2");
    /* A number that is the whole name is the name. */
    expect(await nextCopySlug("1905", () => false)).toBe("1905-2");
  });

  it("gives up after its limit rather than looping", async () => {
    await expect(nextCopySlug("x", () => true, 3)).rejects.toThrow(
      /No free slug/,
    );
  });
});

describe("the duplicate check's lookup (43e1)", () => {
  let contentDirectory: string;
  let ctx: CurationContext;

  beforeEach(async () => {
    contentDirectory = await mkdtemp(join(tmpdir(), "edit-form-"));
    const git = simpleGit({ baseDir: contentDirectory });
    await git.init();
    await git.addConfig("user.email", "curator@test.local");
    await git.addConfig("user.name", "Test Curator");
    await git.addConfig("commit.gpgsign", "false");
    await writeFile(
      join(contentDirectory, ".gitignore"),
      derivedContentPaths(recipeContentTypes),
    );
    await git.add(".");
    await git.commit("Initial commit");
    ctx = {
      contentDirectory,
      author: { name: "Test Curator", email: "curator@test.local" },
    };
  });

  afterEach(async () => {
    await closeCachedEnvironments();
    await rm(contentDirectory, { recursive: true, force: true });
  });

  it("finds the recipe imported from the same link, however it is written", async () => {
    expect(await recipeBySource(ctx, MOLASSES.source.url)).toBeUndefined();
    await createRecipe(ctx, {
      name: MOLASSES.name,
      ingredients: ["1 cup sugar"],
      source: MOLASSES.source,
    });
    for (const url of [
      MOLASSES.source.url,
      "https://www.sallysbakingaddiction.com/crisp-molasses-cookies",
      "https://sallysbakingaddiction.com/crisp-molasses-cookies/#wprm-recipe",
    ]) {
      const found = await recipeBySource(ctx, url);
      expect(found?.slug).toBe("crisp-molasses-cookies");
      expect(found?.recipe.name).toBe(MOLASSES.name);
    }
    expect(
      await recipeBySource(ctx, "https://sallysbakingaddiction.com/other/"),
    ).toBeUndefined();
    expect(await recipeBySource(ctx, "not a link")).toBeUndefined();

    /* And the copy's slug is the first free one after it. */
    expect(await resolveCopySlug(ctx, { name: MOLASSES.name })).toBe(
      "crisp-molasses-cookies-2",
    );
  });
});
