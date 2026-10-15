import { describe, expect, it } from "vitest";
import {
  parseIngredientLine,
  requirementLabel,
} from "recipe-website-common/util/ingredientNames";
import {
  analyzeMakeable,
  assumedStaples,
  closeTo,
  DEFAULT_STAPLES,
  PANTRY_STAPLES,
  type MakeableOptions,
  parseInventoryItem,
  prepareCorpus,
  satisfies,
  suggestNames,
  type AliasIndex,
  type MakeRecipe,
} from "recipe-website-common/util/makeable";

/**
 * The judge with pantry staples off (U5) — the rules these cases were
 * written against: each pins one matching rule, and flour, sugar or butter
 * assumed on hand would answer for the list.
 */
function strictJudge(
  scoped: Parameters<typeof analyzeMakeable>[0],
  corpus: Parameters<typeof analyzeMakeable>[1],
  inventory: string[],
  options: MakeableOptions = {},
) {
  return analyzeMakeable(scoped, corpus, inventory, {
    pantryStaples: false,
    ...options,
  });
}

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
    const result = strictJudge(corpus, prepared, [
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
    const result = strictJudge(
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
    const result = strictJudge(corpus, prepared, ["vodka", "simple syrup"]);
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

  it("keeps staples only when asked (search's ingredient: completion, 32f)", () => {
    const corpus = [
      {
        slug: "a",
        name: "A",
        ingredients: ["2 cups water", "1 cup ice", "1 onion"],
      },
      { slug: "b", name: "B", ingredients: ["4 cups water", "2 onions"] },
    ];
    expect(suggestNames(corpus)).toEqual(["onion"]);
    expect(suggestNames(corpus, { includeStaples: true })).toEqual([
      "onion",
      "water",
      "ice",
    ]);
  });
});

/*
 * 32j: dinner as well as drinks. Loose line reading, food synonyms, salt and
 * pepper as staples, and the close tier, which is reported separately and
 * never changes what the strict rules say.
 */
describe("food (32j)", () => {
  const close = (item: string, line: string, corpus?: MakeRecipe[]) => {
    const [requirement] = parseIngredientLine(line);
    return closeTo(
      parseInventoryItem(item),
      requirement,
      corpus ? prepareCorpus(corpus).words : undefined,
    );
  };

  it("reads a food line however it trails off", () => {
    expect(meets("onion", "1 large onion cut into wedges")).toBe(true);
    expect(meets("butter", "8 tbsp unsalted butter at room temperature")).toBe(
      true,
    );
    expect(meets("flour", "3 cups flour plus more for kneading")).toBe(true);
    expect(meets("chicken thighs", "2 boneless, skinless chicken thighs")).toBe(
      true,
    );
    expect(meets("chicken thigh", "8 bone-in, skin-on chicken thighs")).toBe(
      true,
    );
    expect(meets("milk", "1/2 cup milk (or more as needed)")).toBe(true);
    expect(meets("lemon", "1 tbsp. (or more) fresh lemon juice")).toBe(true);
    expect(
      meets("butter", "2-3 Tbsp ghee (or margarine, or more butter)"),
    ).toBe(true);
    expect(meets("olive oil", "4 Tbsp olive oil, divided")).toBe(true);
  });

  it("gives an A-or-B line both as alternatives", () => {
    expect(meets("margarine", "2 tbsp butter or margarine")).toBe(true);
    expect(meets("butter", "2 tbsp butter or margarine")).toBe(true);
  });

  it("folds food synonyms on both sides", () => {
    expect(meets("scallions", "2 green onions, sliced")).toBe(true);
    expect(meets("spring onion", "1 scallion")).toBe(true);
    expect(meets("fresh coriander", "1/4 cup cilantro leaves")).toBe(true);
    expect(meets("garbanzo beans", "1 can chickpeas, drained")).toBe(true);
    expect(meets("icing sugar", "1 cup confectioners' sugar")).toBe(true);
    expect(meets("courgette", "1 zucchini, sliced")).toBe(true);
    expect(meets("aubergine", "1 eggplant")).toBe(true);
    expect(meets("double cream", "1 cup heavy whipping cream")).toBe(true);
    expect(meets("hamburger", "1 lb ground beef")).toBe(true);
    expect(meets("hamburger buns", "1 lb ground beef")).toBe(false);
    expect(meets("bicarbonate of soda", "1 tsp baking soda")).toBe(true);
    expect(meets("bicarbonate of soda", "Club soda, to top")).toBe(false);
  });

  it("keeps a flavoured salt its own jar", () => {
    expect(meets("salt", "1/2 tsp celery salt")).toBe(false);
    expect(meets("salt", "1 tsp kosher salt")).toBe(true);
  });

  it("finds a close match by substitute, head, kind or typo", () => {
    expect(close("onion", "1 shallot, minced")).toBe(true);
    expect(close("olive oil", "2 tbsp vegetable oil")).toBe(true);
    expect(close("extra virgin olive oil", "1 cup neutral oil")).toBe(true);
    expect(close("chicken stock", "2 cups chicken broth")).toBe(true);
    expect(close("eggs", "2 egg yolks")).toBe(true);
    expect(close("brown rice", "1 cup white rice")).toBe(true);
    expect(close("cheddar cheese", "1 cup parmesan cheese")).toBe(true);
    expect(close("parmesan", "1/2 cup grated parmesan cheese")).toBe(true);
    expect(close("garlic", "1 tsp garlic powder")).toBe(true);
    expect(close("mozarella", "1 cup shredded mozzarella")).toBe(true);
    expect(close("parmesean", "1/2 cup parmesan")).toBe(true);
    expect(close("tomatoe", "2 tomatoes, diced")).toBe(true);
    expect(close("chesse", "1 cup grated cheese")).toBe(true);
    /* Cheese alone goes both ways. */
    expect(close("parmesan cheese", "1/2 cup grated parmesan")).toBe(true);
  });

  it("lets only the shorter name stand in for a line with a kind (32j review)", () => {
    /* The real corpus's false "had"s, each the wrong way round. */
    expect(close("garlic powder", "3 cloves garlic, minced")).toBe(false);
    expect(close("almond extract", "1/2 cup sliced almonds")).toBe(false);
    expect(close("lemon extract", "1 lemon, quartered")).toBe(false);
    expect(close("lemon pepper", "1/2 lemon")).toBe(false);
    expect(close("lemon", "1 tsp lemon pepper")).toBe(false);
    expect(close("butter", "1 head butter lettuce")).toBe(false);
    expect(close("vanilla", "1 tsp vanilla extract")).toBe(false);
    expect(close("jalapeno", "1 jalapeno pepper")).toBe(false);
  });

  it("is never close on a vague or ambiguous word, or the wrong way round", () => {
    expect(close("juice", "1 oz lime juice")).toBe(false);
    expect(close("lemon juice", "1 oz lime juice")).toBe(false);
    expect(close("oil", "2 tbsp olive oil")).toBe(false);
    expect(close("black pepper", "1 red bell pepper")).toBe(false);
    expect(close("black beans", "1 cup green beans")).toBe(false);
    expect(close("egg white", "2 eggs")).toBe(false);
    expect(close("rice", "1 tbsp rice vinegar")).toBe(false);
    expect(close("spaghetti", "1 spaghetti squash")).toBe(false);
    expect(close("non-alcoholic gin", "2 oz old tom gin")).toBe(false);
  });

  it("allows a typo only when one side is unusual", () => {
    const corpus: MakeRecipe[] = [
      { slug: "a", name: "A", ingredients: ["2 tomatoes", "1 cup yogurt"] },
      { slug: "b", name: "B", ingredients: ["3 potatoes", "1 cup yogurt"] },
      { slug: "c", name: "C", ingredients: ["1 tomato", "1 potato"] },
    ];
    /* Both words used freely: two vegetables, not a typo. */
    expect(close("potatos", "2 tomatoes", corpus)).toBe(false);
    /* A spelling the corpus never uses. */
    expect(close("yoghurtt", "1 cup yogurt", corpus)).toBe(false);
    expect(close("yogurtt", "1 cup yogurt", corpus)).toBe(true);
    /* Known pairs never, whatever the counts. */
    expect(close("cherries", "1 oz sherry")).toBe(false);
    expect(close("custard", "1 tbsp mustard")).toBe(false);
  });

  it("never takes a different first letter or a short word for a typo (32j review)", () => {
    /* The real corpus's false matches, and the short pairs. */
    expect(close("capers", "Parchment paper")).toBe(false);
    expect(close("Lillet", "6 chicken thigh fillets")).toBe(false);
    expect(close("Lillet", "4 anchovy fillets")).toBe(false);
    expect(close("basil", "1 tsp basic seasoning")).toBe(false);
    expect(close("sheet", "1 lb sheep cheese")).toBe(false);
    expect(close("grape", "1 cup grade A maple syrup")).toBe(false);
    expect(close("queso fresco", "1 fresno chile")).toBe(false);
    expect(close("fresco", "1 fresno")).toBe(false);
  });

  const dinner: MakeRecipe[] = [
    {
      slug: "shallot-rice-pilaf",
      name: "Shallot Rice Pilaf",
      ingredients: [
        "1 shallot, minced",
        "1 cup long-grain white rice",
        "2 cups vegetable broth",
        "2 tablespoons butter",
        "1 teaspoon kosher salt",
        "1/4 teaspoon freshly ground black pepper",
      ],
    },
    {
      slug: "simple-omelette",
      name: "Simple Omelette",
      ingredients: ["3 large eggs", "1 tablespoon butter", "Salt and pepper"],
    },
    {
      slug: "roasted-vegetables",
      name: "Roasted Vegetables",
      ingredients: [
        "1 zucchini cut into half-moons",
        "1 red onion cut into wedges",
        "2 tablespoons olive oil",
        "1 teaspoon salt",
      ],
    },
  ];
  const slugs = (matches: { recipe: MakeRecipe }[]) =>
    matches.map((match) => match.recipe.slug);

  it("assumes salt, black pepper, water and ice unless told otherwise", () => {
    expect(DEFAULT_STAPLES).toEqual(["salt", "black pepper", "water", "ice"]);
    const result = analyzeMakeable(dinner, dinner, ["eggs", "butter"]);
    expect(slugs(result.canMake)).toEqual(["simple-omelette"]);

    const without = analyzeMakeable(dinner, dinner, ["eggs", "butter"], {
      staples: ["black pepper"],
    });
    expect(slugs(without.oneAway)).toEqual(["simple-omelette"]);
    expect(without.oneAway[0].missing.map(requirementLabel)).toEqual(["salt"]);
  });

  it("counts a close line as had by default, and reports it", () => {
    const result = analyzeMakeable(dinner, dinner, [
      "onion",
      "rice",
      "vegetable stock",
      "butter",
    ]);
    const pilaf = result.canMake.find(
      (match) => match.recipe.slug === "shallot-rice-pilaf",
    );
    expect(pilaf?.missing).toEqual([]);
    expect(
      pilaf?.close.map(({ requirement, item }) => [requirement.text, item]),
    ).toEqual([
      ["1 shallot, minced", "onion"],
      ["2 cups vegetable broth", "vegetable stock"],
    ]);
  });

  it("with close matches off, a close line is missing and still reported", () => {
    const result = strictJudge(
      dinner,
      dinner,
      ["onion", "rice", "vegetable broth", "butter"],
      { countClose: false },
    );
    expect(slugs(result.canMake)).toEqual([]);
    const pilaf = result.oneAway.find(
      (match) => match.recipe.slug === "shallot-rice-pilaf",
    );
    expect(pilaf?.missing.map((r) => r.text)).toEqual(["1 shallot, minced"]);
    expect(pilaf?.close.map(({ item }) => item)).toEqual(["onion"]);
    expect(result.buyNext).toContainEqual(
      expect.objectContaining({ item: "shallot", unlocks: 1 }),
    );
  });

  it("reads a prep phrase and a British name in the same recipe", () => {
    const result = strictJudge(dinner, dinner, [
      "courgette",
      "red onion",
      "olive oil",
    ]);
    expect(slugs(result.canMake)).toEqual(["roasted-vegetables"]);
    expect(result.canMake[0].close).toEqual([]);
  });

  it("answers the same from its cache, and forgets it when the list changes", () => {
    const preparedDinner = prepareCorpus(dinner);
    const view = (result: ReturnType<typeof analyzeMakeable>) =>
      [result.canMake, result.oneAway, result.twoAway].map((bucket) =>
        bucket.map((match) => [
          match.recipe.slug,
          match.missing.map(requirementLabel),
          match.close.map(({ item }) => item),
        ]),
      );
    const items = ["onion", "rice", "vegetable stock", "butter"];
    const first = strictJudge(dinner, preparedDinner, items);
    expect(view(strictJudge(dinner, preparedDinner, items))).toEqual(
      view(first),
    );
    /* The toggle reuses the answers, but buckets them its own way. */
    const strict = strictJudge(dinner, preparedDinner, items, {
      countClose: false,
    });
    expect(strict.canMake).toEqual([]);
    /* A changed list or staples is judged afresh. */
    const fewer = strictJudge(dinner, preparedDinner, ["onion"]);
    expect(fewer.canMake).toEqual([]);
    const noSalt = strictJudge(dinner, preparedDinner, items, {
      staples: [],
    });
    expect(noSalt.canMake).toEqual([]);
    expect(view(strictJudge(dinner, preparedDinner, items))).toEqual(
      view(first),
    );
  });

  it("leaves the strict drink buckets alone", () => {
    const drinks: MakeRecipe[] = [
      {
        slug: "vodka-sour",
        name: "Vodka Sour",
        ingredients: ["2 oz vodka", "3/4 oz lime juice", "3/4 oz simple syrup"],
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
    ];
    const inventory = ["vodka", "lemon juice", "gin", "tonic", "syrup"];
    const strict = analyzeMakeable(drinks, drinks, inventory, {
      countClose: false,
    });
    const loose = analyzeMakeable(drinks, drinks, inventory);
    for (const bucket of ["canMake", "oneAway", "twoAway"] as const) {
      expect(slugs(loose[bucket])).toEqual(slugs(strict[bucket]));
    }
    expect(loose.oneAway.flatMap((match) => match.close)).toEqual([]);
  });
});

/*
 * Usability pass, U5: pantry staples, on by default — in the judge, so the
 * page, `inventory_makeable` and `recipes inventory make` agree.
 */
describe("pantry staples (U5)", () => {
  const baking: MakeRecipe[] = [
    {
      slug: "jam-bars",
      name: "Jam Bars",
      ingredients: [
        "2 cups all-purpose flour",
        "1/2 cup granulated sugar",
        "1 cup jam",
      ],
    },
    {
      slug: "macarons",
      name: "Macarons",
      ingredients: ["1 cup almond flour", "1 cup powdered sugar", "1 cup jam"],
    },
    {
      slug: "custard",
      name: "Custard",
      ingredients: ["3 egg yolks", "1 cup whole milk", "1/4 cup sugar"],
    },
    {
      slug: "fried-rice",
      name: "Fried Rice",
      ingredients: ["2 cups cooked rice", "2 tbsp canola oil"],
    },
  ];
  const slugs = (matches: { recipe: MakeRecipe }[]) =>
    matches.map((match) => match.recipe.slug);
  const find = (result: ReturnType<typeof analyzeMakeable>, slug: string) =>
    [
      ...result.canMake,
      ...result.oneAway,
      ...result.twoAway,
      ...result.further,
    ].find((match) => match.recipe.slug === slug);

  it("flour + sugar + jam: ready with staples on, two away with them off", () => {
    const scoped = baking.filter((recipe) => recipe.slug === "jam-bars");
    const on = analyzeMakeable(scoped, baking, ["jam"]);
    expect(slugs(on.canMake)).toEqual(["jam-bars"]);
    const off = analyzeMakeable(scoped, baking, ["jam"], {
      pantryStaples: false,
    });
    expect(slugs(off.twoAway)).toEqual(["jam-bars"]);
    expect(off.twoAway[0].missing.map(requirementLabel)).toEqual([
      "all purpose flour",
      "granulated sugar",
    ]);
  });

  it("never stands a staple in for a different ingredient", () => {
    const result = analyzeMakeable(baking, baking, ["jam"]);
    expect(find(result, "macarons")?.missing.map(requirementLabel)).toEqual([
      "almond flour",
      "powdered sugar",
    ]);
  });

  it("stands in through the close tier, and says so", () => {
    const result = analyzeMakeable(baking, baking, ["rice"]);
    const rice = find(result, "fried-rice");
    expect(rice?.missing).toEqual([]);
    expect(rice?.close.map(({ item }) => item)).toEqual(["vegetable oil"]);
    const custard = find(result, "custard");
    expect(custard?.missing).toEqual([]);
    expect(custard?.close.map(({ item }) => item)).toEqual(["eggs"]);

    /* Close matches off: a staple's close line is missing, as an item's is. */
    const strict = analyzeMakeable(baking, baking, ["rice"], {
      countClose: false,
    });
    expect(find(strict, "fried-rice")?.missing.map(requirementLabel)).toEqual([
      "canola oil",
    ]);
  });

  it("prefers the list's own close item to a staple", () => {
    const result = analyzeMakeable(baking, baking, ["rice", "peanut oil"]);
    expect(find(result, "fried-rice")?.close.map(({ item }) => item)).toEqual([
      "peanut oil",
    ]);
  });

  it("builds the assumed list: base, plus the pantry while it is on", () => {
    expect(assumedStaples()).toEqual([...DEFAULT_STAPLES, ...PANTRY_STAPLES]);
    expect(assumedStaples(["salt"], false)).toEqual(["salt"]);
    /* No repeats when the base already has one. */
    expect(
      assumedStaples(["Flour", "salt"]).filter((s) => /flour/i.test(s)),
    ).toHaveLength(1);
  });

  it("treats a given staples list as whole unless asked for the pantry too", () => {
    const scoped = baking.filter((recipe) => recipe.slug === "jam-bars");
    const given = analyzeMakeable(scoped, baking, ["jam"], {
      staples: ["salt"],
    });
    expect(slugs(given.twoAway)).toEqual(["jam-bars"]);
    const both = analyzeMakeable(scoped, baking, ["jam"], {
      staples: ["salt"],
      pantryStaples: true,
    });
    expect(slugs(both.canMake)).toEqual(["jam-bars"]);
  });
});
