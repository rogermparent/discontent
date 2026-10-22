import { describe, expect, it } from "vitest";
import type { FacetTerm } from "../websites/recipe-website/common/util/facets";
import {
  MATCH_LIMIT,
  addTag,
  buildTagPicker,
  exactOption,
  facetLabel,
  searchPickerTerms,
  tagFieldOptions,
  tagSelection,
  tagSuggestions,
  toggleTerm,
} from "../websites/recipe-website/common/components/Form/Tags/tagPicker";

/*
 * 45a: the tag picker's type-ahead — what the Suggestions area lists for the
 * text in the field, how it ranks, and what it says at rest. A trimmed copy
 * of the real vocabulary's shapes (never read from `editor/content`): food
 * facet roots with children, a nested chain, an aliased cuisine, the bar
 * with a drink-name family, and a carried-only tag no facet places.
 */
const TERMS: FacetTerm[] = [
  { slug: "course", label: "Course", record: true },
  { slug: "dessert", label: "Desserts", parent: "course", record: true },
  { slug: "cookies", label: "Cookies", parent: "dessert", record: true },
  { slug: "main", label: "Mains", parent: "course", record: true },
  { slug: "cuisine", label: "Cuisine", record: true },
  {
    slug: "mexican",
    label: "Mexican & Tex-Mex",
    parent: "cuisine",
    aliases: ["tex-mex"],
    record: true,
  },
  { slug: "effort", label: "Speed & effort", record: true },
  { slug: "braise", label: "Braise", parent: "effort", record: true },
  { slug: "quick", label: "Quick", parent: "effort", record: true },
  { slug: "drink", label: "Drinks", record: true },
  { slug: "negroni", label: "Negroni", parent: "drink", record: true },
  /* Carried only: no record, no parent — no facet places it. */
  { slug: "soup", label: "soup" },
  { slug: "sourdough", label: "sourdough" },
];

const COUNTS: [string, number][] = [
  ["course", 30],
  ["dessert", 12],
  ["cookies", 7],
  ["main", 15],
  ["cuisine", 9],
  ["mexican", 4],
  ["effort", 20],
  ["braise", 14],
  ["quick", 6],
  ["drink", 11],
  ["negroni", 3],
  ["soup", 5],
  ["sourdough", 2],
];

const picker = buildTagPicker({ terms: TERMS, counts: COUNTS });

describe("buildTagPicker", () => {
  it("reads the subtree counts as a map", () => {
    expect(picker.counts.get("braise")).toBe(14);
    expect(picker.model.terms.size).toBe(TERMS.length);
  });

  it("builds an empty picker without data", () => {
    const empty = buildTagPicker(undefined);
    expect(empty.model.terms.size).toBe(0);
    expect(empty.counts.size).toBe(0);
    expect(searchPickerTerms(empty, "so", [])).toEqual([]);
  });
});

describe("facetLabel", () => {
  it("names the facet a term sits in, through its ancestors", () => {
    expect(facetLabel(picker.model, "braise")).toBe("Speed & effort");
    expect(facetLabel(picker.model, "cookies")).toBe("Course");
    expect(facetLabel(picker.model, "mexican")).toBe("Cuisine");
    expect(facetLabel(picker.model, "negroni")).toBe("Families");
  });

  it("says nothing for a carried-only tag no facet places", () => {
    expect(facetLabel(picker.model, "soup")).toBeUndefined();
  });
});

describe("searchPickerTerms", () => {
  it("matches a word start of the label or slug, most carried first", () => {
    const found = searchPickerTerms(picker, "so", []);
    expect(found.map((match) => match.slug)).toEqual(["soup", "sourdough"]);
    expect(found[0]).toMatchObject({ label: "soup", count: 5 });
    /* Not a word start: "ookies" finds nothing. */
    expect(searchPickerTerms(picker, "ookies", [])).toEqual([]);
  });

  it("puts an exact spelling first, whatever the counts", () => {
    const found = searchPickerTerms(picker, "Course", []);
    expect(found[0].slug).toBe("course");
  });

  it("carries the count, the trail and the facet name", () => {
    const [cookies] = searchPickerTerms(picker, "cook", []);
    expect(cookies).toEqual({
      slug: "cookies",
      label: "Cookies",
      trail: ["Course", "Desserts"],
      facet: "Course",
      count: 7,
    });
    const [soup] = searchPickerTerms(picker, "soup", []);
    expect(soup.facet).toBeUndefined();
  });

  it("resolves an alias to its term, and says the alias", () => {
    const [match] = searchPickerTerms(picker, "Tex Mex", []);
    expect(match).toMatchObject({
      slug: "mexican",
      label: "Mexican & Tex-Mex",
      alias: "tex-mex",
    });
  });

  it("leaves out terms the recipe carries, by any spelling", () => {
    expect(
      searchPickerTerms(picker, "so", ["Soup"]).map((match) => match.slug),
    ).toEqual(["sourdough"]);
    expect(searchPickerTerms(picker, "mex", ["tex-mex"])).toEqual([]);
  });

  it("caps the list", () => {
    const many: FacetTerm[] = Array.from({ length: 20 }, (_, index) => ({
      slug: `bean-${index}`,
      label: `Bean ${index}`,
    }));
    const big = buildTagPicker({ terms: many, counts: [] });
    expect(searchPickerTerms(big, "bean", [])).toHaveLength(MATCH_LIMIT);
    expect(MATCH_LIMIT).toBe(12);
  });

  it("finds nothing for an empty or blank field", () => {
    expect(searchPickerTerms(picker, "", [])).toEqual([]);
    expect(searchPickerTerms(picker, "  ", [])).toEqual([]);
  });
});

