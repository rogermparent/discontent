// @vitest-environment node
//
// 43e2: edit form B's fields — tags by facet (`tagPicker.ts`), ingredient
// rows (`ingredientRows.ts`), what the steps say (`stepChecks.ts`) and the
// drink method's style tag (`drinkMethod.ts`). Pure modules, real-shaped
// inputs (copied shapes, never reads of `editor/content`).

import { describe, expect, it } from "vitest";

import {
  carriersFromRows,
  countFacets,
  buildFacetModel,
  type FacetTerm,
} from "../websites/recipe-website/common/util/facets";
import type { TermRowMap } from "../websites/recipe-website/common/controller/tagVocabulary";
import {
  addTag,
  buildTagPicker,
  exactOption,
  looseTags,
  pickerGroups,
  searchPickerTerms,
  serializeFacetCounts,
  tagSelection,
  tagSuggestions,
  tagsSayDrink,
  toggleTerm,
  type TagPicker,
} from "../websites/recipe-website/common/components/Form/Tags/tagPicker";
import {
  ingredientFlags,
  inlineRuns,
  lineSegments,
  linesAsText,
  linesFromText,
  markLine,
  plainLine,
  remarkLine,
  splitLine,
} from "../websites/recipe-website/common/components/Form/Ingredients/ingredientRows";
import {
  ingredientChipLabel,
  stepLines,
  stepWaits,
  timesHint,
  unnamedLines,
} from "../websites/recipe-website/common/components/Form/Instructions/stepChecks";
import {
  ownedMethodTag,
  tagsForMethod,
} from "../websites/recipe-website/common/components/Form/Drink/drinkMethod";
import {
  ingredientChecks,
  recipeSections,
  sectionStatuses,
} from "../websites/recipe-website/common/components/Form/sections";
import { recipeToFormValues } from "../websites/recipe-website/common/components/Form/formContext";

/* The vocabulary's shapes after 43k, trimmed. */
const TERMS: FacetTerm[] = [
  { slug: "course", label: "Course", record: true },
  { slug: "dessert", label: "Desserts", parent: "course", record: true },
  { slug: "cookies", label: "Cookies", parent: "dessert", record: true },
  { slug: "linzer", label: "Linzer Cookies", parent: "cookies", record: true },
  { slug: "main", label: "Mains", parent: "course", record: true },
  { slug: "cuisine", label: "Cuisine", record: true },
  { slug: "american", label: "American", parent: "cuisine", record: true },
  {
    slug: "mexican",
    label: "Mexican & Tex-Mex",
    parent: "cuisine",
    aliases: ["tex-mex"],
    record: true,
  },
  { slug: "effort", label: "Speed & effort", record: true },
  { slug: "easy", label: "Easy", parent: "effort", record: true },
  { slug: "holidays", label: "Holidays", record: true },
  { slug: "christmas", label: "Christmas", parent: "holidays", record: true },
  { slug: "fall", label: "Fall Favorites", record: true },
  { slug: "drink", label: "Drinks", record: true },
  { slug: "sour", label: "Sour", parent: "drink", record: true },
  { slug: "shaken", label: "Shaken", parent: "drink", record: true },
  { slug: "stirred", label: "Stirred", parent: "drink", record: true },
  { slug: "bees-knees", label: "Bee's Knees", parent: "drink", record: true },
  { slug: "daiquiri", label: "Daiquiri", parent: "drink", record: true },
  { slug: "spirit", label: "Spirit & base", record: true },
  { slug: "gin", label: "Gin", parent: "spirit", record: true },
  { slug: "rum", label: "Rum", parent: "spirit", record: true },
  /* Carried only, no record: a loose tag. */
  { slug: "weeknight", label: "weeknight" },
];

/** The by-term rows the server reads: which recipes carry which key. */
const ROWS: TermRowMap = {
  cookies: {
    label: "cookies",
    items: [{ slug: "molasses" }, { slug: "snickerdoodles" }],
  },
  dessert: {
    label: "dessert",
    items: [{ slug: "molasses" }, { slug: "brownies" }],
  },
  american: { label: "american", items: [{ slug: "molasses" }] },
  christmas: { label: "christmas", items: [{ slug: "molasses" }] },
  drink: { label: "drink", items: [{ slug: "bees" }, { slug: "daiquiri" }] },
  gin: { label: "gin", items: [{ slug: "bees" }] },
  rum: { label: "rum", items: [{ slug: "daiquiri" }] },
  sour: { label: "sour", items: [{ slug: "bees" }, { slug: "daiquiri" }] },
  shaken: { label: "shaken", items: [{ slug: "bees" }] },
  "bees-knees": { label: "bees-knees", items: [{ slug: "bees" }] },
  weeknight: { label: "weeknight", items: [{ slug: "brownies" }] },
} as unknown as TermRowMap;

