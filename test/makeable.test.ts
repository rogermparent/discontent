import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "recipe-website-common/util/ingredientNames";
import {
  analyzeMakeable,
  parseInventoryItem,
  prepareCorpus,
  satisfies,
  suggestNames,
  type AliasIndex,
  type MakeRecipe,
} from "recipe-website-common/util/makeable";

/** Does `item` meet the one requirement `line` yields? */
function meets(item: string, line: string, aliases?: AliasIndex): boolean {
  const [requirement] = parseIngredientLine(line);
  return satisfies(parseInventoryItem(item), requirement, aliases);
}

describe("satisfies", () => {
  it("matches the generic against the specific, both ways", () => {
    expect(meets("vermouth", "1/2 oz extra dry vermouth")).toBe(true);
    expect(meets("London dry gin", "2 oz gin")).toBe(true);
    expect(meets("vodka", "2 oz vodka")).toBe(true);
    expect(meets("gin", "2 oz vodka")).toBe(false);
  });

  it("guards non-alcoholic both ways", () => {
    expect(meets("gin", "2 oz non-alcoholic gin (Big Spoon virGin)")).toBe(
      false,
    );
    expect(meets("non-alcoholic gin", "2 oz gin")).toBe(false);
    expect(meets("NA gin", "2 oz non-alcoholic gin")).toBe(true);
    expect(meets("zero-proof gin", "2 oz non-alcoholic gin")).toBe(true);
  });

  it("keeps compounds whole: beer is not ginger beer", () => {
    expect(meets("beer", "4 oz ginger beer")).toBe(false);
    expect(meets("ginger beer", "4 oz ginger beer")).toBe(true);
    expect(meets("cream", "1 cup sour cream")).toBe(false);
  });

  it("meets a derived form from the whole fruit or plant", () => {
    expect(meets("lime", "3/4 oz lime juice")).toBe(true);
    expect(meets("limes", "Squeeze of lime juice")).toBe(true);
    expect(meets("hibiscus", "2 oz hibiscus tea, cold-brewed")).toBe(true);
    expect(meets("orange", "A few orange slices")).toBe(true);
    expect(meets("garlic", "2 garlic cloves")).toBe(true);
  });

  it("does not treat bitters as a derived form", () => {
    expect(meets("orange", "1 dash orange bitters")).toBe(false);
    expect(meets("orange bitters", "1 dash orange bitters")).toBe(true);
  });

  it("never lets a lone vague word stand for a longer name", () => {
    expect(meets("syrup", "1/4 oz lavender syrup")).toBe(false);
    expect(meets("liqueur", "1/2 oz blood orange liqueur")).toBe(false);
    expect(meets("tea", "2 oz green tea")).toBe(false);
  });

  it("reads tonic and soda the same however they're written", () => {
    expect(meets("tonic", "Tonic water, to top")).toBe(true);
    expect(meets("club soda", "Soda water, to top")).toBe(true);
    expect(meets("seltzer", "Club soda, to top")).toBe(true);
    expect(meets("soda water", "Splash of soda")).toBe(true);
  });

  it("meets an infusion's flavour loosely", () => {
    const [, flavour] = parseIngredientLine("2 oz chamomile-infused vodka");
    expect(satisfies(parseInventoryItem("chamomile tea"), flavour)).toBe(true);
    expect(satisfies(parseInventoryItem("chamomile"), flavour)).toBe(true);
    expect(satisfies(parseInventoryItem("green tea"), flavour)).toBe(false);
  });

  describe("aliases", () => {
    const corpus: MakeRecipe[] = [
      {
        slug: "a",
        name: "A",
        ingredients: [
          "1 1/2 oz non-alcoholic aperitif (Gnista)",
          "1/2 oz elderflower syrup (Toschi)",
        ],
      },
      { slug: "b", name: "B", ingredients: ["1/2 oz cucumber syrup (Toschi)"] },
    ];
    const { aliases } = prepareCorpus(corpus);

    it("meets a line by its brand when the brand means one thing", () => {
      expect(
        meets("Gnista", "1 1/2 oz non-alcoholic aperitif (Gnista)", aliases),
      ).toBe(true);
      expect(
        meets(
          "aperitif (Gnista)",
          "1 1/2 oz non-alcoholic aperitif (Gnista)",
          aliases,
        ),
      ).toBe(true);
    });

    it("ignores an ambiguous brand", () => {
      expect(
        meets("Toschi", "1/2 oz elderflower syrup (Toschi)", aliases),
      ).toBe(false);
      expect(
        meets(
          "Toschi elderflower syrup",
          "1/2 oz elderflower syrup (Toschi)",
          aliases,
        ),
      ).toBe(true);
    });

    it("never meets a line by its brand on the generic name alone", () => {
      /* The no-alcohol guard still holds for a plain "aperitif". */
      expect(
        meets("aperitif", "1 1/2 oz non-alcoholic aperitif (Gnista)", aliases),
      ).toBe(false);
    });
  });
});

