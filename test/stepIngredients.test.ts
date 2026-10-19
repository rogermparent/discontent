import { describe, expect, it } from "vitest";
import type {
  Ingredient,
  InstructionEntry,
} from "recipe-website-common/controller/types";
import {
  matchStepIngredients,
  sectionKey,
  stepNumbers,
} from "recipe-website-common/util/stepIngredients";

/*
 * Real-shaped fixtures (42c1): the ingredient and step shapes of recipes in
 * the corpus, copied by hand — never read from the content repo.
 */

const m = (n: string) => `<Multiplyable baseNumber="${n}" />`;
const lines = (...texts: string[]): Ingredient[] =>
  texts.map((ingredient) =>
    ingredient.endsWith(":") || ingredient.startsWith("#")
      ? { ingredient: ingredient.replace(/^#/, ""), type: "heading" }
      : { ingredient },
  );
const steps = (...texts: string[]): InstructionEntry[] =>
  texts.map((text) => ({ text }));

/** The lines a single step uses, as their stored text. */
function uses(
  ingredients: Ingredient[],
  instructions: InstructionEntry[],
): string[][] {
  return matchStepIngredients(ingredients, instructions).flatMap((entry) =>
    entry.map((step) => step.map((index) => ingredients[index].ingredient)),
  );
}

/** Sally's cornbread stuffing: two groups, butter, egg and salt twice each. */
const STUFFING_INGREDIENTS = lines(
  `${m("1")} cup (${m("120")}g) cornmeal (fine or medium ground)`,
  `${m("1")} cup (${m("125")}g) all-purpose flour (spooned & leveled)`,
  `${m("1")} teaspoon baking powder`,
  `${m("1/2")} teaspoon baking soda`,
  `${m("1/8")} teaspoon salt`,
  `${m("1/2")} cup (8 Tbsp; ${m("113")}g) unsalted butter, melted and slightly cooled`,
  `${m("1/4")} cup (${m("85")}g/60ml) honey`,
  `${m("1")} large egg, at room temperature`,
  `${m("1")} cup (${m("240")}ml) buttermilk, at room temperature`,
  `${m("2 1/2")} cups (${m("600")}ml) reduced-sodium chicken broth`,
  `${m("2")} large eggs`,
  `${m("1/4")} cup (4 Tbsp; ${m("56")}g) unsalted butter`,
  `${m("1")} cup (${m("130")}g) diced onion`,
  `${m("1 1/4")} cups (${m("160")}g) sliced celery`,
  `${m("2")} teaspoons chopped fresh thyme leaves (or 1 teaspoon dried)`,
  `${m("1")} Tablespoon chopped fresh sage (or 1 teaspoon dried)`,
  `${m("1 1/2")} Tablespoons chopped fresh parsley (or 2 teaspoons dried)`,
  `${m("1/2")} teaspoon salt`,
  `${m("1/2")} teaspoon freshly ground black pepper`,
  `${m("1")} pound (${m("454")}g) uncooked mild Italian sausage`,
  `optional: ${m("1")} cup (${m("125")}g) pecan halves`,
);
const STUFFING_STEPS: InstructionEntry[] = [
  {
    name: "Cornbread",
    instructions: [
      {
        text: "(Prepare 1 day in advance!) Preheat oven to 375°F (191°C). Whisk all of the cornbread ingredients together in a large bowl. Pour into a greased 9-inch square baking pan. Bake for 22-24 minutes or until the top is lightly browned. Set aside to cool overnight. Do not cover.",
      },
      {
        text: "Preheat oven to 300°F (149°C). Cut the cornbread into 1-inch cubes. Spread onto a baking sheet lined with parchment paper and bake for 10 minutes, or until they're slightly crisp.",
      },
    ],
  },
  {
    name: "Stuffing",
    instructions: [
      {
        text: "In a very large bowl, whisk the broth and eggs together. Set aside.",
      },
      {
        text: "Heat butter in a large skillet over medium-high heat. Add the onion, celery, thyme, sage, parsley, salt, and pepper. Cook for 4 minutes until vegetables begin to soften. Squeeze the sausage meat out of the casings into the skillet. Break up with a spoon. Cook for about 4 minutes, until sausage meat is just about cooked through.",
      },
      {
        text: "Pour sausage mixture into the broth + egg, including any liquid from the skillet. Add the toasted cornbread cubes and pecans, if using. Very gently fold everything together.",
      },
      {
        text: "If baking the stuffing separately, spoon stuffing into a greased 9×13-inch baking pan. Bake for 40 minutes, or until lightly browned and crisp on top.",
      },
      { text: "Garnish with fresh herbs before serving, if desired." },
    ],
  },
];

describe("matchStepIngredients — cornbread stuffing", () => {
  const found = uses(STUFFING_INGREDIENTS, STUFFING_STEPS);
  const names = (step: string[]) =>
    step.map((line) =>
      line.replace(/<Multiplyable baseNumber="([^"]*)" \/>/g, "$1"),
    );

  it("step 1 names no line: 'the cornbread ingredients' is not a list", () => {
    expect(found[0]).toEqual([]);
  });

  it("step 3: broth, but not the eggs (two egg lines)", () => {
    expect(names(found[2])).toEqual([
      "2 1/2 cups (600ml) reduced-sodium chicken broth",
    ]);
  });

  it("step 4: the aromatics, the herbs, pepper and sausage — not the shared butter or salt", () => {
    expect(names(found[3])).toEqual([
      "1 cup (130g) diced onion",
      "1 1/4 cups (160g) sliced celery",
      "2 teaspoons chopped fresh thyme leaves (or 1 teaspoon dried)",
      "1 Tablespoon chopped fresh sage (or 1 teaspoon dried)",
      "1 1/2 Tablespoons chopped fresh parsley (or 2 teaspoons dried)",
      "1/2 teaspoon freshly ground black pepper",
      "1 pound (454g) uncooked mild Italian sausage",
    ]);
  });

  it("step 5: broth and sausage again, and the pecans by their own word", () => {
    /* "sausage mixture" re-mentions the sausage: a true match, if a late one. */
    expect(names(found[4])).toEqual([
      "2 1/2 cups (600ml) reduced-sodium chicken broth",
      "1 pound (454g) uncooked mild Italian sausage",
      "optional: 1 cup (125g) pecan halves",
    ]);
  });

  it("steps 6 and 7 name nothing", () => {
    expect(found[5]).toEqual([]);
    expect(found[6]).toEqual([]);
  });

  it("numbers the steps straight through the groups", () => {
    expect(stepNumbers(STUFFING_STEPS)).toEqual([
      [1, 2],
      [3, 4, 5, 6, 7],
    ]);
  });
});

describe("matchStepIngredients — sections disambiguate", () => {
  /* A pie with a crust and a filling, each with its own butter and salt. */
  const ingredients = lines(
    "For the crust:",
    `${m("1 1/4")} cups all-purpose flour`,
    `${m("1/2")} teaspoon salt`,
    `${m("1/2")} cup cold unsalted butter, cubed`,
    `${m("4")} tablespoons ice water`,
    "For the filling:",
    `${m("3")} large eggs`,
    `${m("1")} cup packed brown sugar`,
    `${m("1/4")} teaspoon salt`,
    `${m("2")} tablespoons unsalted butter, melted`,
  );
  const instructions: InstructionEntry[] = [
    {
      name: "Make the crust",
      instructions: [
        { text: "Whisk the flour and salt. Cut in the butter." },
        { text: "Drizzle in the ice water and stir until it comes together." },
      ],
    },
    {
      name: "Filling",
      instructions: [
        {
          text: "Whisk the eggs, brown sugar, salt and melted butter together.",
        },
      ],
    },
    { text: "Season with salt." },
  ];
  const found = uses(ingredients, instructions);

  it("a crust step takes the crust's salt and butter", () => {
    expect(found[0]).toEqual([
      ingredients[1].ingredient,
      ingredients[2].ingredient,
      ingredients[3].ingredient,
    ]);
  });

  it("ice water is one compound-free name, met as written", () => {
    expect(found[1]).toEqual([ingredients[4].ingredient]);
  });

  it("a filling step takes the filling's", () => {
    expect(found[2]).toEqual([
      ingredients[6].ingredient,
      ingredients[7].ingredient,
      ingredients[8].ingredient,
      ingredients[9].ingredient,
    ]);
  });

  it("a step outside both sections names neither salt", () => {
    expect(found[3]).toEqual([]);
  });

  it("reads section names the same both ways", () => {
    expect(sectionKey("For the crust:")).toBe("crust");
    expect(sectionKey("Make the crust")).toBe("crust");
    expect(sectionKey("Crust")).toBe("crust");
    expect(sectionKey("Filling")).toBe("filling");
  });
});

describe("matchStepIngredients — sub-recipes", () => {
  it("a linked dough line matches by the linked recipe's name", () => {
    const ingredients = lines(
      `${m("1")} [Pie Crust](/recipe/pie-crust), chilled`,
      `${m("15")} ounces pumpkin puree`,
      `${m("1")} cup heavy cream`,
    );
    const instructions = steps(
      "Roll out the chilled pie crust and fit it into a 9-inch pie dish.",
      "Whisk the pumpkin puree and the cream together.",
    );
    expect(uses(ingredients, instructions)).toEqual([
      [ingredients[0].ingredient],
      /* "cream" alone is not `heavy cream`, and `cream` is no usable head
       * past `heavy cream`, which is one word. */
      [ingredients[1].ingredient],
    ]);
  });

  it("a leftover from another recipe goes by that recipe's name too", () => {
    const ingredients = lines(
      `${m("1")} cup (${m("227")}g) [Kefir](/recipe/kefir)`,
      `heaping ${m("1/2")} cup prepared mashed potatoes, leftover from [Baked Potatoes](/recipe/baked-potatoes)`,
    );
    const instructions = steps(
      "Mix the kefir with the baked potatoes until smooth.",
    );
    expect(uses(ingredients, instructions)).toEqual([
      [ingredients[0].ingredient, ingredients[1].ingredient],
    ]);
  });
});

describe("matchStepIngredients — a cocktail", () => {
  const ingredients = lines(
    `${m("2")} oz vodka`,
    `${m("2")} oz cranberry juice cocktail`,
    `${m("1/2")} oz fresh lime juice`,
    `${m("3")} oz ginger beer`,
  );
  it("names each bottle; 'juice' alone and 'beer' alone are not names", () => {
    expect(
      uses(
        ingredients,
        steps(
          "Fill a copper mug with ice.",
          "Add the vodka, cranberry juice cocktail and lime juice, top with ginger beer and stir.",
          "Garnish with a lime wedge.",
        ),
      ),
    ).toEqual([
      [],
      ingredients.map(({ ingredient }) => ingredient),
      /* `lime wedge` is not `lime juice`; the head `juice` is generic. */
      [],
    ]);
  });

  it("'top with beer' is not the ginger beer", () => {
    expect(uses(ingredients, steps("Top with beer."))).toEqual([[]]);
  });
});

describe("matchStepIngredients — shared and partial names", () => {
  it("salt in three lines: a step that says salt lists none of them", () => {
    const ingredients = lines(
      `${m("1")} teaspoon salt`,
      `${m("1/2")} teaspoon salt`,
      "Salt, to taste",
      `${m("1")} lb potatoes`,
    );
    expect(
      uses(ingredients, steps("Boil the potatoes in salted water with salt.")),
    ).toEqual([[ingredients[3].ingredient]]);
  });

  it("'butter, divided' is one line, listed by every step that uses it", () => {
    const ingredients = lines(
      `${m("4")} tablespoons butter, divided`,
      `${m("1")} onion, diced`,
    );
    expect(
      uses(
        ingredients,
        steps(
          "Melt 2 tablespoons of the butter and cook the onion.",
          "Stir in the remaining butter.",
        ),
      ),
    ).toEqual([
      [ingredients[0].ingredient, ingredients[1].ingredient],
      [ingredients[0].ingredient],
    ]);
  });

  it("'1 egg + 1 egg yolk': the yolk by its compound, never 'egg' inside it", () => {
    const ingredients = lines(
      `${m("1")} egg + ${m("1")} egg yolk`,
      `${m("1")} egg, beaten, for the egg wash`,
    );
    expect(
      uses(
        ingredients,
        steps("Beat in the egg yolk.", "Brush the dough with the beaten egg."),
      ),
    ).toEqual([
      /* `egg yolk` is the first line's head, and no other line ends in it. */
      [ingredients[0].ingredient],
      /* `egg` is the second line's whole name and the first line has no
       * line named just `egg`, so it is the second line's. */
      [ingredients[1].ingredient],
    ]);
  });

  it("a longer name claims its words: brown sugar is not also plain sugar", () => {
    const ingredients = lines(
      `${m("1")} cup brown sugar`,
      `${m("1/2")} cup sugar`,
    );
    expect(
      uses(
        ingredients,
        steps("Cream the butter and brown sugar.", "Sprinkle with sugar."),
      ),
    ).toEqual([[ingredients[0].ingredient], [ingredients[1].ingredient]]);
  });

  it("two lines ending in one head: the head alone names neither", () => {
    const ingredients = lines(
      `${m("1")} cup granulated sugar`,
      `${m("1/2")} cup light brown sugar`,
    );
    expect(uses(ingredients, steps("Add the sugar."))).toEqual([[]]);
  });

  it("a unique head is enough: 'the sausage' is the mild Italian sausage", () => {
    const ingredients = lines(`${m("1")} lb mild Italian sausage`);
    expect(uses(ingredients, steps("Brown the sausage."))).toEqual([
      [ingredients[0].ingredient],
    ]);
  });

  it("whole words only: 'pepper' is not in 'peppery', 'oil' not in 'boil'", () => {
    const ingredients = lines(
      `${m("1")} tsp black pepper`,
      `${m("2")} tbsp olive oil`,
    );
    expect(
      uses(ingredients, steps("Bring to a boil; the broth turns peppery.")),
    ).toEqual([[]]);
  });

  it("no ingredients, no instructions, headings only", () => {
    expect(matchStepIngredients([], [])).toEqual([]);
    expect(matchStepIngredients(undefined, steps("Mix."))).toEqual([[[]]]);
    expect(
      matchStepIngredients(lines("For the sauce:"), steps("Make the sauce.")),
    ).toEqual([[[]]]);
  });
});