function picker(): TagPicker {
  const model = buildFacetModel(TERMS);
  return buildTagPicker({
    terms: TERMS,
    counts: serializeFacetCounts(countFacets(model, carriersFromRows(ROWS))),
  });
}

describe("tags by facet (tagPicker)", () => {
  it("draws the food facets with corpus counts, sorted by label", () => {
    const groups = pickerGroups(picker(), "food");
    expect(groups.map((group) => group.id)).toEqual([
      "course",
      "cuisine",
      "effort",
      "holidays",
    ]);
    const course = groups[0];
    expect(course.rows.map((row) => [row.label, row.count])).toEqual([
      ["Desserts", 3],
      ["Mains", 0],
    ]);
    /* Children nest: Desserts › Cookies › Linzer Cookies. */
    expect(course.rows[0].children.map((row) => row.label)).toEqual([
      "Cookies",
    ]);
  });

  it("draws a drink's facets: Spirit & base first, then the styles and the name", () => {
    const groups = pickerGroups(picker(), "drinks");
    expect(groups.map((group) => group.id)).toEqual([
      "spirit",
      "style",
      "strength-method",
      "families",
    ]);
    expect(groups[0].rows.map((row) => [row.label, row.count])).toEqual([
      ["Gin", 1],
      ["Rum", 1],
    ]);
  });

  it("reads chosen terms by any spelling, and the parents a child reaches", () => {
    const { model } = picker();
    const selection = tagSelection(model, ["Cookies", "tex-mex", "weeknight"]);
    expect([...selection.chosen.keys()]).toEqual([
      "cookies",
      "mexican",
      "weeknight",
    ]);
    expect(selection.implied.get("dessert")).toEqual(["cookies"]);
    expect(selection.implied.get("course")).toEqual(["cookies"]);
    expect(selection.implied.get("cuisine")).toEqual(["mexican"]);
    /* A chosen term is never also "reached". */
    expect(selection.implied.has("cookies")).toBe(false);
  });

  it("a child does not add its parent: picking Cookies stores only cookies", () => {
    const { model } = picker();
    expect(toggleTerm(model, ["american"], "cookies")).toEqual([
      "american",
      "cookies",
    ]);
  });

  it("unpicking a term removes every spelling of it and nothing else", () => {
    const { model } = picker();
    expect(
      toggleTerm(
        model,
        ["Mexican & Tex-Mex", "american", "tex-mex"],
        "mexican",
      ),
    ).toEqual(["american"]);
  });

  it("adds a typed tag normalized, unless the recipe already has that term", () => {
    const { model } = picker();
    expect(addTag(model, ["dessert"], "  Fall  Favorites ")).toEqual([
      "dessert",
      "fall favorites",
    ]);
    expect(addTag(model, ["dessert"], "Desserts")).toEqual(["dessert"]);
    expect(addTag(model, ["dessert"], "typo")).toEqual(["dessert", "typo"]);
    expect(addTag(model, ["dessert"], "   ")).toEqual(["dessert"]);
  });

  it("knows a drink by any tag under `drink`, and without a vocabulary by `drink`", () => {
    const { model } = picker();
    expect(tagsSayDrink(model, ["gin", "sour"])).toBe(true);
    expect(tagsSayDrink(model, ["gin"])).toBe(false);
    expect(tagsSayDrink(model, ["dessert"])).toBe(false);
    const empty = buildTagPicker(undefined).model;
    expect(tagsSayDrink(empty, ["Drink"])).toBe(true);
    expect(tagsSayDrink(empty, ["dessert"])).toBe(false);
  });

  it("keeps the import's suggestions that name a term, minus those chosen", () => {
    const { model } = picker();
    expect(
      tagSuggestions(
        model,
        ["Dessert", "Christmas", "Tex-Mex", "cookie recipes", "christmas"],
        ["christmas"],
      ),
    ).toEqual([
      { tag: "Dessert", slug: "dessert", label: "Desserts" },
      { tag: "Tex-Mex", slug: "mexican", label: "Mexican & Tex-Mex" },
    ]);
  });

  it("finds terms for Anything else by word start, label, slug or alias", () => {
    /* "tex" starts a word of the label; the alias is said when spelled out. */
    expect(
      searchPickerTerms(picker(), "tex", []).map((m) => [m.slug, m.alias]),
    ).toEqual([["mexican", undefined]]);
    const found = searchPickerTerms(picker(), "Tex-Mex", []);
    expect(found.map((match) => [match.slug, match.alias])).toEqual([
      ["mexican", "tex-mex"],
    ]);
    const cookies = searchPickerTerms(picker(), "cook", []);
    expect(cookies[0]).toMatchObject({
      slug: "cookies",
      trail: ["Course", "Desserts"],
      count: 2,
    });
    /* Chosen terms are not offered again. */
    expect(
      searchPickerTerms(picker(), "cook", ["cookies"]).map((m) => m.slug),
    ).toEqual(["linzer"]);
    expect(exactOption(found, "Tex-Mex")).toBe(0);
    expect(exactOption(found, "te")).toBe(-1);
  });

  it("offers loose tags as one-click adds, or the old list without data", () => {
    expect(looseTags(picker(), [])).toEqual(["weeknight"]);
    expect(looseTags(picker(), ["weeknight"])).toEqual([]);
    expect(
      looseTags(buildTagPicker(undefined), ["soup"], ["soup", "Baked"]),
    ).toEqual(["baked"]);
  });
});