describe("analyzeMakeable", () => {
  const corpus: MakeRecipe[] = [
    {
      slug: "vodka-sour",
      name: "Vodka Sour",
      ingredients: ["2 oz vodka", "3/4 oz lime juice", "3/4 oz simple syrup"],
    },
    {
      slug: "gin-and-tonic",
      name: "Gin and Tonic",
      ingredients: [
        "2 oz gin",
        "Tonic water, to top",
        "Lime wedge, for garnish",
      ],
    },
    {
      slug: "zero-proof-gin-and-tonic",
      name: "Zero-Proof G&T",
      ingredients: ["2 oz non-alcoholic gin", "Tonic water, to top"],
    },
    {
      slug: "lavender-gnista-tonic",
      name: "Lavender Gnista Tonic",
      ingredients: [
        "1 1/2 oz non-alcoholic aperitif (Gnista)",
        "1/4 oz lavender syrup",
        "Tonic water, to top",
      ],
    },
    {
      slug: "lavender-syrup",
      name: "Lavender Syrup",
      ingredients: [
        "1 cup sugar",
        "1 cup water",
        "1 tbsp dried culinary lavender",
      ],
    },
    {
      slug: "chamomile-collins",
      name: "Chamomile Collins",
      ingredients: [
        "2 oz chamomile-infused vodka",
        "3/4 oz lemon juice",
        "1/2 oz simple syrup",
        "Club soda, to top",
      ],
    },
    {
      slug: "hand-pies",
      name: "Hand Pies",
      ingredients: ["Filling", "1 cup jam", "Dough", "2 cups flour"],
      ingredientHeadings: [0, 2],
    },
    { slug: "empty", name: "Empty" },
  ];
  const prepared = prepareCorpus(corpus);
  const slugs = (matches: { recipe: MakeRecipe }[]) =>
    matches.map((match) => match.recipe.slug);

  it("buckets by missing lines, ignoring optional ones and staples", () => {
    const result = analyzeMakeable(corpus, prepared, [
      "vodka",
      "lime",
      "simple syrup",
      "gin",
      "tonic",
    ]);
    expect(slugs(result.canMake)).toEqual(["gin-and-tonic", "vodka-sour"]);
    expect(slugs(result.oneAway)).toEqual(["zero-proof-gin-and-tonic"]);
    expect(result.oneAway[0].missing[0].text).toBe("2 oz non-alcoholic gin");
    expect(result.unjudged).toBe(1);
  });

  it("does not count a stored heading as missing", () => {
    const result = analyzeMakeable(
      corpus.filter((r) => r.slug === "hand-pies"),
      prepared,
      ["jam"],
    );
    expect(result.oneAway).toHaveLength(1);
    expect(result.oneAway[0].missing.map((r) => r.text)).toEqual([
      "2 cups flour",
    ]);
  });

  it("meets a line by making a named recipe first, one level deep", () => {
    const scoped = corpus.filter((r) => r.slug === "lavender-gnista-tonic");
    const without = analyzeMakeable(scoped, prepared, [
      "Gnista",
      "tonic water",
    ]);
    expect(slugs(without.oneAway)).toEqual(["lavender-gnista-tonic"]);

    const result = analyzeMakeable(scoped, prepared, [
      "Gnista",
      "tonic water",
      "sugar",
      "lavender",
    ]);
    expect(slugs(result.canMake)).toEqual(["lavender-gnista-tonic"]);
    expect(result.canMake[0].via).toMatchObject([
      { slug: "lavender-syrup", name: "Lavender Syrup" },
    ]);
  });

  it("follows a stored link as well as a name", () => {
    const linked: MakeRecipe[] = [
      {
        slug: "fancy",
        name: "Fancy",
        ingredients: ["1/4 oz house syrup"],
        ingredientRecipeLinks: [{ line: 0, slug: "lavender-syrup" }],
      },
      ...corpus,
    ];
    const result = analyzeMakeable(linked.slice(0, 1), linked, [
      "sugar",
      "lavender",
    ]);
    expect(result.canMake[0].via[0].slug).toBe("lavender-syrup");
  });

  it("goes only one level deep, and never to itself", () => {
    const chain: MakeRecipe[] = [
      { slug: "top", name: "Top", ingredients: ["1 oz middle syrup"] },
      {
        slug: "middle",
        name: "Middle Syrup",
        ingredients: ["1 oz bottom syrup"],
      },
      { slug: "bottom", name: "Bottom Syrup", ingredients: ["1 cup sugar"] },
      { slug: "self", name: "Self Syrup", ingredients: ["1 oz self syrup"] },
    ];
    const result = analyzeMakeable(chain, chain, ["sugar"]);
    expect(slugs(result.canMake)).toEqual(["bottom", "middle"]);
    expect(slugs(result.oneAway)).toEqual(["self", "top"]);
  });

  it("needs both the spirit and the infusion's flavour", () => {
    const scoped = corpus.filter((r) => r.slug === "chamomile-collins");
    const partial = analyzeMakeable(scoped, prepared, [
      "vodka",
      "lemon",
      "simple syrup",
      "club soda",
    ]);
    expect(partial.oneAway[0].missing[0].loose).toBe(true);
    const full = analyzeMakeable(scoped, prepared, [
      "vodka",
      "lemon",
      "simple syrup",
      "club soda",
      "chamomile tea",
    ]);
    expect(slugs(full.canMake)).toEqual(["chamomile-collins"]);
  });

  it("ranks what to buy next by what it unlocks, then what it helps", () => {
    const result = analyzeMakeable(corpus, prepared, ["vodka", "simple syrup"]);
    /*
     * One away: Vodka Sour (lime juice). Two away: Gin and Tonic (gin,
     * tonic) and the Zero-Proof G&T (non-alcoholic gin, tonic). Further:
     * Lavender Gnista Tonic and Chamomile Collins, three each.
     */
    expect(result.buyNext[0]).toMatchObject({
      item: "lime juice",
      unlocks: 1,
      recipes: ["vodka-sour"],
    });
    expect(result.buyNext[1]).toMatchObject({
      item: "tonic water",
      unlocks: 0,
      helps: 2,
    });
    expect(result.buyNext.length).toBeLessThanOrEqual(5);
  });

  it("treats water and ice as always on hand", () => {
    const result = analyzeMakeable(
      [
        {
          slug: "ice",
          name: "Ice Water",
          ingredients: ["1 cup ice", "1 cup water", "1 lemon slice"],
        },
      ],
      [],
      ["lemon"],
    );
    expect(result.canMake).toHaveLength(1);
  });
});

describe("suggestNames", () => {
  it("offers line names and unambiguous brands, most used first", () => {
    const names = suggestNames([
      {
        slug: "a",
        name: "A",
        ingredients: [
          "2 oz vodka",
          "1 oz aperitif (Gnista)",
          "1 oz elderflower syrup (Toschi)",
        ],
      },
      {
        slug: "b",
        name: "B",
        ingredients: [
          "2 oz vodka",
          "1 cup water",
          "1 oz cucumber syrup (Toschi)",
        ],
      },
    ]);
    expect(names[0]).toBe("vodka");
    expect(names).toContain("Gnista");
    expect(names).not.toContain("Toschi");
    expect(names).not.toContain("water");
  });
});
