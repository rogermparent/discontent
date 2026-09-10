import { describe, expect, it } from "vitest";
import {
  appendFilterTerm,
  countFilterTerms,
  cycleTermAt,
  filterTerms,
  filterUsesField,
  groupSearchHref,
  matchesFilter,
  parseQuery,
  positiveTagValues,
  removeFilterTerms,
  removeTermAt,
  tagSearchHref,
  termText,
  toggleTagTerm,
  type FilterableRecipe,
  type FilterNode,
} from "recipe-website-common/components/SearchForm/queryLanguage";

/**
 * A filter with the leaves' `start`/`end` stripped, for the assertions that
 * compare a parsed filter as a *value*.
 *
 * PR 21b put the raw-query span on every leaf so a chip can render and rewrite
 * the atom the user typed. The trade is that AST equality became
 * position-sensitive: `-tag:baked` and `NOT tag:baked` still parse to the same
 * *shape* but no longer to the same object, and every literal below would have
 * to carry two offsets that say nothing about the grammar. Nothing evaluates on
 * the spans — `matchesFilter` ignores them — so the tests that are about the
 * grammar go through here, and the tests that are about the spans assert on them
 * directly.
 */
function spanless(node: FilterNode | undefined): unknown {
  if (!node) return node;
  switch (node.type) {
    case "and":
    case "or":
      return { type: node.type, children: node.children.map(spanless) };
    case "not":
      return { type: "not", child: spanless(node.child) };
    default: {
      const { start: _start, end: _end, ...rest } = node;
      return rest;
    }
  }
}

/** A day at local midnight, matching how `before:`/`after:` parse their operand. */
const day = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date).getTime();

/*
 * `groups` carries slug *and* name per membership, which is what the client
 * decorates the corpus with (22f) — so `group:week-of-may-4` and
 * `group:"week of may"` both reach the same recipes.
 */
const CAKE: FilterableRecipe = {
  name: "Chocolate Truffle Cake",
  date: day(2026, 3, 14),
  description: "A dense flourless chocolate cake with a molten center.",
  ingredients: ["200 g dark chocolate", "4 eggs", "1/2 cup butter"],
  tags: ["dessert", "chocolate"],
  groups: ["week-of-may-4", "Week of May 4"],
  prepTime: 20,
  cookTime: 40,
};

const BRULEE: FilterableRecipe = {
  name: "Crème Brûlée",
  date: day(2025, 1, 5),
  description: "A classic French custard baked slow and low.",
  ingredients: ["2 cups heavy cream", "6 egg yolks"],
  tags: ["dessert", "french"],
  totalTime: 180,
};

const SLAW: FilterableRecipe = {
  name: "Carrot Slaw",
  date: day(2026, 6, 1),
  description: "A bright raw salad dressed with rice vinegar.",
  ingredients: ["4 carrots", "1 tbsp grated ginger"],
  tags: ["salad", "quick"],
  groups: [
    "week-of-may-4",
    "Week of May 4",
    "weeknight-favourites",
    "Weeknight Favourites",
  ],
  prepTime: 10,
};

/** No tags, no times, no description — the filler shape the corpus is full of. */
const PANTRY: FilterableRecipe = {
  name: "Pantry Staple 1",
  date: day(2024, 2, 2),
};

const CORPUS = [CAKE, BRULEE, SLAW, PANTRY];

/** Names of the recipes a whole query keeps, ignoring the free-text half. */
function filtered(raw: string): string[] {
  const { filter } = parseQuery(raw);
  return CORPUS.filter((recipe) => matchesFilter(recipe, filter)).map(
    (recipe) => recipe.name,
  );
}

describe("parseQuery — free text vs typed terms", () => {
  it("passes bare words straight through as free text", () => {
    const parsed = parseQuery("chocolate cake");
    expect(parsed.text).toBe("chocolate cake");
    expect(parsed.filter).toBeUndefined();
    expect(parsed.hasAdvancedSyntax).toBe(false);
  });

  it("splits a mixed query into text and filter", () => {
    const parsed = parseQuery("chocolate cake tag:dessert");
    expect(parsed.text).toBe("chocolate cake");
    expect(spanless(parsed.filter)).toEqual({
      type: "text",
      field: "tag",
      value: "dessert",
    });
    expect(parsed.hasAdvancedSyntax).toBe(true);
  });

  it("treats an unknown prefix as free text, colon and all", () => {
    const parsed = parseQuery("foo:bar");
    expect(parsed.text).toBe("foo:bar");
    expect(parsed.filter).toBeUndefined();
    expect(parsed.hasAdvancedSyntax).toBe(false);
  });

  it("keeps a quoted value with spaces in one term", () => {
    const parsed = parseQuery('tag:"slow cooker"');
    expect(parsed.text).toBe("");
    expect(spanless(parsed.filter)).toEqual({
      type: "text",
      field: "tag",
      value: "slow cooker",
    });
  });

  it("keeps a quoted colon out of the operator position", () => {
    const parsed = parseQuery('"pasta: the sequel"');
    expect(parsed.text).toBe("pasta: the sequel");
    expect(parsed.filter).toBeUndefined();
  });

  it("folds accents off the operand", () => {
    expect(spanless(parseQuery("tag:Crème").filter)).toEqual({
      type: "text",
      field: "tag",
      value: "creme",
    });
  });

  it("is case-insensitive about field names", () => {
    expect(spanless(parseQuery("TAG:dessert").filter)).toEqual({
      type: "text",
      field: "tag",
      value: "dessert",
    });
  });
});

