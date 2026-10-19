import { describe, expect, it, vi } from "vitest";
import type { MassagedRecipeEntry } from "../websites/recipe-website/common/controller/data/read";
import {
  BUILD_CHUNK,
  LEGACY_SEARCH_DATABASES,
  LEGACY_SEARCH_STORAGE_KEYS,
  buildSearchIndex,
  deleteLegacySearchIndex,
  searchRecipes,
  searchSlugs,
  yieldToMain,
} from "../websites/recipe-website/common/components/SearchForm/searchIndex";

/*
 * 42s: the free-text index is built in memory instead of persisted in
 * IndexedDB. These pin what it answers — the result set *and* its order —
 * so the switch is a transport change, not a ranking change.
 *
 * The corpus is the named recipes of the Playwright `search-corpus` fixture,
 * copied in the shape `/search/all` + `/search/ingredients` deliver them
 * (ingredient lines flattened to text). The order is the fixture's slug order,
 * which is the order the corpus document lists them in.
 */
const CORPUS: MassagedRecipeEntry[] = [
  {
    slug: "carrot-slaw",
    name: "Carrot Slaw",
    tags: ["salad", "quick"],
    description: "A bright raw salad dressed with rice vinegar and sesame.",
    ingredients: ["4 carrots", "1 tbsp grated ginger", "2 tbsp rice vinegar"],
  },
  {
    slug: "chocolate-truffle-cake",
    name: "Chocolate Truffle Cake",
    tags: ["dessert", "chocolate"],
    description:
      "A dense flourless chocolate cake with a molten center, best served slightly warm.",
    ingredients: ["200 g dark chocolate", "4 eggs", "1/2 cup butter"],
  },
  {
    slug: "creme-brulee",
    name: "Crème Brûlée",
    tags: ["dessert", "french"],
    description:
      "A classic French custard baked slow and low, finished under a blowtorch for a caramelized sugar crust.",
    ingredients: ["2 cups heavy cream", "1/2 cup sugar", "6 egg yolks"],
  },
  {
    slug: "ginger-cookies",
    name: "Ginger Cookies",
    tags: ["dessert", "baked"],
    description: "Chewy spiced cookies with crackled tops and a sugar crust.",
    ingredients: ["2 cups flour", "1 cup molasses", "1 tsp cinnamon"],
  },
  {
    slug: "sourdough-loaf",
    name: "Sourdough Loaf",
    tags: ["bread", "baked"],
    description:
      "A slow-fermented country loaf with a blistered crust and an open, custardy crumb.",
    ingredients: ["500 g bread flour", "1 cup starter", "10 g salt"],
  },
  {
    slug: "tomato-basil-soup",
    name: "Tomato Basil Soup",
    tags: ["soup"],
    description:
      "Slow-roasted tomatoes blended smooth with fresh basil and a splash of cream.",
    ingredients: ["6 ripe tomatoes", "1 bunch basil", "1 cup cream"],
  },
  {
    slug: "weeknight-skillet",
    name: "Weeknight Skillet",
    tags: ["quick"],
    description:
      "A brisk one-pan supper glazed with pomegranate molasses and finished with herbs.",
    ingredients: ["2 chicken thighs", "1 onion", "1 tbsp olive oil"],
  },
].map((recipe) => ({ date: 0, ...recipe }));

const bySlug = new Map(CORPUS.map((recipe) => [recipe.slug, recipe]));

