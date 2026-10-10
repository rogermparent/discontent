// @vitest-environment node
//
// The repo default is jsdom; this suite only needs `fetch` and a JSON parser,
// and node is the environment the importer actually runs in (a server action).
//
// What is pinned here is the provenance half of 22a: an import now returns a
// `source` citation (D6) *instead of* the `*Imported from [url](url)*` line it
// used to paste onto the front of the description (D7). The three schema.org
// `author` shapes each get a case because all three occur in the wild, and the
// publisher/hostname fallback decides what the citation link is labelled.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_403_DELAY_MS,
  extractAuthorName,
  forbiddenRetryFromEnv,
  importRecipeData,
  RECIPE_FETCH_HEADERS,
  suggestTags,
  SUGGESTED_TAGS_LIMIT,
} from "recipe-website-common/util/importRecipeData";
import { siteLabel } from "recipe-website-common/util/siteNames";

const PAGE_URL = "https://www.example.com/recipes/naan";

function recipeHtml(extra: Record<string, unknown> = {}): string {
  const recipe = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: "Naan",
    description: "South Asia&#39;s classic yeasted flatbread.",
    recipeIngredient: ["1 1/2 cups flour"],
    recipeInstructions: [{ text: "Mix, rest, griddle." }],
    ...extra,
  };
  return [
    "<html><head>",
    `<script type="application/ld+json">${JSON.stringify(recipe)}</script>`,
    "</head><body></body></html>",
  ].join("");
}