describe("parseQuery — the group: field", () => {
  it("parses a group term as an ordinary text leaf", () => {
    const parsed = parseQuery("group:weeknight-favourites");
    expect(parsed.text).toBe("");
    expect(spanless(parsed.filter)).toEqual({
      type: "text",
      field: "group",
      value: "weeknight-favourites",
    });
    expect(parsed.hasAdvancedSyntax).toBe(true);
  });

  it("negates with the short form and the long one alike", () => {
    const negated = {
      type: "not",
      child: {
        type: "text",
        field: "group",
        value: "weeknight-favourites",
      },
    };
    expect(spanless(parseQuery("-group:weeknight-favourites").filter)).toEqual(
      negated,
    );
    expect(
      spanless(parseQuery("NOT group:weeknight-favourites").filter),
    ).toEqual(negated);
  });

  it("keeps free text beside a group term", () => {
    const parsed = parseQuery("chocolate group:week-of-may-4");
    expect(parsed.text).toBe("chocolate");
    expect(spanless(parsed.filter)).toEqual({
      type: "text",
      field: "group",
      value: "week-of-may-4",
    });
  });
});

describe("parseQuery — booleans, grouping and negation", () => {
  it("implies AND between adjacent terms", () => {
    expect(spanless(parseQuery("tag:dessert tag:chocolate").filter)).toEqual({
      type: "and",
      children: [
        { type: "text", field: "tag", value: "dessert" },
        { type: "text", field: "tag", value: "chocolate" },
      ],
    });
  });

  it("accepts an explicit AND for the same result", () => {
    expect(
      spanless(parseQuery("tag:dessert AND tag:chocolate").filter),
    ).toEqual(spanless(parseQuery("tag:dessert tag:chocolate").filter));
  });

  it("binds OR looser than the implicit AND", () => {
    expect(spanless(parseQuery("tag:a tag:b OR tag:c").filter)).toEqual({
      type: "or",
      children: [
        {
          type: "and",
          children: [
            { type: "text", field: "tag", value: "a" },
            { type: "text", field: "tag", value: "b" },
          ],
        },
        { type: "text", field: "tag", value: "c" },
      ],
    });
  });

  it("lets parentheses override that precedence", () => {
    expect(spanless(parseQuery("tag:a (tag:b OR tag:c)").filter)).toEqual({
      type: "and",
      children: [
        { type: "text", field: "tag", value: "a" },
        {
          type: "or",
          children: [
            { type: "text", field: "tag", value: "b" },
            { type: "text", field: "tag", value: "c" },
          ],
        },
      ],
    });
  });

  it("reads -field:value and NOT field:value the same way", () => {
    const dash = spanless(parseQuery("-tag:baked").filter);
    expect(dash).toEqual({
      type: "not",
      child: { type: "text", field: "tag", value: "baked" },
    });
    expect(spanless(parseQuery("NOT tag:baked").filter)).toEqual(dash);
  });

  it("turns a negated bare word into an all-fields exclusion, not free text", () => {
    const parsed = parseQuery("-chocolate");
    expect(parsed.text).toBe("");
    expect(spanless(parsed.filter)).toEqual({
      type: "not",
      child: { type: "text", field: "any", value: "chocolate" },
    });
    expect(parsed.hasAdvancedSyntax).toBe(true);
  });

  it("does not mistake an interior hyphen for a negation", () => {
    expect(parseQuery("slow-cooked").text).toBe("slow-cooked");
  });

  it("parses the locked example shape", () => {
    const parsed = parseQuery(
      "tag:dessert (ingredient:molasses OR ingredient:chocolate)",
    );
    expect(parsed.text).toBe("");
    expect(spanless(parsed.filter)).toEqual({
      type: "and",
      children: [
        { type: "text", field: "tag", value: "dessert" },
        {
          type: "or",
          children: [
            { type: "text", field: "ingredient", value: "molasses" },
            { type: "text", field: "ingredient", value: "chocolate" },
          ],
        },
      ],
    });
  });
});

