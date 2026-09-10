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
  extractAuthorName,
  importRecipeData,
} from "recipe-website-common/util/importRecipeData";

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
      name: "youtube.com",
      author: undefined,
    });
    expect(imported?.description).toBeUndefined();
  });
});