describe("tagFieldOptions", () => {
  it("is empty at rest", () => {
    expect(tagFieldOptions(picker, "", [])).toEqual({
      matches: [],
      exact: -1,
    });
  });

  it("offers the text as a new tag when no term spells it", () => {
    const options = tagFieldOptions(picker, "  Soup  Night ", []);
    expect(options.matches).toEqual([]);
    expect(options.newTag).toBe("soup night");
  });

  it("offers matches and the new tag together for a partial spelling", () => {
    const options = tagFieldOptions(picker, "sou", []);
    expect(options.matches.map((match) => match.slug)).toEqual([
      "soup",
      "sourdough",
    ]);
    expect(options.exact).toBe(-1);
    expect(options.newTag).toBe("sou");
  });

  it("offers no new tag when a term spells the text exactly", () => {
    const options = tagFieldOptions(picker, "braise", []);
    expect(options.exact).toBe(0);
    expect(options.matches[0].slug).toBe("braise");
    expect(options.newTag).toBeUndefined();
    /* An alias spelled exactly is a term, too. */
    const alias = tagFieldOptions(picker, "tex-mex", []);
    expect(alias.matches[alias.exact].slug).toBe("mexican");
    expect(alias.newTag).toBeUndefined();
  });

  it("says when the recipe already carries what was typed", () => {
    expect(tagFieldOptions(picker, "Braise", ["braise"])).toMatchObject({
      matches: [],
      already: "braise",
    });
    /* Through an alias: the carried spelling is the one said. */
    expect(tagFieldOptions(picker, "tex-mex", ["mexican"]).already).toBe(
      "mexican",
    );
    /* A free string carried as typed. */
    expect(
      tagFieldOptions(picker, "Weeknight", ["weeknight"]).newTag,
    ).toBeUndefined();
  });
});

describe("exactOption", () => {
  it("finds the exact spelling by label, slug or alias", () => {
    const options = searchPickerTerms(picker, "mex", []);
    expect(exactOption(options, "Mexican & Tex-Mex")).toBe(0);
    expect(exactOption(options, "mexican")).toBe(0);
    expect(exactOption(options, "mex")).toBe(-1);
    expect(exactOption(options, "")).toBe(-1);
  });
});

describe("tagSuggestions (the area at rest)", () => {
  it("keeps the import's suggestions that name a term, once each", () => {
    expect(
      tagSuggestions(
        picker.model,
        ["Tex-Mex", "mexican", "Dinner Party", "Cookies"],
        [],
      ),
    ).toEqual([
      { tag: "Tex-Mex", slug: "mexican", label: "Mexican & Tex-Mex" },
      { tag: "Cookies", slug: "cookies", label: "Cookies" },
    ]);
  });

  it("drops a suggestion the recipe already carries", () => {
    expect(tagSuggestions(picker.model, ["cookies"], ["Cookies"])).toEqual([]);
  });

  it("is empty without an import", () => {
    expect(tagSuggestions(picker.model, undefined, [])).toEqual([]);
  });
});

describe("adding and removing (D4: the stored shape never changes)", () => {
  it("appends a picked term's slug, and a child does not add its parent", () => {
    const tags = toggleTerm(picker.model, ["soup"], "cookies");
    expect(tags).toEqual(["soup", "cookies"]);
    const { chosen, implied } = tagSelection(picker.model, tags);
    expect([...chosen.keys()]).toEqual(["soup", "cookies"]);
    expect(implied.get("dessert")).toEqual(["cookies"]);
  });

  it("adds a new tag normalized, and never twice", () => {
    expect(addTag(picker.model, [], "  Soup  Night ")).toEqual(["soup night"]);
    expect(addTag(picker.model, ["mexican"], "Tex-Mex")).toEqual(["mexican"]);
    expect(addTag(picker.model, [], "   ")).toEqual([]);
  });
});