describe("ingredient rows (ingredientRows)", () => {
  it("shows a stored line without its markup", () => {
    expect(
      plainLine(
        '<Multiplyable baseNumber="3/4" /> oz [honey syrup](/recipe/honey-syrup)',
      ),
    ).toBe("3/4 oz [honey syrup](/recipe/honey-syrup)");
  });

  it("posts an untouched or retyped-the-same line back byte for byte", () => {
    /* A hand-placed mark createIngredient would not make. */
    const stored = 'Juice of <Multiplyable baseNumber="2" /> limes';
    expect(remarkLine(stored, "Juice of 2 limes")).toBe(stored);
  });

  it("re-marks an edited line as a paste is marked", () => {
    expect(
      remarkLine('<Multiplyable baseNumber="2" /> cups sugar', "3 cups sugar"),
    ).toBe('<Multiplyable baseNumber="3" /> cups sugar');
    /* Markup typed by hand is read as its number, never marked twice. */
    expect(remarkLine("", '<Multiplyable baseNumber="2" /> tsp pepper')).toBe(
      '<Multiplyable baseNumber="2" /> tsp pepper',
    );
    expect(remarkLine("1 cup", "")).toBe("");
  });

  it("keeps a leading emphasis pair when it marks a line", () => {
    expect(remarkLine("", "*Optional:* 3 sprigs mint")).toBe(
      '*Optional:* <Multiplyable baseNumber="3" /> sprigs mint',
    );
    expect(remarkLine("", "**Garnish:** 1 lime wheel")).toBe(
      '**Garnish:** <Multiplyable baseNumber="1" /> lime wheel',
    );
    /* A bullet is still a bullet. */
    expect(remarkLine("", "* 2 cups flour")).toBe(
      '<Multiplyable baseNumber="2" /> cups flour',
    );
    /* Through Edit as text too, and a whole-line emphasis heading. */
    expect(
      linesFromText("*Optional:* 3 sprigs mint\n*For the glaze:*", []),
    ).toEqual([
      { ingredient: '*Optional:* <Multiplyable baseNumber="3" /> sprigs mint' },
      { ingredient: "*For the glaze:*", type: "heading" },
    ]);
    expect(markLine("")).toBeUndefined();
  });

  it("marks every number in an edited line, as an import does (De2-9); a heading row never", () => {
    /* createIngredient — the paste and import marker — marks each number
     * outside a per-serving line; an edited row is marked the same way. */
    expect(remarkLine("", "1 (9-inch) pie crust")).toBe(
      '<Multiplyable baseNumber="1" /> (<Multiplyable baseNumber="9" />-inch) pie crust',
    );
    /* A heading row stores what was typed. */
    expect(remarkLine("For the crust", "For the 9-inch crust", true)).toBe(
      "For the 9-inch crust",
    );
    expect(remarkLine("", "  Bake at 350°F:  ", true)).toBe("Bake at 350°F:");
    /* Untouched, a marked heading keeps its markup. */
    const marked = 'For <Multiplyable baseNumber="2" /> pies';
    expect(remarkLine(marked, "For 2 pies", true)).toBe(marked);
  });

  it("splits the amount column from the line", () => {
    expect(
      splitLine("2 cups (250g) all-purpose flour (spooned & leveled)"),
    ).toEqual({
      amount: "2 cups · 250g",
      rest: "all-purpose flour (spooned & leveled)",
    });
    expect(splitLine("1 large egg, room temperature")).toEqual({
      amount: "1",
      rest: "large egg, room temperature",
    });
    expect(splitLine("3/4 oz [honey syrup](/recipe/honey-syrup)")).toEqual({
      amount: "3/4 oz",
      rest: "[honey syrup](/recipe/honey-syrup)",
    });
    expect(splitLine("Kosher salt")).toEqual({
      amount: "",
      rest: "Kosher salt",
    });
    /* "4 cloves": the unit is the name. */
    expect(splitLine("4 cloves")).toEqual({ amount: "4", rest: "cloves" });
    expect(splitLine("1 1/2 tsp salt").amount).toBe("1 1/2 tsp");
    expect(splitLine("2-3 tbsp oil").amount).toBe("2-3 tbsp");
  });

  it("mutes the asides: brackets and a dash-led tail, never a link target", () => {
    expect(lineSegments("unsalted butter, softened (12 Tbsp)")).toEqual([
      { text: "unsalted butter, softened ", aside: false },
      { text: "(12 Tbsp)", aside: true },
    ]);
    expect(lineSegments("granulated or coarse sugar* — for rolling")).toEqual([
      { text: "granulated or coarse sugar*", aside: false },
      { text: " — for rolling", aside: true },
    ]);
    expect(lineSegments("[honey syrup](/recipe/honey-syrup)")).toEqual([
      { text: "[honey syrup](/recipe/honey-syrup)", aside: false },
    ]);
  });

  it("flags a * that points at a note, not markdown emphasis", () => {
    expect(
      ingredientFlags("granulated or coarse sugar* — for rolling"),
    ).toEqual(["note-mark"]);
    expect(ingredientFlags("2 tsp **sugar**")).toEqual([]);
    expect(ingredientFlags("1 cup *strong* coffee")).toEqual([]);
    expect(ingredientFlags("1 cup flour")).toEqual([]);
  });

  it("reads the inline markdown a line uses", () => {
    expect(inlineRuns("2 tsp **sugar** and [syrup](/recipe/syrup)")).toEqual([
      { type: "text", text: "2 tsp " },
      { type: "strong", text: "sugar" },
      { type: "text", text: " and " },
      { type: "link", text: "syrup", href: "/recipe/syrup" },
    ]);
  });

  it("Edit as text keeps every line that reads the same, marks the new ones", () => {
    const lines = [
      { ingredient: "For the drink", type: "heading" as const },
      { ingredient: 'Juice of <Multiplyable baseNumber="2" /> limes' },
      { ingredient: '<Multiplyable baseNumber="2" /> oz gin' },
    ];
    const text = linesAsText(lines);
    expect(text).toBe("For the drink\nJuice of 2 limes\n2 oz gin");
    /* Unchanged: the very same lines, headings and hand marks included. */
    expect(linesFromText(text, lines)).toEqual(lines);
    /* A line edited and one added. */
    expect(
      linesFromText(`${text.replace("2 oz", "3 oz")}\n\n1 egg white`, lines),
    ).toEqual([
      lines[0],
      lines[1],
      { ingredient: '<Multiplyable baseNumber="3" /> oz gin' },
      { ingredient: '<Multiplyable baseNumber="1" /> egg white' },
    ]);
  });

  it("Edit as text keeps a stored line's whitespace and a line cut and pasted back", () => {
    const lines = [
      { ingredient: ' <Multiplyable baseNumber="2" /> cups flour ' },
      { ingredient: 'Juice of <Multiplyable baseNumber="2" /> limes' },
    ];
    const text = linesAsText(lines);
    expect(linesFromText(text, lines)).toEqual(lines);
    /* Cut: the list loses the line; pasted back, the pool (the list as it
     * was when the text opened) still has it, hand mark and all. */
    const cut = linesFromText(text.split("\n")[0], lines);
    expect(cut).toEqual([lines[0]]);
    expect(linesFromText(text, [...cut, ...lines])).toEqual(lines);
  });

  it("counts flagged lines for the rail: 12 · 1 check", () => {
    const values = recipeToFormValues({
      name: "Crisp Molasses Cookies",
      ingredients: [
        { ingredient: '<Multiplyable baseNumber="1" /> tsp baking soda' },
        { ingredient: "granulated or coarse sugar* — for rolling" },
      ],
    });
    expect(ingredientChecks(values)).toBe(1);
    const status = sectionStatuses(values, {
      loaded: values,
      picture: "none",
    });
    expect(status.ingredients).toEqual({ text: "2 · 1 check", tone: "warn" });
  });
});