describe("the in-memory search index (42s)", () => {
  it("answers the pinned queries with the pinned set, in the pinned order", async () => {
    const index = await buildSearchIndex(CORPUS);
    const pinned: Record<string, string[]> = {
      // Accent-folded name hit.
      creme: ["creme-brulee"],
      // Tag hits, corpus order within the field.
      dessert: ["chocolate-truffle-cake", "creme-brulee", "ginger-cookies"],
      // Ingredient-only: in no name, tag or description.
      yolks: ["creme-brulee"],
      // Name > tags > ingredients > description: Ginger Cookies has molasses
      // as an ingredient, the skillet only in its description.
      molasses: ["ginger-cookies", "weeknight-skillet"],
      // A name hit leads its ingredient hits; the slaw's grated ginger trails.
      ginger: ["ginger-cookies", "carrot-slaw"],
      // Description-only, every one — ranked within the field by where the
      // word falls (the loaf says "crust" earliest), not by corpus order.
      crust: ["sourdough-loaf", "creme-brulee", "ginger-cookies"],
      // Both in the ingredients field; the soup's description hit adds nothing.
      cream: ["creme-brulee", "tomato-basil-soup"],
      // `suggest`: one unmatched word must not zero the result set.
      "chocolate jujube": ["chocolate-truffle-cake"],
      // Forward tokenization: a prefix finds the word.
      choc: ["chocolate-truffle-cake"],
    };
    for (const [query, slugs] of Object.entries(pinned)) {
      expect(searchSlugs(index, query), query).toEqual(slugs);
    }
  });

  it("returns every match, not FlexSearch's default 100 per field", async () => {
    // 150 recipes that mention lime only in an ingredient line, and 150 more
    // that mention it only in their description: the 103-vs-108 discrepancy
    // was this cap, applied by the in-memory engine and overshot by the old
    // IndexedDB adapter.
    const many: MassagedRecipeEntry[] = [];
    for (let i = 0; i < 150; i++) {
      many.push({
        date: 0,
        slug: `drink-${i}`,
        name: `Drink ${i}`,
        ingredients: ["1 oz lime juice", "2 oz gin"],
      });
      many.push({
        date: 0,
        slug: `note-${i}`,
        name: `Note ${i}`,
        description: "Finish with a twist of lime.",
      });
    }
    const index = await buildSearchIndex(many);
    const lime = searchSlugs(index, "lime");
    expect(lime).toHaveLength(300);
    // Ingredient hits all rank above description hits.
    expect(lime.slice(0, 150).every((slug) => slug.startsWith("drink-"))).toBe(
      true,
    );
    expect(searchSlugs(index, "lime juice")).toHaveLength(300);
  });

  it("builds the same index in chunks, yielding between them", async () => {
    const many: MassagedRecipeEntry[] = Array.from(
      { length: BUILD_CHUNK * 2 + 5 },
      (_, i) => ({ date: 0, slug: `r-${i}`, name: `Recipe ${i} stew` }),
    );
    const yieldToMain = vi.fn(() => Promise.resolve());
    const chunked = await buildSearchIndex(many, yieldToMain);
    const whole = await buildSearchIndex(many);
    expect(yieldToMain).toHaveBeenCalledTimes(2);
    expect(chunked.size).toBe(many.length);
    expect(searchSlugs(chunked, "stew")).toEqual(searchSlugs(whole, "stew"));
    expect(searchSlugs(chunked, "stew")).toHaveLength(many.length);
  });

  it("yields with a real task break when no one passes a stub", async () => {
    await expect(yieldToMain()).resolves.toBeUndefined();
    const chunked = await buildSearchIndex(
      Array.from({ length: BUILD_CHUNK + 1 }, (_, i) => ({
        date: 0,
        slug: `r-${i}`,
        name: `Recipe ${i}`,
      })),
      yieldToMain,
    );
    expect(chunked.size).toBe(BUILD_CHUNK + 1);
  });

  it("resolves hits against the corpus it is handed, groups included", async () => {
    const index = await buildSearchIndex(CORPUS);
    const decorated = new Map(bySlug);
    decorated.set("creme-brulee", {
      ...bySlug.get("creme-brulee")!,
      groups: ["dinner-party", "Dinner party"],
    });
    expect(searchRecipes(index, "creme", decorated)[0].groups).toEqual([
      "dinner-party",
      "Dinner party",
    ]);
    // A slug the corpus no longer holds is dropped, not returned undefined.
    decorated.delete("creme-brulee");
    expect(searchRecipes(index, "creme", decorated)).toEqual([]);
  });

  it("answers nothing for blank text or an empty corpus", async () => {
    expect(searchSlugs(await buildSearchIndex(CORPUS), "   ")).toEqual([]);
    expect(searchSlugs(await buildSearchIndex([]), "creme")).toEqual([]);
  });
});

describe("deleteLegacySearchIndex", () => {
  function fakeStorage(entries: Record<string, string>) {
    const map = new Map(Object.entries(entries));
    return {
      getItem: (key: string) => map.get(key) ?? null,
      removeItem: (key: string) => void map.delete(key),
      keys: () => [...map.keys()],
    };
  }

  function fakeIdb(present: string[], withDatabases = true) {
    const deleted: string[] = [];
    const idb = {
      deleteDatabase: (name: string) => {
        deleted.push(name);
        return {} as IDBOpenDBRequest;
      },
      ...(withDatabases
        ? {
            databases: async () =>
              present.map((name) => ({ name, version: 1 })),
          }
        : {}),
    };
    return { idb: idb as unknown as IDBFactory, deleted };
  }

  it("deletes only the old databases that exist, and the old markers", async () => {
    const storage = fakeStorage({
      [LEGACY_SEARCH_STORAGE_KEYS[2]]: "spec:123",
      "search-recent": '["creme"]',
    });
    const { idb, deleted } = fakeIdb([
      LEGACY_SEARCH_DATABASES[2],
      "something-else",
    ]);
    const names = await deleteLegacySearchIndex(
      idb,
      storage as unknown as Storage,
    );
    expect(names).toEqual([LEGACY_SEARCH_DATABASES[2]]);
    expect(deleted).toEqual([LEGACY_SEARCH_DATABASES[2]]);
    // Recent searches are not the index's to clear.
    expect(storage.keys()).toEqual(["search-recent"]);
  });

  it("never touches IndexedDB in a fresh browser", async () => {
    const { idb, deleted } = fakeIdb([]);
    expect(
      await deleteLegacySearchIndex(idb, fakeStorage({}) as unknown as Storage),
    ).toEqual([]);
    expect(deleted).toEqual([]);
  });

  it("falls back to the markers where databases() is missing", async () => {
    const fresh = fakeIdb([], false);
    await deleteLegacySearchIndex(
      fresh.idb,
      fakeStorage({}) as unknown as Storage,
    );
    expect(fresh.deleted).toEqual([]);

    const built = fakeIdb([], false);
    await deleteLegacySearchIndex(
      built.idb,
      fakeStorage({
        [LEGACY_SEARCH_STORAGE_KEYS[0]]: "1",
      }) as unknown as Storage,
    );
    expect(built.deleted).toEqual([...LEGACY_SEARCH_DATABASES]);
  });

  it("swallows blocked storage", async () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    const broken = {
      databases: () => Promise.reject(new Error("blocked")),
    } as unknown as IDBFactory;
    await expect(deleteLegacySearchIndex(broken, throwing)).resolves.toEqual(
      [],
    );
  });
});