function stubFetch(html: string) {
  const fetchStub = vi.fn(async () => ({ text: async () => html }));
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

describe("extractAuthorName", () => {
  it("reads a bare string", () => {
    expect(extractAuthorName("Pooja Makhijani")).toBe("Pooja Makhijani");
  });

  it("reads a Person object", () => {
    expect(extractAuthorName({ name: "Pooja Makhijani" })).toBe(
      "Pooja Makhijani",
    );
  });

  it("reads the first usable entry of an array", () => {
    expect(extractAuthorName([{ name: "" }, { name: "Pooja Makhijani" }])).toBe(
      "Pooja Makhijani",
    );
  });

  it("decodes HTML entities without escaping markdown", () => {
    expect(extractAuthorName("Molly O&#39;Neill")).toBe("Molly O'Neill");
  });

  it("is undefined for an absent or empty author", () => {
    expect(extractAuthorName(undefined)).toBeUndefined();
    expect(extractAuthorName("   ")).toBeUndefined();
    expect(extractAuthorName({})).toBeUndefined();
    expect(extractAuthorName([])).toBeUndefined();
  });
});

describe("importRecipeData source", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for the page plainly first", async () => {
    /* Cloudflare challenges a Chrome UA from Node (A Couple Cooks, 25e). */
    const fetchStub = stubFetch(recipeHtml({ author: "Pooja Makhijani" }));
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.name).toBe("Naan");
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, init] = fetchStub.mock.calls[0] as unknown as [
      string,
      { headers?: Record<string, string> },
    ];
    expect(url).toBe(PAGE_URL);
    expect(init.headers).toBeUndefined();
  });

  function forbiddenThenOk() {
    return vi
      .fn()
      .mockResolvedValueOnce({
        status: 403,
        text: async () => "<html>Forbidden</html>",
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => recipeHtml(),
      });
  }

  it("asks again as a browser after a 403, 15 s later (epic 31, D3)", async () => {
    /* Imbibe 403s Node's default agent and serves a browser (25e probe). */
    vi.useFakeTimers();
    const fetchStub = forbiddenThenOk();
    vi.stubGlobal("fetch", fetchStub);
    const pending = importRecipeData(PAGE_URL);
    /* The polite gap: nothing more goes to the host until it has passed. */
    await vi.advanceTimersByTimeAsync(DEFAULT_403_DELAY_MS - 1);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const imported = await pending;
    vi.useRealTimers();
    expect(imported?.name).toBe("Naan");
    expect(fetchStub).toHaveBeenCalledTimes(2);
    const [url, init] = fetchStub.mock.calls[1] as unknown as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe(PAGE_URL);
    expect(init.headers).toBe(RECIPE_FETCH_HEADERS);
    expect(init.headers["user-agent"]).toMatch(/^Mozilla\/5\.0 .*Chrome\//);
    expect(init.headers.accept).toContain("text/html");
  });

  it("retries at once for the browser form (delayMs: 0)", async () => {
    const fetchStub = forbiddenThenOk();
    vi.stubGlobal("fetch", fetchStub);
    const imported = await importRecipeData(PAGE_URL, { delayMs: 0 });
    expect(imported?.name).toBe("Naan");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("never retries with RECIPE_FETCH_403_DELAY_MS=off", async () => {
    vi.stubEnv("RECIPE_FETCH_403_DELAY_MS", "off");
    const fetchStub = forbiddenThenOk();
    vi.stubGlobal("fetch", fetchStub);
    expect(await importRecipeData(PAGE_URL)).toBeUndefined();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("reads RECIPE_FETCH_403_DELAY_MS", () => {
    expect(forbiddenRetryFromEnv(undefined)).toEqual({
      delayMs: 15_000,
      enabled: true,
    });
    expect(forbiddenRetryFromEnv("0")).toEqual({ delayMs: 0, enabled: true });
    expect(forbiddenRetryFromEnv("2500")).toEqual({
      delayMs: 2500,
      enabled: true,
    });
    expect(forbiddenRetryFromEnv(" OFF ")).toEqual({
      delayMs: 0,
      enabled: false,
    });
    expect(forbiddenRetryFromEnv("soon")).toEqual({
      delayMs: 15_000,
      enabled: true,
    });
  });

  it("does not retry any other failure", async () => {
    const fetchStub = vi.fn(async () => ({
      status: 410,
      text: async () => "<html>Gone</html>",
    }));
    vi.stubGlobal("fetch", fetchStub);
    expect(await importRecipeData(PAGE_URL)).toBeUndefined();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("reads ingredients published as objects, and skips unreadable ones", async () => {
    stubFetch(
      recipeHtml({
        recipeIngredient: [
          { ingredient: "1 1/2 oz. white rum", ingredient_link: "" },
          "3/4 oz lime juice",
          { text: "1/4 oz maraschino liqueur" },
          42,
          { unrelated: true },
        ],
      }),
    );
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.ingredients?.map((line) => line.ingredient)).toEqual([
      '<Multiplyable baseNumber="1 1/2" /> oz. white rum',
      '<Multiplyable baseNumber="3/4" /> oz lime juice',
      '<Multiplyable baseNumber="1/4" /> oz maraschino liqueur',
    ]);
  });

  it("carries an author given as a string", async () => {
    stubFetch(recipeHtml({ author: "Pooja Makhijani" }));
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.source).toEqual({
      url: PAGE_URL,
      name: "example.com",
      author: "Pooja Makhijani",
    });
  });

  it("carries an author given as a Person object", async () => {
    stubFetch(
      recipeHtml({ author: { "@type": "Person", name: "Pooja Makhijani" } }),
    );
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.source?.author).toBe("Pooja Makhijani");
  });

  it("carries the first author given as an array", async () => {
    stubFetch(
      recipeHtml({
        author: [
          { "@type": "Person", name: "Pooja Makhijani" },
          { "@type": "Person", name: "Someone Else" },
        ],
      }),
    );
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.source?.author).toBe("Pooja Makhijani");
  });

  it("labels the citation with the publisher when there is one", async () => {
    stubFetch(
      recipeHtml({
        author: "Pooja Makhijani",
        publisher: { "@type": "Organization", name: "King Arthur Baking" },
      }),
    );
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.source).toEqual({
      url: PAGE_URL,
      name: "King Arthur Baking",
      author: "Pooja Makhijani",
    });
  });

  it("falls back to the hostname without `www.` when there is no publisher", async () => {
    stubFetch(recipeHtml());
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.source).toEqual({
      url: PAGE_URL,
      name: "example.com",
      author: undefined,
    });
  });

  it("prefers og:site_name to the hostname when there is no publisher (26d)", async () => {
    stubFetch(
      recipeHtml().replace(
        "<html><head>",
        '<html><head><meta property="og:site_name" content="Example &amp; Co">',
      ),
    );
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.source?.name).toBe("Example & Co");
  });

  it("still prefers the publisher to og:site_name", async () => {
    stubFetch(
      recipeHtml({ publisher: { name: "King Arthur Baking" } }).replace(
        "<html><head>",
        '<html><head><meta property="og:site_name" content="KAB">',
      ),
    );
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.source?.name).toBe("King Arthur Baking");
  });

  it("names a known site with neither a publisher nor a site name (26d)", async () => {
    stubFetch(recipeHtml());
    const url = "https://www.acouplecooks.com/paper-plane-cocktail/";
    const imported = await importRecipeData(url);
    expect(imported?.source).toEqual({
      url,
      name: "A Couple Cooks",
      author: undefined,
    });
  });

  it("no longer prefixes the description with 'Imported from' (D7)", async () => {
    stubFetch(recipeHtml());
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.description).toBe(
      "South Asia's classic yeasted flatbread.",
    );
    expect(imported?.description).not.toContain("Imported from");
  });

  it("leaves the description empty when the page carries none", async () => {
    stubFetch(recipeHtml({ description: undefined }));
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.description).toBeUndefined();
  });

  it("cites a video URL without fetching it, and writes no description", async () => {
    const fetchStub = stubFetch("");
    const videoUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
    const imported = await importRecipeData(videoUrl);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(imported?.source).toEqual({
      url: videoUrl,
      name: "YouTube",
      author: undefined,
    });
    expect(imported?.description).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* 26a: what 25e found missing                                         */
/* ------------------------------------------------------------------ */

describe("importRecipeData mapping (26a)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps recipeYield from a number, a string, or a self-repeating array", async () => {
    stubFetch(recipeHtml({ recipeYield: 10 }));
    expect((await importRecipeData(PAGE_URL))?.recipeYield).toBe("10");
    stubFetch(recipeHtml({ recipeYield: "4 servings" }));
    expect((await importRecipeData(PAGE_URL))?.recipeYield).toBe("4 servings");
    stubFetch(recipeHtml({ recipeYield: ["8", "8 flatbreads"] }));
    expect((await importRecipeData(PAGE_URL))?.recipeYield).toBe(
      "8 flatbreads",
    );
    stubFetch(recipeHtml({ recipeYield: ["2"] }));
    expect((await importRecipeData(PAGE_URL))?.recipeYield).toBe("2");
  });

  it("drops Imbibe's bare-number yield, and keeps one that says what it counts (27c)", async () => {
    const imbibe = "https://imbibemagazine.com/recipe/daiquiri/";
    stubFetch(recipeHtml({ recipeYield: "10" }));
    expect((await importRecipeData(imbibe))?.recipeYield).toBeUndefined();
    stubFetch(recipeHtml({ recipeYield: 4 }));
    expect((await importRecipeData(imbibe))?.recipeYield).toBeUndefined();
    stubFetch(recipeHtml({ recipeYield: "2 drinks" }));
    expect((await importRecipeData(imbibe))?.recipeYield).toBe("2 drinks");
    /* Every other site's bare number stands, as above. */
    stubFetch(recipeHtml({ recipeYield: "10" }));
    expect((await importRecipeData(PAGE_URL))?.recipeYield).toBe("10");
  });

  it("splits instructions given as one string into steps", async () => {
    /* Imbibe's alcohol-free negroni threw on this before 26a. */
    stubFetch(
      recipeHtml({
        recipeInstructions:
          "Add all ingredients to a mixing glass with ice. Stir until chilled. Strain into a rocks glass over a large cube.",
      }),
    );
    expect((await importRecipeData(PAGE_URL))?.instructions).toEqual([
      { text: "Add all ingredients to a mixing glass with ice." },
      { text: "Stir until chilled." },
      { text: "Strain into a rocks glass over a large cube." },
    ]);

    stubFetch(
      recipeHtml({
        recipeInstructions: "<p>Shake hard.</p><p>Double strain. Garnish.</p>",
      }),
    );
    expect((await importRecipeData(PAGE_URL))?.instructions).toEqual([
      { text: "Shake hard." },
      { text: "Double strain. Garnish." },
    ]);
  });

  it("skips a malformed JSON-LD block and reads the good one after it", async () => {
    const html = [
      "<html><head>",
      '<script type="application/ld+json">{"@type": "WebSite", "name": </script>',
      recipeHtml()
        .replace("<html><head>", "")
        .replace("</head><body></body></html>", ""),
      "</head><body></body></html>",
    ].join("");
    stubFetch(html);
    expect((await importRecipeData(PAGE_URL))?.name).toBe("Naan");
  });

  it("takes the best-ranked image, not image[0]", async () => {
    const base = "https://www.example.com/wp-content/uploads/naan";
    stubFetch(
      recipeHtml({
        image: [`${base}-225x225.jpg`, `${base}-500x375.jpg`, `${base}.jpg`],
      }),
    );
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.imageImportUrl).toBe(`${base}.jpg`);
    expect(imported?.images?.map((image) => image.url)).toEqual([
      `${base}.jpg`,
    ]);
  });

  it("falls back to the page's SEO metadata when there is no Recipe node", async () => {
    stubFetch(
      [
        "<html><head>",
        "<title>Paper Plane Cocktail Recipe | PUNCH</title>",
        '<meta property="og:site_name" content="PUNCH">',
        '<meta name="description" content="A modern classic.">',
        '<meta property="og:image" content="https://punchdrink.com/img/plane.jpg">',
        '<meta name="author" content="Sam Ross">',
        "</head><body></body></html>",
      ].join(""),
    );
    expect(await importRecipeData(PAGE_URL)).toEqual({
      partial: true,
      name: "Paper Plane Cocktail Recipe",
      description: "A modern classic.",
      imageImportUrl: "https://punchdrink.com/img/plane.jpg",
      images: [{ url: "https://punchdrink.com/img/plane.jpg", from: "og" }],
      source: { url: PAGE_URL, name: "PUNCH", author: "Sam Ross" },
    });
  });

  it("strips the site name from og:title as well as <title>", async () => {
    stubFetch(
      [
        "<html><head>",
        '<meta property="og:site_name" content="PUNCH">',
        '<meta property="og:title" content="Paper Plane Cocktail Recipe | Punch">',
        "</head><body></body></html>",
      ].join(""),
    );
    expect((await importRecipeData(PAGE_URL))?.name).toBe(
      "Paper Plane Cocktail Recipe",
    );
  });

  it("does not build a partial import from an error page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 404,
        text: async () =>
          "<html><head><title>Page not found</title></head></html>",
      })),
    );
    expect(await importRecipeData(PAGE_URL)).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* 26d: site names and suggested tags                                  */
