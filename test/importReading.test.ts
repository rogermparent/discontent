// @vitest-environment node
//
// 38c: what an import reads, past the model's own answer — a page that
// publishes several recipes of its own (to the 36e picker / `--pick`), a
// video whose description links its recipe page (followed, one hop), the
// reading kept by spec so a `--pick` after a refusal does not read again,
// and Vimeo's `#t=` start (in `multiRecipe.test.ts`, beside YouTube's).
// Against a git repository in a tmpdir; `fetch` stubbed (the stand-in
// model, the pages); yt-dlp is the Playwright fixtures' mimic.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import simpleGit, { type SimpleGit } from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import {
  mapRecipeNodes,
  pageRecipeNodes,
} from "../websites/recipe-website/common/util/importRecipeData";
import { parseRecipePage } from "../websites/recipe-website/common/util/pageMetadata";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import {
  importAndCreate,
  type ImportBatchResult,
  type ImportDryRunResult,
  type UrlImport,
} from "../websites/recipe-website/editor/controller/curation/importRecipe";
import { inspectUrl } from "../websites/recipe-website/editor/controller/curation/inspect";
import {
  followRecipeLink,
  recipeLinks,
} from "../websites/recipe-website/editor/controller/curation/videoFollow";
import type { YtdlpMetadata } from "../websites/recipe-website/editor/controller/ytdlp";
import { reduceRecipeImport } from "../websites/recipe-website/editor/controller/formImport";
import {
  corpusOf,
  runSpec,
} from "../websites/recipe-website/editor/controller/jobs/kinds";
import { jobsDirectory } from "../websites/recipe-website/editor/controller/jobs/location";
import { memoryJobLog } from "../websites/recipe-website/editor/controller/jobs/log";
import {
  READING_MAX_AGE_MS,
  pruneReadings,
  readingCache,
  readingKey,
} from "../websites/recipe-website/editor/controller/jobs/readingCache";
import { readJobLog } from "../websites/recipe-website/editor/controller/jobs/store";
import { standInChat } from "../websites/recipe-website/editor/playwright/fixtures/llm/standInModel";

const HERE = dirname(fileURLToPath(import.meta.url));
const YTDLP_MIMIC = join(
  HERE,
  "../websites/recipe-website/editor/playwright/fixtures/yt-dlp/ytdlp-mimic.mjs",
);
const MODEL_URL = "http://model.test:11434";
const PAGE_URL = "https://www.example.com/holiday/two-cakes";
const FOLLOW_VIDEO = "https://www.youtube.com/watch?v=FOLLOW_TEST";
const FOLLOWED_PAGE = "https://written.example.test/p/sichuan-street-pancakes";
const THUMB = "http://localhost:3019/uploads/pork-carnitas.webp";

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;
let modelCalls: string[];
let pages: Map<string, string>;
let pageGets: string[];

function recipeNode(name: string, extra: Record<string, unknown> = {}) {
  return {
    "@type": "Recipe",
    name,
    recipeIngredient: [`2 cups ${name.toLowerCase()} flour`, "1 cup sugar"],
    recipeInstructions: [{ text: `Make the ${name.toLowerCase()}.` }],
    ...extra,
  };
}

function page(...blocks: unknown[]): string {
  return [
    "<html><head><title>Two cakes</title>",
    ...blocks.map(
      (block) =>
        `<script type="application/ld+json">${JSON.stringify(block)}</script>`,
    ),
    "</head><body><p>Two cakes.</p></body></html>",
  ].join("");
}

const TWO_CAKES = page(
  recipeNode("Lemon Cake", { image: "https://www.example.com/lemon.jpg" }),
  recipeNode("Orange Cake"),
);