describe("parseQuery — comparisons and dates", () => {
  it("parses each comparison operator", () => {
    expect(spanless(parseQuery("time:<30").filter)).toEqual({
      type: "time",
      op: "<",
      minutes: 30,
    });
    expect(spanless(parseQuery("time:>=90").filter)).toEqual({
      type: "time",
      op: ">=",
      minutes: 90,
    });
  });

  it("reads a bare duration as 'or less'", () => {
    expect(spanless(parseQuery("time:30").filter)).toEqual({
      type: "time",
      op: "<=",
      minutes: 30,
    });
  });

  it("parses before:/after: as local midnight", () => {
    expect(spanless(parseQuery("before:2026-01-01").filter)).toEqual({
      type: "date",
      field: "before",
      timestamp: day(2026, 1, 1),
    });
  });

  it("drops an unparseable operand rather than failing the query", () => {
    expect(parseQuery("cake time:soon").filter).toBeUndefined();
    expect(parseQuery("cake before:yesterday").text).toBe("cake");
    expect(parseQuery("before:2026-13-40").filter).toBeUndefined();
  });
});

describe("parseQuery — half-typed input never throws or blanks", () => {
  const fragments = [
    "",
    " ",
    "tag:",
    "tag: ",
    "time:<",
    "time:",
    "-",
    "(",
    ")",
    "((",
    "cake (",
    "(ingredient:beef OR",
    "tag:a OR",
    "OR tag:a",
    "AND",
    "NOT",
    'tag:"slow coo',
    "cake )stray(",
  ];

  it.each(fragments)("survives %j", (fragment) => {
    expect(() => parseQuery(fragment)).not.toThrow();
    const parsed = parseQuery(fragment);
    expect(() =>
      CORPUS.map((r) => matchesFilter(r, parsed.filter)),
    ).not.toThrow();
  });

  it("keeps the typed half of a dangling group working", () => {
    expect(filtered("(ingredient:beef OR")).toEqual([]);
    expect(filtered("(tag:dessert OR")).toEqual([
      "Chocolate Truffle Cake",
      "Crème Brûlée",
    ]);
  });

  it("drops a known field with no operand yet, rather than searching for it", () => {
    // `tag:` is a filter one keystroke from existing. Passing it on as free
    // text would search for the literal word "tag" and blank the page.
    const parsed = parseQuery("cake tag:");
    expect(parsed.filter).toBeUndefined();
    expect(parsed.text).toBe("cake");
    expect(parseQuery("time:<").text).toBe("");
    expect(parseQuery("time:<").filter).toBeUndefined();
  });

  it("still keeps an unknown prefix's whole atom as free text", () => {
    expect(parseQuery("cake foo:").text).toBe("cake foo:");
  });
});