describe("what the steps say (stepChecks)", () => {
  const ingredients = [
    { ingredient: '<Multiplyable baseNumber="2" /> cups all-purpose flour' },
    { ingredient: '<Multiplyable baseNumber="1" /> tsp baking soda' },
    { ingredient: '<Multiplyable baseNumber="1" /> cup granulated sugar' },
    { ingredient: "Flaky salt, for serving" },
  ];
  const instructions = [
    { text: "Whisk the flour and baking soda together." },
    {
      text: "Beat the sugar for about 1 minute. Cover and chill the dough for 1 hour in the refrigerator.",
    },
    { text: "Bake for 13 minutes." },
  ];

  it("lists the lines a step uses with their short names", () => {
    const lines = stepLines(ingredients, instructions);
    expect(lines).toEqual([[[0, 1]], [[2]], [[]]]);
    /* The matcher's own name for the line (`toName`, 43n may shorten it). */
    expect(ingredientChipLabel(ingredients[0])).toBe("all purpose flour");
    expect(ingredientChipLabel(ingredients[2])).toBe("granulated sugar");
    expect(unnamedLines(ingredients, lines)).toEqual([3]);
  });

  it("names the waits: a waiting word before the time, or half an hour", () => {
    expect(stepWaits(instructions[1].text)).toEqual([
      { label: "chill 1 hour", seconds: 3600, verb: "chill" },
    ]);
    expect(stepWaits("Bake for 13 minutes.")).toEqual([]);
    expect(stepWaits("Bake for 45 minutes, until golden.")).toEqual([
      { label: "45 minutes", seconds: 2700 },
    ]);
    expect(stepWaits("Let it rest for 10 minutes.")).toEqual([
      { label: "rest 10 minutes", seconds: 600, verb: "rest" },
    ]);
  });

  it("says where the total's extra time is, only when it is plain", () => {
    expect(
      timesHint({ prepTime: 75, cookTime: 13, totalTime: 110, instructions }),
    ).toEqual({ sum: "1h 28m", rest: "the rest is the chill in step 2" });
    expect(
      timesHint({
        prepTime: 10,
        cookTime: 20,
        totalTime: 45,
        instructions: [{ text: "Mix." }],
      }),
    ).toEqual({ sum: "30m", rest: "the other 15m is waiting" });
    expect(
      timesHint({ prepTime: 10, cookTime: 20, totalTime: 30, instructions }),
    ).toEqual({ sum: "30m", rest: "the same as the total" });
    expect(
      timesHint({ prepTime: 10, cookTime: 0, totalTime: 30, instructions }),
    ).toBeUndefined();
  });
});