function stub() {
  modelCalls = [];
  pageGets = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(MODEL_URL)) {
        if (!url.endsWith("/api/chat")) {
          return new Response(JSON.stringify({ models: [] }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body));
        modelCalls.push(body.messages[0].content.slice(0, 40));
        return new Response(JSON.stringify(standInChat(body)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const html = pages.get(url);
      if (html !== undefined) {
        pageGets.push(url);
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (url === THUMB || /\.jpg$/.test(url)) {
        return new Response(init?.method === "HEAD" ? null : "jpeg bytes", {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      }
      return new Response("not here", { status: 404 });
    }),
  );
}

beforeEach(async () => {
  vi.stubEnv("RECIPE_LLM_URL", MODEL_URL);
  vi.stubEnv("YTDLP_PATH", YTDLP_MIMIC);
  vi.stubEnv("RECIPE_POLITE_GAP_MS", "0");
  pages = new Map([[PAGE_URL, TWO_CAKES]]);
  contentDirectory = await mkdtemp(join(tmpdir(), "import-reading-"));
  git = simpleGit({ baseDir: contentDirectory });
  await git.init();
  await git.addConfig("user.email", "curator@test.local");
  await git.addConfig("user.name", "Test Curator");
  await git.addConfig("commit.gpgsign", "false");
  await writeFile(
    join(contentDirectory, ".gitignore"),
    derivedContentPaths(recipeContentTypes),
  );
  await git.add(".");
  await git.commit("Initial commit");
  ctx = {
    contentDirectory,
    author: { name: "Test Curator", email: "curator@test.local" },
  };
  stub();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

function asBatch(result: unknown): ImportBatchResult {
  if (!result || typeof result !== "object" || !("batch" in result)) {
    throw new Error("expected a batch");
  }
  return result as ImportBatchResult;
}

/* ------------------------------------------------------------------ */
/* Several JSON-LD Recipe nodes                                        */
/* ------------------------------------------------------------------ */

describe("a page with several recipes of its own (38c)", () => {
  it("maps each of two nodes, its own picture first", () => {
    const parsed = parseRecipePage(TWO_CAKES, PAGE_URL);
    const recipes = mapRecipeNodes(PAGE_URL, parsed);
    expect(recipes?.map((recipe) => recipe.name)).toEqual([
      "Lemon Cake",
      "Orange Cake",
    ]);
    expect(recipes?.[0].imageImportUrl).toBe(
      "https://www.example.com/lemon.jpg",
    );
    expect(recipes?.[1].ingredients).toHaveLength(2);
    expect(recipes?.[1].source?.url).toBe(PAGE_URL);
  });

  it("reads an @graph the same way", () => {
    const graph = page({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", "@id": `${PAGE_URL}#webpage` },
        recipeNode("Lemon Cake"),
        recipeNode("Orange Cake"),
      ],
    });
    expect(
      mapRecipeNodes(PAGE_URL, parseRecipePage(graph, PAGE_URL))?.map(
        (recipe) => recipe.name,
      ),
    ).toEqual(["Lemon Cake", "Orange Cake"]);
  });

  it("counts a repeated node once, and never a card for another page or a node with no body", () => {
    const html = page(
      recipeNode("Lemon Cake"),
      /* The same recipe again, as a second plugin publishes it. */
      recipeNode("Lemon Cake", { url: `${PAGE_URL}/` }),
      /* A related-recipes card: another page's recipe. */
      recipeNode("Plum Cake", { url: "https://www.example.com/plum-cake" }),
      /* A node with no steps. */
      { "@type": "Recipe", name: "Teaser", recipeIngredient: ["1 egg"] },
    );
    const parsed = parseRecipePage(html, PAGE_URL);
    expect(pageRecipeNodes(PAGE_URL, parsed)).toHaveLength(1);
    /* One recipe of its own: the page maps as it always has. */
    expect(mapRecipeNodes(PAGE_URL, parsed)).toBeUndefined();
  });

  it("dedupes a repeated node by its ingredients, even under a slightly different name (38c review)", () => {
    const sameIngredients = {
      recipeIngredient: ["2 cups cake flour", "1 cup sugar", "2 eggs"],
    };
    const html = page(
      /* The theme's own markup. */
      recipeNode("Best Lemon Cake", sameIngredients),
      /* A plugin's graph, the same ingredients, the name padded with "Recipe". */
      recipeNode("Best Lemon Cake Recipe", sameIngredients),
    );
    const parsed = parseRecipePage(html, PAGE_URL);
    expect(pageRecipeNodes(PAGE_URL, parsed)).toHaveLength(1);
    expect(mapRecipeNodes(PAGE_URL, parsed)).toBeUndefined();
  });

  it("refuses a create with no pick, naming them; a dry run lists both; --pick imports one", async () => {
    const refused = await importAndCreate(ctx, PAGE_URL).catch((e) => e);
    expect(refused.code).toBe("usage");
    expect(refused.message).toContain(
      `The page ${PAGE_URL} has 2 recipes: 1. Lemon Cake, 2. Orange Cake`,
    );
    const dry = asBatch(await importAndCreate(ctx, PAGE_URL, { dryRun: true }));
    expect(dry.found.map((recipe) => [recipe.name, recipe.trusted])).toEqual([
      ["Lemon Cake", true],
      ["Orange Cake", true],
    ]);
    expect(dry.recipes.map((recipe) => recipe.status)).toEqual([
      "would-import",
      "would-import",
    ]);
    expect(dry.warnings?.[0]).toMatch(
      /^the page has 2 recipes: 1\. Lemon Cake, 2\. Orange Cake — pick/,
    );
    const picked = asBatch(
      await importAndCreate(ctx, PAGE_URL, { pick: ["orange cake"] }),
    );
    expect(picked.recipes).toEqual([
      expect.objectContaining({
        n: 2,
        status: "imported",
        slug: "orange-cake",
      }),
    ]);
    const [subject] = (await git.raw(["log", "-1", "--format=%s"]))
      .trim()
      .split("\n");
    /* No model read it, so the commit does not say "local model". */
    expect(subject).toBe(
      "Create recipe: orange-cake (2 of 2 from example.com/holiday/two-cakes)",
    );
    expect(modelCalls).toEqual([]);
  });

  it("asOne maps the first node, as before", async () => {
    const dry = (await importAndCreate(ctx, PAGE_URL, {
      dryRun: true,
      asOne: true,
    })) as ImportDryRunResult;
    expect("batch" in dry).toBe(false);
    expect(dry.recipe.name).toBe("Lemon Cake");
  });

  it("caps a page with more than 30 Recipe nodes, with a warning (38-Dc7)", async () => {
    const many = page(
      ...Array.from({ length: 35 }, (_, index) =>
        recipeNode(`Dish ${index + 1}`),
      ),
    );
    const parsed = parseRecipePage(many, PAGE_URL);
    expect(pageRecipeNodes(PAGE_URL, parsed)).toHaveLength(35);
    const mapped = mapRecipeNodes(PAGE_URL, parsed)!;
    expect(mapped).toHaveLength(35);
    pages.set(PAGE_URL, many);
    const dryMany = asBatch(
      await importAndCreate(ctx, PAGE_URL, { dryRun: true }),
    );
    expect(dryMany.found).toHaveLength(30);
    expect(dryMany.recipes).toHaveLength(30);
    expect(dryMany.warnings).toContainEqual(
      "the page holds 35 recipes; only the first 30 are offered",
    );
  });

  it("inspect lists both, and the form sends them to the picker", async () => {
    const inspected = await inspectUrl(PAGE_URL);
    expect(inspected.recipes?.map((recipe) => recipe.name)).toEqual([
      "Lemon Cake",
      "Orange Cake",
    ]);
    expect(inspected.recipes?.[1].llm).toBeUndefined();
    expect(inspected.draft?.name).toBe("Lemon Cake");
    const state = await reduceRecipeImport(null, PAGE_URL);
    expect(state.recipes?.map((reading) => reading.recipe.name)).toEqual([
      "Lemon Cake",
      "Orange Cake",
    ]);
    expect(state.fromPage).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* A recipe link out of a video's description                          */
/* ------------------------------------------------------------------ */

describe("a video whose description links its recipe (38c)", () => {
  it("finds the one recipe link: 'RECIPE' two lines up, social and music links never", () => {
    const description = [
      "FULL, WRITTEN RECIPE",
      "",
      "... is over on our newsletter! Free as always:",
      "",
      "https://written.example.test/p/sichuan-street-pancakes",
      "",
      "And check out our Patreon!",
      "https://www.patreon.com/ExampleKitchen",
      "Music: https://www.bensound.com/royalty-free-music",
      "My knife (recipe-ready!): https://amzn.to/3abc",
    ].join("\n");
    expect(recipeLinks(description)).toEqual([FOLLOWED_PAGE]);
    /* A path that says so, any host; the same page twice is one link. */
    expect(
      recipeLinks(
        "Printable: https://cook.example.org/recipes/pancakes/\nAgain: https://cook.example.org/recipes/pancakes?utm_source=yt",
      ),
    ).toEqual(["https://cook.example.org/recipes/pancakes/"]);
    /* A link nothing calls a recipe is not one. */
    expect(recipeLinks("My blog: https://cook.example.org/about")).toEqual([]);
  });

  it("never follows a loopback or private-network link, even if it says 'recipe' (SSRF, 38c review)", () => {
    const hosts = [
      "http://127.0.0.1/recipe",
      "http://192.168.1.5/recipe",
      "http://localhost/recipe",
      "http://[::1]/recipe",
      "http://10.0.0.5/recipe",
      "http://169.254.1.1/recipe",
    ];
    for (const url of hosts) {
      expect(recipeLinks(`Full recipe: ${url}`)).toEqual([]);
    }
  });

  it("follows no link when the description has two or more candidates", () => {
    const description = [
      "Recipe one: https://a.example.test/recipe/one",
      "Recipe two: https://b.example.test/recipe/two",
    ].join("\n");
    expect(recipeLinks(description)).toHaveLength(2);
  });

  it("reads the linked page when the description holds no recipe, the video kept", async () => {
    pages.set(
      FOLLOWED_PAGE,
      page(recipeNode("Danhonggao", { recipeYield: "8 pancakes" })),
    );
    const { log, lines } = memoryJobLog();
    const dry = (await importAndCreate(
      ctx,
      FOLLOW_VIDEO,
      { dryRun: true },
      { log },
    )) as ImportDryRunResult;
    expect(dry.recipe.name).toBe("Danhonggao");
    expect(dry.draft.ingredients).toEqual([
      "2 cups danhonggao flour",
      "1 cup sugar",
    ]);
    expect(dry.draft.source?.url).toBe(FOLLOWED_PAGE);
    expect(dry.draft.videoImportUrl).toBe(FOLLOW_VIDEO);
    /* The page has no picture: the video's thumbnail. */
    expect(dry.draft.imageImportUrl).toBe(THUMB);
    expect(dry.warnings?.[0]).toBe(
      `the video's description holds no recipe; read the recipe page it links, ${FOLLOWED_PAGE}`,
    );
    /* The model read the description once (no recipe); the page has its schema. */
    expect(modelCalls).toHaveLength(1);
    expect(pageGets).toEqual([FOLLOWED_PAGE]);
    const follow = lines.filter((line) => line.step === "follow");
    expect(follow.map((line) => line.phase)).toEqual(["start", "end"]);
    expect(follow[1]).toMatchObject({
      ok: true,
      data: expect.objectContaining({ url: FOLLOWED_PAGE }),
    });
  });

  it("keeps the bare video, with a warning, when the linked page has no recipe", async () => {
    pages.set(FOLLOWED_PAGE, "<html><head></head><body></body></html>");
    vi.stubEnv("RECIPE_LLM_URL", "");
    const off = (await importAndCreate(ctx, FOLLOW_VIDEO, {
      dryRun: true,
    })) as ImportDryRunResult;
    /* No model: the description was never read, so nothing is followed. */
    expect(off.recipe.name).toBe("Sichuan-style Pancakes");
    expect(pageGets).toEqual([]);
    vi.stubEnv("RECIPE_LLM_URL", MODEL_URL);
    const empty = (await importAndCreate(ctx, FOLLOW_VIDEO, {
      dryRun: true,
    })) as ImportDryRunResult;
    expect(empty.recipe.name).toBe("Sichuan-style Pancakes");
    expect(empty.warnings).toEqual(
      expect.arrayContaining([
        `the video's description links ${FOLLOWED_PAGE}, but no recipe was found there either`,
      ]),
    );
  });

  it("follows nothing when the description holds two distinct recipe links (38c review)", async () => {
    const metadata: YtdlpMetadata = {
      title: "Two Recipes",
      description: [
        "Recipe one: https://a.example.test/recipe/one",
        "Recipe two: https://b.example.test/recipe/two",
      ].join("\n"),
      thumbnail: THUMB,
      thumbnails: [],
      webpage_url: FOLLOW_VIDEO,
      duration: 60,
      channel: "Example Channel",
      chapters: [],
      tags: [],
    };
    const result = await followRecipeLink({
      url: FOLLOW_VIDEO,
      metadata,
      applied: {
        recipe: { name: "Two Recipes" },
        llm: { model: "qwen3:8b", mode: "auto", found: false },
        warnings: [],
      },
    });
    expect(result).toBeUndefined();
  });

  it("inspect says which page it followed", async () => {
    pages.set(FOLLOWED_PAGE, page(recipeNode("Danhonggao")));
    const inspected = await inspectUrl(FOLLOW_VIDEO);
    expect(inspected.followed).toBe(FOLLOWED_PAGE);
    expect(inspected.draft?.name).toBe("Danhonggao");
    expect(inspected.video?.title).toBe("Sichuan-style Pancakes");
  });

  it("38c review: a failed follow is not cached; a successful one is, reused with no more model calls", async () => {
    const dir = await mkdtemp(join(tmpdir(), "follow-cache-"));
    try {
      const cache = readingCache<UrlImport>(dir, "follow-test-key", {
        job: "01JOB",
      });
      /* The followed page errors out — a transient failure. */
      const inner = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          if (String(input) === FOLLOWED_PAGE) {
            throw new Error("ECONNRESET");
          }
          return inner(input, init);
        }),
      );
      await importAndCreate(ctx, FOLLOW_VIDEO, { dryRun: true }, {}, { cache });
      expect(await cache.load()).toBeUndefined();
      expect(modelCalls).toHaveLength(1);

      /* The page is reachable now: the follow succeeds and is cached, even
       * though the page's own schema means its reading has no `llm` of its
       * own — the video's `llm` is kept. */
      stub();
      pages.set(FOLLOWED_PAGE, page(recipeNode("Danhonggao")));
      const dry = (await importAndCreate(
        ctx,
        FOLLOW_VIDEO,
        { dryRun: true },
        {},
        { cache },
      )) as ImportDryRunResult;
      expect(dry.recipe.name).toBe("Danhonggao");
      expect(modelCalls).toHaveLength(1);
      const kept = await cache.load();
      expect(kept?.value.llm).toBeDefined();

      /* Reused: a create reads the description from the cache, no model call. */
      const created = await importAndCreate(
        ctx,
        FOLLOW_VIDEO,
        {},
        {},
        { cache },
      );
      expect("slug" in created && created.slug).toBe("danhonggao");
      expect(modelCalls).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/* ------------------------------------------------------------------ */
/* The kept reading                                                    */
/* ------------------------------------------------------------------ */

const TWO_RECIPES = [
  "LEMON CAKE",
  "200g flour",
  "100g sugar",
  "",
  "Mix and bake.",
  "",
  "LEMON GLAZE",
  "100g icing sugar",
  "20g lemon juice",
  "",
  "Whisk and pour over the cake.",
].join("\n");

describe("the reading kept by spec (38c)", () => {
  it("a --pick after a refusal reuses the reading: the model is not asked again", async () => {
    const spec = {
      kind: "import-text" as const,
      ...corpusOf(ctx),
      text: TWO_RECIPES,
    };
    const refused = await runSpec({ ...spec, options: {} }).catch((e) => e);
    expect(refused.code).toBe("usage");
    expect(refused.message).toContain("1. Lemon Cake, 2. Lemon Glaze");
    /* The list, the one-dish question, a reading each. */
    expect(modelCalls).toHaveLength(4);

    const picked = await runSpec({
      ...spec,
      options: { pick: ["Lemon Glaze"] },
    });
    expect(modelCalls).toHaveLength(4);
    const batch = asBatch(picked);
    expect(batch.recipes).toEqual([
      expect.objectContaining({ status: "imported", slug: "lemon-glaze" }),
    ]);
    expect(batch.warnings?.join(" ")).toContain("was reused, not read again");
    const log = await readJobLog(jobsDirectory(), picked.job);
    expect(log.lines.some((line) => line.step === "reading")).toBe(true);

    /* Another mode of reading (one recipe) is another key. */
    await runSpec({ ...spec, options: { asOne: true, dryRun: true } });
    expect(modelCalls).toHaveLength(5);
    /* Another model is another key. */
    vi.stubEnv("RECIPE_LLM_MODEL", "qwen3:14b");
    await runSpec({ ...spec, options: { dryRun: true } }).catch(() => {});
    expect(modelCalls).toHaveLength(9);
  });

  it("is bounded: one file per key, stale after the limit, pruned", async () => {
    const dir = await mkdtemp(join(tmpdir(), "readings-"));
    try {
      let now = 1_000_000;
      const key = readingKey({ text: "x", mode: "force" });
      expect(readingKey({ mode: "force", text: "x" })).toBe(key);
      const cache = readingCache<{ warnings: string[] }>(dir, key, {
        job: "01JOB",
        now: () => now,
      });
      expect(await cache.load()).toBeUndefined();
      await cache.save({ warnings: ["first"] });
      await cache.save({ warnings: ["second"] });
      expect(await cache.load()).toEqual({
        value: { warnings: ["second"] },
        savedAt: 1_000_000,
        job: "01JOB",
      });
      now += READING_MAX_AGE_MS + 1;
      expect(await cache.load()).toBeUndefined();
      expect(
        await pruneReadings(dir, { now: Date.now() + READING_MAX_AGE_MS + 1 }),
      ).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fresh skips the read and still keeps the new reading (39a)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "readings-"));
    try {
      const key = readingKey({ text: "x", mode: "force" });
      await readingCache<{ warnings: string[] }>(dir, key, {
        job: "01OLD",
      }).save({ warnings: ["kept"] });
      const fresh = readingCache<{ warnings: string[] }>(dir, key, {
        job: "01NEW",
        fresh: true,
      });
      expect(fresh.fresh).toBe(true);
      expect(await fresh.load()).toBeUndefined();
      await fresh.save({ warnings: ["read again"] });
      expect(await readingCache(dir, key).load()).toMatchObject({
        value: { warnings: ["read again"] },
        job: "01NEW",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("--fresh asks the model again past a kept reading, and the next import reuses it (39a)", async () => {
    const spec = {
      kind: "import-text" as const,
      ...corpusOf(ctx),
      text: TWO_RECIPES,
      /* Its own key: the test before kept a reading of the same text. */
      source: "https://www.example.com/fresh-test",
    };
    await runSpec({ ...spec, options: { dryRun: true } });
    expect(modelCalls).toHaveLength(4);
    const fresh = await runSpec({
      ...spec,
      options: { dryRun: true, fresh: true },
    });
    expect(modelCalls).toHaveLength(8);
    expect(asBatch(fresh).warnings?.join(" ") ?? "").not.toContain(
      "was reused",
    );
    const log = await readJobLog(jobsDirectory(), fresh.job);
    expect(
      log.lines.find((line) => line.step === "reading")?.data,
    ).toMatchObject({ fresh: true });
    /* `fresh` is not in the key: the next import reuses the fresh reading. */
    const again = await runSpec({ ...spec, options: { dryRun: true } });
    expect(modelCalls).toHaveLength(8);
    expect(asBatch(again).warnings?.join(" ")).toContain(
      "was reused, not read again",
    );
  });
});

describe("the model that answered, in warnings and commits (39a, 38-Dg9)", () => {
  const CLAUDE_URL = "https://claude.test";
  const ONE_CAKE = [
    "Lemon Cake",
    "200g flour",
    "100g sugar",
    "2 eggs",
    "",
    "Mix everything and bake for 30 minutes.",
  ].join("\n");

  /** The Messages API, answered by the stand-in model's rules. */
  function stubClaude(): string[] {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url !== `${CLAUDE_URL}/v1/messages`) {
          return new Response("not here", { status: 404 });
        }
        const body = JSON.parse(String(init?.body)) as {
          model: string;
          system?: string;
          messages: { content: { type: string; text?: string }[] }[];
        };
        asked.push(body.model);
        const user = body.messages[0].content
          .map((block) => block.text ?? "")
          .join("");
        const answer = standInChat({
          model: body.model,
          messages: [
            { role: "system", content: body.system ?? "" },
            { role: "user", content: user },
          ],
        }) as { message: { content: string } };
        return Response.json({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: answer.message.content }],
          stop_reason: "end_turn",
          usage: { input_tokens: 100, output_tokens: 50 },
        });
      }),
    );
    return asked;
  }

  beforeEach(() => {
    vi.stubEnv("RECIPE_LLM_API", "anthropic");
    vi.stubEnv("RECIPE_LLM_API_KEY", "sk-ant-test-not-a-real-key-39a");
    vi.stubEnv("RECIPE_LLM_URL", CLAUDE_URL);
    vi.stubEnv("RECIPE_LLM_MODEL", "claude-sonnet-5");
  });

  it("a Claude-answered import says so in its warnings and its commit note", async () => {
    const asked = stubClaude();
    const result = await runSpec({
      kind: "import-text",
      ...corpusOf(ctx),
      text: ONE_CAKE,
      options: {},
    });
    expect(asked).toContain("claude-sonnet-5");
    expect("slug" in result && result.slug).toBe("lemon-cake");
    expect(result.warnings?.join(" ")).toContain(
      "by the Claude API (claude-sonnet-5)",
    );
    expect(result.warnings?.join(" ")).not.toContain("local model");
    const [latest] = (await git.log({ maxCount: 1 })).all;
    expect(latest.message).toBe(
      "Create recipe: lemon-cake (Claude API claude-sonnet-5, pasted text)",
    );
  });

  it("the local model keeps its words (no API named)", async () => {
    vi.stubEnv("RECIPE_LLM_API", "");
    vi.stubEnv("RECIPE_LLM_API_KEY", "");
    vi.stubEnv("RECIPE_LLM_URL", MODEL_URL);
    vi.stubEnv("RECIPE_LLM_MODEL", "");
    stub();
    const result = await runSpec({
      kind: "import-text",
      ...corpusOf(ctx),
      text: ONE_CAKE,
      options: {},
    });
    expect(result.warnings?.join(" ")).toContain("by local model qwen3:8b");
    const [latest] = (await git.log({ maxCount: 1 })).all;
    expect(latest.message).toBe(
      "Create recipe: lemon-cake (local model, pasted text)",
    );
  });
});