describe("matchesFilter", () => {
  it("matches tags, prefix-first, accent-insensitively", () => {
    expect(filtered("tag:dessert")).toEqual([
      "Chocolate Truffle Cake",
      "Crème Brûlée",
    ]);
    expect(filtered("tag:fren")).toEqual(["Crème Brûlée"]);
  });

  it("matches ingredients within a line", () => {
    expect(filtered("ingredient:ginger")).toEqual(["Carrot Slaw"]);
    expect(filtered("ingredient:egg")).toEqual([
      "Chocolate Truffle Cake",
      "Crème Brûlée",
    ]);
  });

  it("matches name and description separately", () => {
    expect(filtered("name:carrot")).toEqual(["Carrot Slaw"]);
    // "chocolate" is in the cake's name *and* description; "flourless" only the
    // description — so description: is doing its own work here.
    expect(filtered("description:flourless")).toEqual([
      "Chocolate Truffle Cake",
    ]);
    expect(filtered("name:flourless")).toEqual([]);
  });

  it("combines terms with AND, OR and NOT", () => {
    expect(filtered("tag:dessert -tag:chocolate")).toEqual(["Crème Brûlée"]);
    expect(filtered("tag:salad OR tag:french")).toEqual([
      "Crème Brûlée",
      "Carrot Slaw",
    ]);
    expect(
      filtered("tag:dessert (ingredient:yolks OR ingredient:butter)"),
    ).toEqual(["Chocolate Truffle Cake", "Crème Brûlée"]);
  });

  it("compares durations, summing prep + cook when totalTime is absent", () => {
    // Cake is 20 + 40; Slaw is prep-only at 10; Brûlée carries totalTime: 180.
    expect(filtered("time:<30")).toEqual(["Carrot Slaw"]);
    expect(filtered("time:60")).toEqual([
      "Chocolate Truffle Cake",
      "Carrot Slaw",
    ]);
    expect(filtered("time:>120")).toEqual(["Crème Brûlée"]);
  });

  it("never counts a recipe with no timing data as fast", () => {
    expect(filtered("time:<10000")).not.toContain("Pantry Staple 1");
  });

  it("bounds by date, excluding the named day on both sides", () => {
    expect(filtered("before:2026-01-01")).toEqual([
      "Crème Brûlée",
      "Pantry Staple 1",
    ]);
    expect(filtered("after:2026-03-14")).toEqual(["Carrot Slaw"]);
    expect(filtered("after:2026-01-01 before:2026-06-01")).toEqual([
      "Chocolate Truffle Cake",
    ]);
  });

  it("excludes across every field for a negated bare word", () => {
    // "chocolate" is a tag, a name word and an ingredient — all have to go.
    expect(filtered("-chocolate")).toEqual([
      "Crème Brûlée",
      "Carrot Slaw",
      "Pantry Staple 1",
    ]);
  });

  it("matches a group by slug or by name, prefix-first", () => {
    expect(filtered("group:week-of-may-4")).toEqual([
      "Chocolate Truffle Cake",
      "Carrot Slaw",
    ]);
    // The name half of the membership, and a prefix of it.
    expect(filtered("group:weeknight")).toEqual(["Carrot Slaw"]);
    expect(filtered('group:"week of may"')).toEqual([
      "Chocolate Truffle Cake",
      "Carrot Slaw",
    ]);
  });

  it("negates a group term, and composes it with another field", () => {
    expect(filtered("-group:weeknight-favourites")).toEqual([
      "Chocolate Truffle Cake",
      "Crème Brûlée",
      "Pantry Staple 1",
    ]);
    expect(filtered("group:week-of-may-4 tag:salad")).toEqual(["Carrot Slaw"]);
  });

  /*
   * The rule that keeps membership from leaking into ordinary search: a bare
   * word reads a recipe's own text, never the groups it happens to sit in.
   * "Weeknight Favourites" is a group name and appears nowhere on Carrot Slaw,
   * so excluding the word must not exclude the recipe.
   */
  it("never matches through a group for a bare word", () => {
    expect(filtered("-weeknight")).toEqual([
      "Chocolate Truffle Cake",
      "Crème Brûlée",
      "Carrot Slaw",
      "Pantry Staple 1",
    ]);
  });

  it("drops an unconstrained OR operand instead of widening to everything", () => {
    // Free text can't be evaluated here — the engine already applied it — so the
    // tag is the only operand that can constrain the set.
    expect(filtered("(tag:salad OR chocolate)")).toEqual(["Carrot Slaw"]);
  });
});

