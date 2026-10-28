// 46h (Roger's 43-Dm1–Dm4 and 43-Dn2 picks): the traditional-bean family
// as `ingredient:any-bean` and Make's `any bean`, and the deliberate "any
// form" match `ingredient:~X`. Plain `ingredient:` values keep their text
// meaning; the shopping list keeps canned and fresh apart.

import { describe, expect, it } from "vitest";
import {
  anyLineMatcher,
  matchesFilter,
  parseQuery,
  type FilterNode,
} from "recipe-website-common/components/SearchForm/queryLanguage";
import {
  ANY_BEAN_LABEL,
  ingredientOptions,
  offersAnyBean,
} from "recipe-website-common/components/SearchForm/QueryAutocomplete";
import { beanKindOf } from "recipe-website-common/util/beans";
import {
  formlessWords,
  ingredientMatchOf,
  lineMatchesIngredient,
} from "recipe-website-common/util/ingredientQuery";
import {
  parseIngredientLine,
  toName,
} from "recipe-website-common/util/ingredientNames";
import {
  parseInventoryItem,
  satisfies,
} from "recipe-website-common/util/makeable";
import { matcherOf, MATCHERS } from "recipe-website-common/util/matchers";
import { buildShoppingView } from "recipe-website-common/util/shoppingView";
import { DEFAULT_SHOPPING_SETTINGS } from "recipe-website-common/util/shoppingTypes";

const finds = (query: string, lines: string[]) =>
  matchesFilter({ name: "R", ingredients: lines }, parseQuery(query).filter);

describe("the traditional-bean family (46h, 43-Dm1–Dm4)", () => {
  const BEANS = [
    "1 can black beans",
    "1 (15 oz) can red kidney beans, drained",
    "1 cup dried pinto beans",
    "2 cups cooked navy beans",
    "1 can cannellini beans",
    "1 cup great northern beans",
    "1 can garbanzo beans",
    "1 can chickpeas",
    "1 cup frozen lima beans",
    "1 cup butter beans",
    "1 cup borlotti beans",
    "1 cup cranberry beans",
    "1/2 cup adzuki beans",
    "1 cup mung beans",
    "1 cup black-eyed peas",
    "1 cup lentils",
    "1 cup red lentils",
    "1 cup French green lentils",
    "1 cup split peas",
    "1 cup yellow split peas",
    "1 can mixed beans",
  ];
  const NOT_BEANS = [
    "1 lb green beans, trimmed",
    "1 cup string beans",
    "1 cup wax beans",
    "1 vanilla bean, split",
    "1 cup coffee beans",
    "1 cup jelly beans",
    "1 cup green peas",
    "1 cup edamame",
    "1 cup bean sprouts",
    "1 can refried beans",
    "1 tbsp black bean paste",
    "1 cup lentil pasta",
  ];

  it("names every traditional bean, lentils and split peas included", () => {
    for (const line of BEANS) {
      expect(lineMatchesIngredient(line, "bean", "any-bean"), line).toBe(true);
    }
    expect(beanKindOf("lentils")).toBe("lentil");
    expect(beanKindOf("split peas")).toBe("split pea");
  });

  it("never green, vanilla, coffee or jelly beans", () => {
    for (const line of NOT_BEANS) {
      expect(lineMatchesIngredient(line, "bean", "any-bean"), line).toBe(false);
    }
  });

  it("is ingredient:any-bean in search, in every spelling", () => {
    for (const query of [
      "ingredient:any-bean",
      "ingredient:Any-Beans",
      'ingredient:"any bean"',
    ]) {
      const leaf = parseQuery(query).filter as FilterNode & { match?: string };
      expect(leaf).toMatchObject({
        type: "text",
        field: "ingredient",
        value: "any-bean",
        match: "bean",
      });
      expect(finds(query, ["2 cups cooked chickpeas"]), query).toBe(true);
      expect(finds(query, ["1 lb green beans"]), query).toBe(false);
    }
    /* Negated, it keeps the recipes with no family bean. */
    expect(finds("-ingredient:any-bean", ["1 lb green beans"])).toBe(true);
    expect(finds("-ingredient:any-bean", ["1 cup lentils"])).toBe(false);
    /* `bean*`-style text still finds every "bean…" word, green beans too. */
    expect(finds("ingredient:bean", ["1 lb green beans"])).toBe(true);
  });

  it("is Make's `any bean`, which reads search's spelling too", () => {
    const anyBean = MATCHERS.find((matcher) => matcher.id === "bean")!;
    expect(anyBean.label).toBe("Any bean (black, kidney, chickpea…)");
    expect(matcherOf("any-bean")?.id).toBe("bean");
    const item = parseInventoryItem("any bean");
    const [lentils] = parseIngredientLine("1 cup brown lentils");
    const [green] = parseIngredientLine("1 lb green beans");
    expect(satisfies(item, lentils)).toBe(true);
    expect(satisfies(item, green)).toBe(false);
    /* `bean*` stays a plain word match: green beans yes, lentils no. */
    const prefix = parseInventoryItem("bean*");
    expect(satisfies(prefix, green)).toBe(true);
    expect(satisfies(prefix, lentils)).toBe(false);
  });

  it("is offered first after ingredient: for bea… or any…", () => {
    expect(offersAnyBean("bea")).toBe(true);
    expect(offersAnyBean("an")).toBe(true);
    expect(offersAnyBean("any-b")).toBe(true);
    expect(offersAnyBean("be")).toBe(false);
    expect(offersAnyBean("any-bean")).toBe(false);
    expect(offersAnyBean("black")).toBe(false);
    const lines = ["1 can black beans", "1 tbsp bean paste"];
    const [first, ...rest] = ingredientOptions("bea", {
      names: ["black bean", "bean paste"],
      matches: anyLineMatcher(lines),
    });
    expect(first).toMatchObject({
      label: ANY_BEAN_LABEL,
      replacement: "ingredient:any-bean",
    });
    expect(rest.map((option) => option.label)).toEqual(["bean paste"]);
  });
});