describe("the drink method sets its style tag (drinkMethod)", () => {
  it("adds the method's tag, and owns it", () => {
    expect(tagsForMethod(["drink", "gin"], "shake", undefined)).toEqual({
      tags: ["drink", "gin", "shaken"],
      owned: "shaken",
    });
  });

  it("swaps only the tag it set", () => {
    expect(tagsForMethod(["drink", "shaken"], "stir", "shaken")).toEqual({
      tags: ["drink", "stirred"],
      owned: "stirred",
    });
  });

  it("never removes a tag the person set by hand", () => {
    /* `shaken` was there, not the method's: switching to stir keeps it. */
    expect(tagsForMethod(["drink", "shaken"], "stir", undefined)).toEqual({
      tags: ["drink", "shaken", "stirred"],
      owned: "stirred",
    });
    /* The method's tag already carried by hand stays the person's. */
    expect(tagsForMethod(["stirred"], "stir", undefined)).toEqual({
      tags: ["stirred"],
      owned: undefined,
    });
  });

  it("blend sets none, and clearing takes back only its own tag", () => {
    expect(tagsForMethod(["drink", "shaken"], "blend", "shaken")).toEqual({
      tags: ["drink"],
      owned: undefined,
    });
    expect(tagsForMethod(["drink", "built"], undefined, "built")).toEqual({
      tags: ["drink"],
      owned: undefined,
    });
  });

  it("owns the loaded method's tag when the recipe carries it", () => {
    expect(ownedMethodTag("shake", ["drink", "shaken"])).toBe("shaken");
    expect(ownedMethodTag("shake", ["drink"])).toBeUndefined();
    expect(ownedMethodTag("blend", ["drink"])).toBeUndefined();
  });
});

describe("the sections on a drink", () => {
  it("lead with the drink spec", () => {
    expect(recipeSections(true).map((section) => section.id)).toEqual([
      "drink",
      "recipe",
      "tags",
      "picture",
      "ingredients",
      "steps",
      "times",
      "source",
    ]);
    expect(recipeSections(false)[0].id).toBe("recipe");
  });
});