describe("positiveTagValues / countFilterTerms", () => {
  it("reports the tags a query selects", () => {
    expect(positiveTagValues(parseQuery("tag:a tag:b").filter)).toEqual([
      "a",
      "b",
    ]);
    expect(positiveTagValues(parseQuery("(tag:a OR tag:b)").filter)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not count an excluded tag as selected", () => {
    expect(positiveTagValues(parseQuery("tag:a -tag:b").filter)).toEqual(["a"]);
  });

  it("counts leaf terms, not operators", () => {
    expect(countFilterTerms(parseQuery("cake").filter)).toBe(0);
    expect(
      countFilterTerms(parseQuery("tag:a (tag:b OR tag:c) -time:<30").filter),
    ).toBe(4);
  });
});

/*
 * `filterUsesField` decides whether the client fetches `/search/ingredients`
 * (F4a). Getting it wrong is silent in both directions: too eager and every
 * page load pays for 199 KiB it does not need, too shy and an `ingredient:`
 * filter evaluates against recipes that have no ingredients loaded and reports
 * an empty result set as if it were the truth.
 */
describe("filterUsesField", () => {
  const usesIngredient = (query: string) =>
    filterUsesField(parseQuery(query).filter, "ingredient");

  it("finds a typed term for the field", () => {
    expect(usesIngredient("ingredient:beef")).toBe(true);
  });

  it("is false for a query that needs nothing", () => {
    expect(usesIngredient("chocolate cake")).toBe(false);
    expect(usesIngredient("tag:dessert")).toBe(false);
    expect(usesIngredient("time:<30 before:2024-01-01")).toBe(false);
  });

  /*
   * The one that matters. A negated bare word binds to `"any"`, and
   * `matchesFilter`'s `"any"` arm checks ingredients — so treating `"any"` as
   * ingredient-free would leave the document unfetched and let `-chocolate`
   * quietly keep the very recipes it is there to exclude.
   */
  it("treats a bare negation's `any` field as reading every field", () => {
    expect(spanless(parseQuery("-chocolate").filter)).toEqual({
      type: "not",
      child: { type: "text", field: "any", value: "chocolate" },
    });
    expect(usesIngredient("-chocolate")).toBe(true);
    expect(filterUsesField(parseQuery("-chocolate").filter, "tag")).toBe(true);
  });

  /*
   * Unlike `positiveTagValues`, this descends into `not`: an exclusion still
   * reads the field it excludes on.
   */
  it("descends into not, and, and or", () => {
    expect(usesIngredient("-ingredient:beef")).toBe(true);
    expect(usesIngredient("tag:dessert ingredient:beef")).toBe(true);
    expect(usesIngredient("(tag:a OR ingredient:beef)")).toBe(true);
    expect(usesIngredient("tag:a -(tag:b AND ingredient:beef)")).toBe(true);
    expect(usesIngredient("tag:a -(tag:b AND name:cake)")).toBe(false);
  });

  it("is false for an absent filter", () => {
    expect(filterUsesField(undefined, "ingredient")).toBe(false);
  });

  /*
   * The same gate, for the group document `/search/groups` serves (22f). The
   * `"any"` case reports true here as it does for every text field — a false
   * negative would show `group:` results before the document lands, and the
   * cost of the false positive is one already-fetched query being awaited.
   */
  it("reports whether a query reads group membership", () => {
    const usesGroup = (query: string) =>
      filterUsesField(parseQuery(query).filter, "group");
    expect(usesGroup("group:weeknight-favourites")).toBe(true);
    expect(usesGroup("-group:weeknight-favourites")).toBe(true);
    expect(usesGroup("tag:dessert (group:x OR tag:y)")).toBe(true);
    expect(usesGroup("tag:dessert time:<30")).toBe(false);
    expect(usesGroup("chocolate cake")).toBe(false);
    expect(usesGroup("-chocolate")).toBe(true);
  });

  /* The non-text nodes report only their own field. */
  it("matches comparison and date nodes on their own field", () => {
    expect(filterUsesField(parseQuery("time:<30").filter, "time")).toBe(true);
    expect(filterUsesField(parseQuery("time:<30").filter, "before")).toBe(
      false,
    );
    expect(
      filterUsesField(parseQuery("before:2024-01-01").filter, "before"),
    ).toBe(true);
    expect(
      filterUsesField(parseQuery("before:2024-01-01").filter, "after"),
    ).toBe(false);
  });
});

describe("groupSearchHref", () => {
  /*
   * A `?q=` query rather than a path, unlike `tagSearchHref` — there is no
   * pre-baked page for a group's members, and the point of the link is that the
   * reader can go on editing the query it lands in.
   */
  it("links to a group-narrowed search", () => {
    expect(groupSearchHref("weeknight-favourites")).toBe(
      "/search?q=group%3Aweeknight-favourites",
    );
  });

  it("quotes a value that would tokenize as several atoms", () => {
    expect(groupSearchHref("week of may 4")).toBe(
      "/search?q=group%3A%22week%20of%20may%204%22",
    );
  });

  it("round-trips through the parser", () => {
    const href = groupSearchHref("weeknight-favourites");
    const query = decodeURIComponent(href.slice("/search?q=".length));
    expect(spanless(parseQuery(query).filter)).toEqual({
      type: "text",
      field: "group",
      value: "weeknight-favourites",
    });
  });
});

describe("query rewrites", () => {
  it("adds a tag term to an empty query", () => {
    expect(toggleTagTerm("", "dessert")).toBe("tag:dessert");
  });

  it("appends without disturbing existing free text", () => {
    expect(toggleTagTerm("chocolate cake", "dessert")).toBe(
      "chocolate cake tag:dessert",
    );
  });

  it("removes the term it previously added", () => {
    expect(toggleTagTerm("chocolate cake tag:dessert", "dessert")).toBe(
      "chocolate cake",
    );
  });

  it("round-trips", () => {
    const once = toggleTagTerm("cake", "dessert");
    expect(toggleTagTerm(once, "dessert")).toBe("cake");
  });

  it("quotes a tag with spaces, and finds it again", () => {
    const added = toggleTagTerm("", "slow cooker");
    expect(added).toBe('tag:"slow cooker"');
    expect(spanless(parseQuery(added).filter)).toEqual({
      type: "text",
      field: "tag",
      value: "slow cooker",
    });
    expect(toggleTagTerm(added, "slow cooker")).toBe("");
  });

  it("matches exactly when toggling, unlike evaluation's prefix rule", () => {
    // `tag:b` *matches* "baked" when filtering, but the "baked" chip is not the
    // thing that put `tag:b` there, so toggling adds rather than removes.
    expect(toggleTagTerm("tag:b", "baked")).toBe("tag:b tag:baked");
  });

  it("takes the long-hand NOT away with the term it negated", () => {
    expect(removeFilterTerms("cake NOT tag:baked", "tag")).toBe("cake");
    expect(removeFilterTerms("cake -tag:baked", "tag")).toBe("cake");
  });

  it("clears one field and leaves the rest of the query alone", () => {
    expect(removeFilterTerms("chocolate tag:a time:<30 tag:b", "tag")).toBe(
      "chocolate time:<30",
    );
  });

  it("clears every typed term when no field is named", () => {
    expect(removeFilterTerms("chocolate tag:a time:<30")).toBe("chocolate");
  });

  it("tidies the parentheses and operators a removal orphans", () => {
    expect(removeFilterTerms("cake (tag:a OR tag:b)", "tag")).toBe("cake");
    expect(removeFilterTerms("(tag:a OR tag:b) time:<30", "tag")).toBe(
      "time:<30",
    );
  });

  it("is a no-op on a query with nothing to remove", () => {
    expect(removeFilterTerms("chocolate cake", "tag")).toBe("chocolate cake");
  });
});

describe("tagSearchHref", () => {
  /*
   * Points at the pre-baked `/tags/<slug>` page since F8, not at
   * `/search?q=tag:<tag>`. The old destination needed the client search bundle
   * and the whole corpus to render anything, and could not be indexed.
   */
  it("links to the tag's static page", () => {
    expect(tagSearchHref("dessert")).toBe("/tags/dessert");
  });

  it("slugifies a tag that cannot be a path segment", () => {
    expect(tagSearchHref("slow cooker")).toBe("/tags/slow-cooker");
    expect(tagSearchHref("Half & Half")).toBe("/tags/half-and-half");
  });

  /*
   * The query language still parses `tag:` terms — `/search` remains a
   * first-class surface, and the palette and search field both emit them. Only
   * the *chip destination* moved.
   */
  it("leaves the query language's own tag terms alone", () => {
    expect(spanless(parseQuery('tag:"slow cooker"').filter)).toEqual({
      type: "text",
      field: "tag",
      value: "slow cooker",
    });
  });
});

// --- PR 21b: spans on the leaves, and the rewrites keyed on them -------------

/** The one term in a single-term query, with its span. */
function onlyTerm(raw: string) {
  const terms = filterTerms(parseQuery(raw).filter);
  expect(terms).toHaveLength(1);
  return terms[0];
}

/** Cycle a single-term query once, re-deriving the handle from the string. */
function cycleOnce(raw: string): string {
  return cycleTermAt(raw, onlyTerm(raw));
}

describe("filterTerms — the leaves a chip line draws", () => {
  it("returns every leaf in the order it was typed", () => {
    const raw = "chocolate tag:dessert -tag:baked time:<30";
    const terms = filterTerms(parseQuery(raw).filter);
    expect(terms.map((term) => termText(raw, term))).toEqual([
      "tag:dessert",
      "-tag:baked",
      "time:<30",
    ]);
  });

  it("keeps source order through parentheses", () => {
    const raw = "tag:dessert (ingredient:molasses OR ingredient:chocolate)";
    expect(
      filterTerms(parseQuery(raw).filter).map((term) => termText(raw, term)),
    ).toEqual(["tag:dessert", "ingredient:molasses", "ingredient:chocolate"]);
  });

  it("reports an exclusion as negated, however it was written", () => {
    expect(onlyTerm("-tag:baked").negated).toBe(true);
    expect(onlyTerm("NOT tag:baked").negated).toBe(true);
    expect(onlyTerm("tag:baked").negated).toBe(false);
    // A negated bare word is an exclusion too — the `any` field.
    expect(onlyTerm("-chocolate").negated).toBe(true);
    // Two negations cancel, because the walk counts them rather than latching.
    expect(onlyTerm("NOT -tag:baked").negated).toBe(false);
  });

  it("offers no chip for anything that does not narrow the results", () => {
    // A known field with no operand (judgement call (a)) is dropped by the
    // tokenizer, so there is nothing to draw and nothing claiming to filter.
    expect(filterTerms(parseQuery("cake tag:").filter)).toEqual([]);
    expect(filterTerms(parseQuery("time:<").filter)).toEqual([]);
    // An OR's unconstrained operand (judgement call (c)) likewise: one chip, for
    // the half that is actually evaluated.
    const raw = "tag:a OR chocolate";
    expect(
      filterTerms(parseQuery(raw).filter).map((term) => termText(raw, term)),
    ).toEqual(["tag:a"]);
  });

  it("counts the same leaves the ticker counts", () => {
    const raw = "tag:a (tag:b OR tag:c) -time:<30";
    const { filter } = parseQuery(raw);
    expect(filterTerms(filter)).toHaveLength(countFilterTerms(filter));
  });
});

describe("term spans — raw.slice(start, end) is what the user typed", () => {
  it("renders the text typed, not the folded value it parsed to", () => {
    // The reason chips read the span and not the payload: `value` is pre-folded,
    // so a chip built from it would show `tag:creme` to someone who typed
    // `tag:Crème`.
    const raw = "tag:Crème";
    const term = onlyTerm(raw);
    expect(term.node).toMatchObject({ value: "creme" });
    expect(termText(raw, term)).toBe("tag:Crème");
  });

  it("keeps the quotes inside the span and out of the value", () => {
    const raw = 'tag:"slow cooker"';
    const term = onlyTerm(raw);
    expect(term.node).toMatchObject({ value: "slow cooker" });
    expect(termText(raw, term)).toBe('tag:"slow cooker"');
  });

  it("includes a leading dash, so an exclusion reads as one", () => {
    expect(termText("-tag:baked", onlyTerm("-tag:baked"))).toBe("-tag:baked");
    // Long-hand `NOT` is a separate token, so it is *not* in the span — which is
    // why a chip has to be told `negated` rather than reading the text.
    expect(termText("NOT tag:baked", onlyTerm("NOT tag:baked"))).toBe(
      "tag:baked",
    );
  });

  it("spans a comparison and a date whole", () => {
    expect(termText("time:<30", onlyTerm("time:<30"))).toBe("time:<30");
    expect(termText("before:2026-01-01", onlyTerm("before:2026-01-01"))).toBe(
      "before:2026-01-01",
    );
  });

  it("stays inside the string for every half-typed fragment", () => {
    const fragments = [
      "",
      " ",
      "tag:",
      "time:<",
      "-",
      "(",
      "cake (",
      "(ingredient:beef OR",
      "tag:a OR",
      'tag:"slow coo',
      "cake )stray( tag:a",
      "-chocolate",
    ];
    for (const raw of fragments) {
      for (const term of filterTerms(parseQuery(raw).filter)) {
        expect(term.start).toBeGreaterThanOrEqual(0);
        expect(term.end).toBeLessThanOrEqual(raw.length);
        expect(term.end).toBeGreaterThan(term.start);
      }
    }
  });
});

describe("removeTermAt — one chip's ×", () => {
  it("removes the term it points at and nothing else", () => {
    const raw = "chocolate tag:dessert time:<30";
    const [tag] = filterTerms(parseQuery(raw).filter);
    expect(removeTermAt(raw, tag)).toBe("chocolate time:<30");
  });

  it("takes a long-hand NOT with the term it negated", () => {
    const raw = "cake NOT tag:baked";
    expect(removeTermAt(raw, onlyTerm(raw))).toBe("cake");
    expect(removeTermAt("cake -tag:baked", onlyTerm("cake -tag:baked"))).toBe(
      "cake",
    );
  });

  it("tidies the parentheses and operators the removal orphans", () => {
    const raw = "tag:a (tag:b OR tag:c)";
    const terms = filterTerms(parseQuery(raw).filter);
    const once = removeTermAt(raw, terms[1]);
    expect(once).toBe("tag:a (tag:c)");
    // Re-derived from the *new* string, which is the only handle that exists.
    const twice = removeTermAt(once, filterTerms(parseQuery(once).filter)[1]);
    expect(twice).toBe("tag:a");
  });

  it("edits the copy it points at when a query names one term twice", () => {
    const raw = "tag:dessert time:<30 tag:dessert";
    const terms = filterTerms(parseQuery(raw).filter);
    expect(terms).toHaveLength(3);
    expect(removeTermAt(raw, terms[0])).toBe("time:<30 tag:dessert");
    expect(removeTermAt(raw, terms[2])).toBe("tag:dessert time:<30");
  });

  it("does nothing when the term is not where it says it is", () => {
    // A handle from a longer query, applied to a shorter one: no token spans
    // those offsets, so there is nothing to edit.
    const stale = filterTerms(parseQuery("tag:a tag:b").filter)[1];
    expect(removeTermAt("tag:a", stale)).toBe("tag:a");
    // Same span, different term: `time:<30` and `tag:abcd` are both 0–8, so the
    // span alone would be a coincidence away from editing the wrong thing.
    const timeTerm = onlyTerm("time:<30");
    expect(removeTermAt("tag:abcd", timeTerm)).toBe("tag:abcd");
  });
});

describe("cycleTermAt — the chip body", () => {
  it("flips a text term between include and exclude", () => {
    expect(cycleOnce("tag:dessert")).toBe("-tag:dessert");
    expect(cycleOnce("-tag:dessert")).toBe("tag:dessert");
  });

  it("normalises a long-hand NOT instead of double-negating it", () => {
    expect(cycleOnce("NOT tag:baked")).toBe("tag:baked");
  });

  it("preserves quoting across a flip", () => {
    expect(cycleOnce('tag:"slow cooker"')).toBe('-tag:"slow cooker"');
    expect(cycleOnce('-tag:"slow cooker"')).toBe('tag:"slow cooker"');
  });

  it("de-negating a bare word hands it back to free text", () => {
    // `-choc` is the one term whose chip disappears when cycled: positive bare
    // words are free text and never reach the AST.
    const next = cycleOnce("-choc");
    expect(next).toBe("choc");
    expect(parseQuery(next).text).toBe("choc");
    expect(filterTerms(parseQuery(next).filter)).toEqual([]);
  });

  it("walks time: through all four comparisons and back", () => {
    const first = cycleOnce("time:<30");
    const second = cycleOnce(first);
    const third = cycleOnce(second);
    const fourth = cycleOnce(third);
    expect([first, second, third, fourth]).toEqual([
      "time:<=30",
      "time:>30",
      "time:>=30",
      "time:<30",
    ]);
  });

  it("starts a bare duration from the operator it parses as", () => {
    // `time:30` *is* `<=`, so the next step is `>` — not `<`, which would
    // tighten a bound the user never typed.
    expect(cycleOnce("time:30")).toBe("time:>30");
  });

  it("swaps before: and after:, the only two operators a date has", () => {
    expect(cycleOnce("before:2026-01-01")).toBe("after:2026-01-01");
    expect(cycleOnce("after:2026-01-01")).toBe("before:2026-01-01");
  });

  it("never removes anything, so two cycles are the identity", () => {
    for (const raw of [
      "tag:dessert",
      "-tag:baked",
      'tag:"slow cooker"',
      "before:2026-01-01",
      "chocolate tag:dessert time:<30",
    ]) {
      const once = cycleTermAt(raw, filterTerms(parseQuery(raw).filter)[0]);
      const twice = cycleTermAt(once, filterTerms(parseQuery(once).filter)[0]);
      expect(twice).toBe(raw);
      expect(filterTerms(parseQuery(once).filter)).toHaveLength(
        filterTerms(parseQuery(raw).filter).length,
      );
    }
  });

  it("leaves the rest of the query alone", () => {
    const raw = "chocolate tag:dessert (tag:a OR tag:b) time:<30";
    const terms = filterTerms(parseQuery(raw).filter);
    expect(cycleTermAt(raw, terms[2])).toBe(
      "chocolate tag:dessert (tag:a OR -tag:b) time:<30",
    );
  });

  it("does nothing on a stale handle, like removal", () => {
    const stale = filterTerms(parseQuery("tag:a tag:b").filter)[1];
    expect(cycleTermAt("tag:a", stale)).toBe("tag:a");
  });
});

describe("appendFilterTerm — what a palette row inserts", () => {
  it("appends a whole term to an empty or a live query", () => {
    expect(appendFilterTerm("", "tag", "dessert")).toBe("tag:dessert");
    expect(appendFilterTerm("chocolate", "tag", "dessert")).toBe(
      "chocolate tag:dessert",
    );
    expect(appendFilterTerm("chocolate ", "tag", "dessert")).toBe(
      "chocolate tag:dessert",
    );
  });

  it("quotes an operand that would tokenize as several atoms", () => {
    const added = appendFilterTerm("", "tag", "slow cooker");
    expect(added).toBe('tag:"slow cooker"');
    expect(spanless(parseQuery(added).filter)).toEqual({
      type: "text",
      field: "tag",
      value: "slow cooker",
    });
  });

  it("appends a bare field without blanking the page", () => {
    // The row that offers a field rather than a term. 21a's judgement call (a)
    // is what makes it safe: the fragment is dropped, so the result set the user
    // is looking at is exactly the one they keep while they type the operand.
    expect(appendFilterTerm("chocolate", "tag")).toBe("chocolate tag:");
    expect(appendFilterTerm("", "time")).toBe("time:");
    const parsed = parseQuery("chocolate tag:");
    expect(parsed.text).toBe("chocolate");
    expect(parsed.filter).toBeUndefined();
    expect(parsed.hasAdvancedSyntax).toBe(false);
  });
});