/* ------------------------------------------------------------------ */

describe("siteLabel", () => {
  it("names the known hosts, with or without www.", () => {
    expect(siteLabel("https://www.thekitchn.com/x")).toBe("The Kitchn");
    expect(siteLabel("https://punchdrink.com/recipes/paper-plane/")).toBe(
      "PUNCH",
    );
    expect(siteLabel("https://youtu.be/abc")).toBe("YouTube");
  });

  it("falls back to the bare hostname, and to undefined for a non-URL", () => {
    expect(siteLabel("https://www.example.com/x")).toBe("example.com");
    expect(siteLabel("not a url")).toBeUndefined();
  });
});

describe("suggestedTags", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads strings, comma lists and arrays, normalized and de-duplicated", () => {
    expect(
      suggestTags({
        recipeCategory: "Cocktail",
        recipeCuisine: ["American", "  Italian "],
        cookingMethod: "Shaken",
        keywords: "paper plane, bourbon cocktail, Cocktail, Aperol",
      }),
    ).toEqual([
      "cocktail",
      "american",
      "italian",
      "shaken",
      "paper plane",
      "bourbon cocktail",
      "aperol",
    ]);
  });

  it("ignores what is not text and caps the list", () => {
    expect(suggestTags({ recipeCategory: 42, keywords: { a: 1 } })).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => `tag ${i}`);
    expect(suggestTags({ keywords: many })).toHaveLength(SUGGESTED_TAGS_LIMIT);
    /* Categories survive the cap; keywords are what it cuts. */
    expect(suggestTags({ recipeCategory: "Drink", keywords: many })[0]).toBe(
      "drink",
    );
  });

  it("rides on the import but never in its tags", async () => {
    stubFetch(
      recipeHtml({ recipeCategory: ["Drinks"], keywords: "gin, sour" }),
    );
    const imported = await importRecipeData(PAGE_URL);
    expect(imported?.suggestedTags).toEqual(["drinks", "gin", "sour"]);
    expect(imported?.tags).toBeUndefined();
  });

  it("is absent when the page offers no signals", async () => {
    stubFetch(recipeHtml());
    const imported = await importRecipeData(PAGE_URL);
    expect(imported && "suggestedTags" in imported).toBe(false);
  });
});