describe('the "any form" match, ingredient:~X (46h, 43-Dn2)', () => {
  const FORMS = [
    "1 (15 oz) can black beans, drained and rinsed",
    "1 cup dried black beans",
    "2 cups cooked black beans",
    "black beans",
    "1 can black beans (or pinto beans)",
  ];
  const OTHERS = [
    "1 cup black bean soup",
    "1 tbsp black bean paste",
    "1 can pinto beans",
    "1 cup black lentils",
  ];

  it('reads ingredient:~"black beans" as black beans in any form', () => {
    const leaf = parseQuery('ingredient:~"black beans"').filter;
    expect(leaf).toMatchObject({
      field: "ingredient",
      value: "black beans",
      match: "form",
    });
    for (const line of FORMS) {
      expect(finds('ingredient:~"black beans"', [line]), line).toBe(true);
    }
    for (const line of OTHERS) {
      expect(finds('ingredient:~"black beans"', [line]), line).toBe(false);
    }
  });

  it('keeps ingredient:"black beans" as the text match it was', () => {
    expect(parseQuery('ingredient:"black beans"').filter).not.toHaveProperty(
      "match",
    );
    /* The text match: a substring, soup and all. */
    expect(finds('ingredient:"black beans"', ["2 cups black beans soup"])).toBe(
      true,
    );
    expect(finds('ingredient:"black beans"', ["1 cup black bean"])).toBe(false);
  });

  it("reads synonyms and the form in what was typed", () => {
    expect(finds("ingredient:~garbanzos", ["1 can chickpeas"])).toBe(true);
    expect(finds('ingredient:~"canned tomatoes"', ["4 tomatoes, diced"])).toBe(
      true,
    );
    expect(finds("ingredient:~corn", ["1 cup frozen corn"])).toBe(true);
    expect(finds("ingredient:~corn", ["1 cup corn tortillas"])).toBe(false);
  });

  it("drops a lone ~ while it is typed, and keeps one word", () => {
    expect(parseQuery("ingredient:~").filter).toBeUndefined();
    expect(ingredientMatchOf("~")).toBeUndefined();
    expect(ingredientMatchOf("black beans")).toBeUndefined();
    expect(formlessWords(toName("canned cooked"))).toEqual(["cooked"]);
  });

  it("offers names after ~ with the tilde kept", () => {
    const lines = ["1 can black beans", "1 cup dried black beans"];
    const [option] = ingredientOptions("~bla", {
      names: ["black bean"],
      matches: anyLineMatcher(lines),
    });
    expect(option).toMatchObject({
      label: "black bean",
      replacement: 'ingredient:~"black bean"',
      hint: "in any form — canned, dried, cooked",
    });
    expect(finds(option.replacement, ["1 cup cooked black beans"])).toBe(true);
  });

  it("Make already meets every form either way round", () => {
    const meets = (item: string, line: string) =>
      satisfies(parseInventoryItem(item), parseIngredientLine(line)[0]);
    for (const line of FORMS) {
      expect(meets("black beans", line), line).toBe(true);
      expect(meets("canned black beans", line), line).toBe(true);
    }
    expect(meets("cooked black beans", "1 can black beans")).toBe(true);
    expect(meets("black beans", "1 tbsp black bean paste")).toBe(false);
  });

  it("leaves canned and fresh apart on the shopping list", () => {
    const view = buildShoppingView(
      [
        { id: "01a", text: "1 can black beans" },
        { id: "01b", text: "1 cup black beans" },
      ],
      DEFAULT_SHOPPING_SETTINGS,
    );
    const rows = view.stores.flatMap((list) =>
      list.sections.flatMap((section) => section.rows),
    );
    expect(rows.map((row) => row.nameKey).sort()).toEqual([
      "black bean",
      "canned black bean",
    ]);
  });
});
