// @vitest-environment node
//
// Several recipes in one video or paste (epic 36, 36e, D10): the gate, the
// list, the slices, the components and the chapters (pure), then the seat —
// `importAndCreate` over the yt-dlp mimic's `holiday-sides.json` and
// `importFromText` — against a git repository in a tmpdir, so each create's
// commit can be read. The local model is the stand-in the Playwright spec
// uses (`playwright/fixtures/llm/standInModel.ts`), behind a stubbed
// `fetch`: never a real one.

import { mkdtemp, readFile, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import simpleGit, { type SimpleGit } from "simple-git";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import StyledMarkdown from "@discontent/component-library/components/Markdown";

import {
  videoStartSeconds,
  withVideoStart,
} from "../websites/recipe-website/common/util/videoUrl";
import { recipeLinkSlugs } from "../websites/recipe-website/common/controller/buildIndexValue";
import { parseRecipePicks } from "../websites/recipe-website/editor/cli/commands/import";
import { IMPORT_HTTP_TIMEOUT_MS } from "../websites/recipe-website/editor/cli/backend/http";
import { createIngredient } from "../websites/recipe-website/common/util/parseIngredients";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import type { CurationContext } from "../websites/recipe-website/editor/controller/curation/context";
import { CurationError } from "../websites/recipe-website/editor/controller/curation/errors";
import {
  importAndCreate,
  importFromText,
  type ImportBatchResult,
} from "../websites/recipe-website/editor/controller/curation/importRecipe";
import { ImportRequestSchema } from "../websites/recipe-website/editor/controller/curation/importRequest";
import { inspectUrl } from "../websites/recipe-website/editor/controller/curation/inspect";
import { getRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { createRecipe } from "../websites/recipe-website/editor/controller/curation/recipes";
import { formatStart } from "../websites/recipe-website/editor/controller/llm/chapterTime";
import { memoryJobLog } from "../websites/recipe-website/editor/controller/jobs/log";
import {
  cancelJob,
  runJob,
  runningJobIds,
} from "../websites/recipe-website/editor/controller/jobs/run";
import {
  readJobLog,
  readJobMeta,
} from "../websites/recipe-website/editor/controller/jobs/store";
import {
  applyLlm,
  videoSource,
} from "../websites/recipe-website/editor/controller/llm/importWithLlm";
import {
  linkReading,
  mergeReadings,
} from "../websites/recipe-website/editor/controller/llm/mergeReadings";
import {
  chapterFor,
  findComponents,
  ingredientBlocks,
  linkLine,
  locateRecipes,
  mayHoldSeveral,
  placeInChapters,
  readListAnswer,
  sliceText,
} from "../websites/recipe-website/editor/controller/llm/splitRecipes";
import {
  pickYtdlpMetadata,
  ytdlpToRecipe,
} from "../websites/recipe-website/editor/controller/ytdlp";
import {
  standInChat,
  type StandInOptions,
} from "../websites/recipe-website/editor/playwright/fixtures/llm/standInModel";

const HERE = dirname(fileURLToPath(import.meta.url));
const YTDLP = join(
  HERE,
  "../websites/recipe-website/editor/playwright/fixtures/yt-dlp",
);
const YTDLP_MIMIC = join(YTDLP, "ytdlp-mimic.mjs");
const VIDEO_URL = "https://www.youtube.com/watch?v=SIDES_TEST";
const THUMB = "http://localhost:3019/uploads/pork-carnitas.webp";
const MODEL_URL = "http://model.test:11434";

async function fixture() {
  const raw = JSON.parse(
    await readFile(join(YTDLP, "responses/holiday-sides.json"), "utf8"),
  ) as { output: Record<string, unknown> };
  return pickYtdlpMetadata(raw.output, VIDEO_URL);
}

async function description(): Promise<string> {
  return (await fixture()).description;
}

/** A sectioned single recipe: parts, but one list and one method. */
const PASTA_SALAD = [
  "Fully Loaded Pasta Salad",
  "",
  "Pasta Salad:",
  "450g rotini",
  "150g salami, diced",
  "1 cucumber, diced",
  "",
  "Dressing:",
  "60g red wine vinegar",
  "120g olive oil",
  "5g dried oregano",
  "",
  "Boil the pasta and cool it. Whisk the dressing. Toss everything together.",
].join("\n");

/* ------------------------------------------------------------------ */
/* Pure halves                                                         */
/* ------------------------------------------------------------------ */

describe("splitting a text (36e)", () => {
  it("counts ingredient blocks: four dishes are four, a recipe in sections is one", async () => {
    const text = await description();
    expect(ingredientBlocks(text)).toBe(4);
    expect(mayHoldSeveral(text)).toBe(true);
    expect(ingredientBlocks(PASTA_SALAD)).toBe(1);
    expect(mayHoldSeveral(PASTA_SALAD)).toBe(false);
    /* A gear list of links is never a block. */
    expect(
      ingredientBlocks(
        "GEAR:\n2 pans: https://x.test/a\n3 bowls: https://x.test/b",
      ),
    ).toBe(0);
  });

  it("locates the listed recipes and slices the text with no line lost", async () => {
    const text = await description();
    const listed = readListAnswer({
      recipes: [
        { name: "Potato Puree", heading: "POTATO PUREE", firstIngredient: "" },
        {
          name: "Stuffing",
          heading: "",
          firstIngredient: "500g white bread, cubed",
        },
        {
          name: "Green Bean Casserole",
          heading: "GREEN BEAN CASSEROLE",
          firstIngredient: "",
        },
        {
          name: "Fried Shallots",
          heading: "FRIED SHALLOTS",
          firstIngredient: "",
        },
      ],
    });
    const starts = locateRecipes(text, listed)!;
    const lines = text.split("\n");
    /* A first ingredient brings its heading line with it. */
    expect(starts.map((at) => lines[at])).toEqual([
      "POTATO PUREE",
      "STUFFING",
      "GREEN BEAN CASSEROLE",
      "FRIED SHALLOTS",
    ]);
    const slices = sliceText(text, starts);
    expect(slices).toHaveLength(4);
    /* Every line from the first heading on is in exactly one slice. */
    expect(slices.join("\n").replace(/\n+/g, "\n")).toBe(
      lines.slice(starts[0]).join("\n").trim().replace(/\n+/g, "\n"),
    );
    expect(slices[2]).toContain("see recipe below");
    expect(slices[2]).not.toContain("250g shallots");
    /* A start that cannot be found: no split. */
    expect(
      locateRecipes(text, [
        ...listed,
        { name: "Gravy", heading: "GRAVY", firstIngredient: "1 cup drippings" },
      ]),
    ).toBeUndefined();
    expect(readListAnswer({ recipes: "nope" })).toEqual([]);
    expect(readListAnswer({ found: true, name: "One" })).toEqual([]);
  });

  it("finds the line that names another recipe, and links it verbatim", () => {
    const refs = findComponents([
      {
        names: ["Green Bean Casserole"],
        ingredients: [
          { ingredient: '<Multiplyable baseNumber="900" />g green beans' },
          {
            ingredient: "Crispy fried shallots (or onions) - see recipe below",
          },
        ],
      },
      {
        names: ["Fried Shallots", "FRIED SHALLOTS"],
        ingredients: [
          { ingredient: '<Multiplyable baseNumber="250" />g shallots, sliced' },
        ],
      },
      {
        names: ["Stuffing"],
        ingredients: [
          /* "Fried shallots" words, but no reference and an amount: not a link. */
          {
            ingredient:
              '<Multiplyable baseNumber="2" /> fried shallots, chopped',
          },
          { ingredient: "Fried shallots" },
        ],
      },
    ]);
    expect(refs).toEqual([
      [{ line: 1, target: 1 }],
      [],
      [{ line: 1, target: 1 }],
    ]);
    expect(
      linkLine(
        "Crispy fried shallots (or onions) - see recipe below",
        "fried-shallots",
      ),
    ).toBe(
      "[Crispy fried shallots (or onions) - see recipe below](/recipe/fried-shallots)",
    );
    expect(linkLine("a [b] c", "x")).toBe("[a \\[b\\] c](/recipe/x)");
  });

  it("maps recipes to chapters by title; a component takes its user's chapter", async () => {
    const chapters = (await fixture()).chapters.map((chapter) => ({
      title: chapter.title,
      start: chapter.start_time,
    }));
    expect(chapterFor(["Potato Puree"], chapters)?.start).toBe(32);
    expect(chapterFor(["Fried Shallots"], chapters)).toBeUndefined();
    const placed = placeInChapters(
      [
        ["Potato Puree"],
        ["Stuffing"],
        ["Green Bean Casserole"],
        ["Fried Shallots"],
      ],
      [[], [], [{ line: 5, target: 3 }], []],
      chapters,
    );
    expect(placed.map((chapter) => chapter?.start)).toEqual([
      32, 304, 652, 652,
    ]);
    expect(formatStart(652)).toBe("10:52");
    expect(formatStart(3725)).toBe("1:02:05");
  });

  it("writes and reads a YouTube start", () => {
    expect(withVideoStart(VIDEO_URL, 652)).toBe(`${VIDEO_URL}&t=652s`);
    expect(withVideoStart("https://youtu.be/abc", 30)).toBe(
      "https://youtu.be/abc?t=30s",
    );
    expect(withVideoStart("https://vimeo.com/1", 30)).toBe(
      "https://vimeo.com/1",
    );
    expect(videoStartSeconds(`${VIDEO_URL}&t=652s`)).toBe(652);
    expect(videoStartSeconds(`${VIDEO_URL}&t=10m52s`)).toBe(652);
    expect(videoStartSeconds(`${VIDEO_URL}&start=90`)).toBe(90);
    expect(videoStartSeconds(VIDEO_URL)).toBeUndefined();
    expect(videoStartSeconds("https://vimeo.com/1#t=30")).toBeUndefined();
  });

  it("renders a linked ingredient line as a link, amounts and all", () => {
    const html = renderToStaticMarkup(
      /* Called as a function: its props type requires `children`. */
      StyledMarkdown({
        components: {
          Multiplyable: ({ baseNumber }: { baseNumber: string }) =>
            createElement("span", { className: "amount" }, baseNumber),
        },
        children: linkLine(
          '<Multiplyable baseNumber="2" /> cups crispy shallots - see recipe below',
          "fried-shallots",
        ),
      }),
    );
    expect(html).toContain('href="/recipe/fried-shallots"');
    expect(html).toContain(
      '<span class="amount">2</span> cups crispy shallots',
    );
    /* The index's "What can I make?" reads the same link (25c). */
    expect(recipeLinkSlugs(linkLine("x", "fried-shallots"))).toEqual([
      "fried-shallots",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* The seat                                                            */
/* ------------------------------------------------------------------ */

let contentDirectory: string;
let git: SimpleGit;
let ctx: CurationContext;
let modelCalls: string[];
let imageGets: number;

function stub(options: StandInOptions = {}) {
  modelCalls = [];
  imageGets = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(MODEL_URL)) {
        const body = JSON.parse(String(init?.body));
        modelCalls.push(body.messages[0].content.slice(0, 40));
        return new Response(JSON.stringify(standInChat(body, options)), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === THUMB) {
        if (init?.method !== "HEAD") imageGets += 1;
        return new Response(init?.method === "HEAD" ? null : "jpeg bytes", {
          status: 200,
          headers: { "content-type": "image/webp" },
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
  contentDirectory = await mkdtemp(join(tmpdir(), "multi-recipe-"));
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
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await closeCachedEnvironments();
  await rm(contentDirectory, { recursive: true, force: true });
});

async function messages(count: number): Promise<string[]> {
  return (await git.raw(["log", `-${count}`, "--format=%s"]))
    .trim()
    .split("\n")
    .reverse();
}

function asBatch(result: unknown): ImportBatchResult {
  if (!result || typeof result !== "object" || !("batch" in result)) {
    throw new Error("expected a batch");
  }
  return result as ImportBatchResult;
}

describe("a video with several recipes (36e, yt-dlp mimic)", () => {
  it("reads four recipes, each on its own, with its chapter", async () => {
    stub();
    const dry = asBatch(
      await importAndCreate(ctx, VIDEO_URL, { dryRun: true }),
    );
    /* The list, the one-dish question, then one reading per recipe. */
    expect(modelCalls).toHaveLength(6);
    expect(modelCalls.slice(0, 2)).toEqual([
      expect.stringMatching(/^You find the separate recipes/),
      expect.stringMatching(/^You read a recipe text and say whether/),
    ]);
    expect(
      dry.found.map((recipe) => [recipe.n, recipe.name, recipe.chapter?.start]),
    ).toEqual([
      [1, "Potato Puree", 32],
      [2, "Stuffing", 304],
      [3, "Green Bean Casserole", 652],
      [4, "Fried Shallots", 652],
    ]);
    expect(dry.found[2]).toMatchObject({
      ingredients: 6,
      grounded: 6,
      total: 6,
    });
    expect(dry.recipes.map((recipe) => recipe.status)).toEqual(
      Array(4).fill("would-import"),
    );
    expect(dry.warnings?.[0]).toMatch(
      /^local model qwen3:8b found 4 recipes in the video's description: 1\. Potato Puree, 2\. Stuffing/,
    );
    const casserole = dry.recipes[2];
    expect(casserole.slug).toBe("green-bean-casserole");
    expect(casserole.draft?.source?.url).toBe(`${VIDEO_URL}&t=652s`);
    expect(casserole.draft?.videoImportUrl).toBe(`${VIDEO_URL}&t=652s`);
    /* The dry run links the shallot line to the planned slug. */
    expect(casserole.draft?.ingredients?.at(-1)).toBe(
      "[Crispy fried shallots (or onions) - see recipe below](/recipe/fried-shallots)",
    );
    /* The video's description is every recipe's at once: none of them gets it. */
    expect(casserole.draft?.description).toBeUndefined();
    /* The shared thumbnail is probed once for all four. */
    expect(dry.recipes.every((recipe) => recipe.image?.filename)).toBe(true);
    expect(dry.suggestedTags).toEqual(
      expect.arrayContaining(["thanksgiving sides"]),
    );
  });

  it("reads one dish in parts as one recipe, and says why", async () => {
    stub({ oneDish: true });
    const dry = await importAndCreate(ctx, VIDEO_URL, { dryRun: true });
    expect("batch" in dry).toBe(false);
    /* The list, the question, then the whole text as one reading. */
    expect(modelCalls).toHaveLength(3);
    expect(modelCalls[2]).toMatch(/^You extract one recipe/);
    expect("warnings" in dry && dry.warnings?.join(" ")).toContain(
      "read Potato Puree, Stuffing, Green Bean Casserole, Fried Shallots as parts of one dish — read as one",
    );
  });

  it("refuses a create with no pick, naming the recipes", async () => {
    stub();
    const error = await importAndCreate(ctx, VIDEO_URL).catch((e) => e);
    expect(error).toBeInstanceOf(CurationError);
    expect(error.code).toBe("usage");
    expect(error.message).toContain(
      "1. Potato Puree, 2. Stuffing, 3. Green Bean Casserole, 4. Fried Shallots",
    );
    expect(error.message).toContain("--all");
    expect(await messages(1)).toEqual(["Initial commit"]);
  });

  it("imports them all: one commit each, the link resolved, the picture fetched once", async () => {
    stub();
    const result = asBatch(
      await importAndCreate(ctx, VIDEO_URL, { all: true }),
    );
    expect(
      result.recipes.map((recipe) => [recipe.status, recipe.slug]),
    ).toEqual([
      ["imported", "potato-puree"],
      ["imported", "stuffing"],
      ["imported", "green-bean-casserole"],
      ["imported", "fried-shallots"],
    ]);
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/found 4 recipes .* — all picked$/),
    );
    /* What others link to is created first (36e review, L2). */
    expect(await messages(4)).toEqual([
      "Create recipe: fried-shallots (local model, 4 of 4 from youtube.com/watch?v=SIDES_TEST)",
      "Create recipe: potato-puree (local model, 1 of 4 from youtube.com/watch?v=SIDES_TEST)",
      "Create recipe: stuffing (local model, 2 of 4 from youtube.com/watch?v=SIDES_TEST)",
      "Create recipe: green-bean-casserole (local model, 3 of 4 from youtube.com/watch?v=SIDES_TEST)",
    ]);
    expect(imageGets).toBe(1);
    const casserole = (await getRecipe(ctx, "green-bean-casserole")).recipe;
    expect(casserole.ingredients?.at(-1)?.ingredient).toBe(
      "[Crispy fried shallots (or onions) - see recipe below](/recipe/fried-shallots)",
    );
    expect(casserole.source?.url).toBe(`${VIDEO_URL}&t=652s`);
    expect(casserole.video).toBe(`${VIDEO_URL}&t=652s`);
    expect(casserole.image).toBeTruthy();
    const shallots = (await getRecipe(ctx, "fried-shallots")).recipe;
    expect(shallots.source).toMatchObject({
      url: `${VIDEO_URL}&t=652s`,
      name: "YouTube",
      author: "Test Kitchen Channel",
    });
  });

  it("picks some: no link to a recipe left behind; a bad pick is refused", async () => {
    stub();
    const result = asBatch(
      await importAndCreate(ctx, VIDEO_URL, { pick: [3] }),
    );
    expect(result.recipes).toEqual([
      expect.objectContaining({
        n: 3,
        status: "imported",
        slug: "green-bean-casserole",
      }),
    ]);
    expect(result.found).toHaveLength(4);
    const casserole = (await getRecipe(ctx, "green-bean-casserole")).recipe;
    expect(casserole.ingredients?.at(-1)?.ingredient).toBe(
      "Crispy fried shallots (or onions) - see recipe below",
    );
    expect(result.recipes[0].warnings).toContain(
      '"Crispy fried shallots (or onions) - see recipe below" is not linked: "Fried Shallots" is not imported — pick it too',
    );
    expect(await messages(1)).toEqual([
      "Create recipe: green-bean-casserole (local model, 3 of 4 from youtube.com/watch?v=SIDES_TEST)",
    ]);

    const beyond = await importAndCreate(ctx, VIDEO_URL, { pick: [5] }).catch(
      (e) => e,
    );
    expect(beyond.code).toBe("validation");
    expect(beyond.message).toMatch(
      /^pick 5: the local model found 1\. Potato Puree, .* — pick by name\.$/,
    );
    const both = await importAndCreate(ctx, VIDEO_URL, {
      pick: [1],
      all: true,
    }).catch((e) => e);
    expect(both.code).toBe("usage");
    const slugForTwo = await importAndCreate(ctx, VIDEO_URL, {
      pick: [1, 2],
      slug: "x",
    }).catch((e) => e);
    expect(slugForTwo.code).toBe("usage");
  });

  it("links to the shallots an earlier pick of the same video made — not to another source's", async () => {
    stub();
    /* Someone else's fried shallots first: never linked. */
    await createRecipe(ctx, {
      name: "Fried Shallots",
      ingredients: ["4 shallots"],
      source: { url: "https://example.com/shallots" },
    });
    await importAndCreate(ctx, VIDEO_URL, { pick: [3] });
    expect(
      (await getRecipe(ctx, "green-bean-casserole")).recipe.ingredients?.at(-1)
        ?.ingredient,
    ).toBe("Crispy fried shallots (or onions) - see recipe below");

    /* Ours, from this video, then the casserole again under another slug. */
    await importAndCreate(ctx, VIDEO_URL, {
      pick: [4],
      slug: "fried-shallots-lagerstrom",
    });
    await importAndCreate(ctx, VIDEO_URL, {
      pick: [3],
      slug: "casserole-again",
    });
    /* Its planned slug holds the other source's: still no link. */
    expect(
      (await getRecipe(ctx, "casserole-again")).recipe.ingredients?.at(-1)
        ?.ingredient,
    ).toBe("Crispy fried shallots (or onions) - see recipe below");
  });

  it("links to an earlier pick of the same video at its own slug", async () => {
    stub();
    await importAndCreate(ctx, VIDEO_URL, { pick: [4] });
    await importAndCreate(ctx, VIDEO_URL, { pick: [3] });
    expect(
      (await getRecipe(ctx, "green-bean-casserole")).recipe.ingredients?.at(-1)
        ?.ingredient,
    ).toBe(
      "[Crispy fried shallots (or onions) - see recipe below](/recipe/fried-shallots)",
    );
  });

  it("fails a taken slug alone; the rest land", async () => {
    stub();
    await createRecipe(ctx, { name: "Stuffing", ingredients: ["1 loaf"] });
    const result = asBatch(
      await importAndCreate(ctx, VIDEO_URL, { pick: [1, 2] }),
    );
    expect(result.recipes[0]).toMatchObject({
      status: "imported",
      slug: "potato-puree",
    });
    expect(result.recipes[1]).toMatchObject({
      status: "failed",
      error: { code: "slug_conflict", slug: "stuffing" },
    });
    expect(result.recipes[1].error?.message).toContain(
      '--pick "Stuffing" --slug',
    );
  });

  it("trusts each recipe on its own: one invented reading does not sink the rest", async () => {
    stub({ invent: ["STUFFING"] });
    const dry = asBatch(
      await importAndCreate(ctx, VIDEO_URL, { dryRun: true }),
    );
    /* 0/6 found: under the floor, so the stuffing is left out, with a note. */
    expect(dry.found.map((recipe) => recipe.name)).toEqual([
      "Potato Puree",
      "Green Bean Casserole",
      "Fried Shallots",
    ]);
    expect(dry.warnings?.join(" ")).toMatch(
      /"Stuffing": local model output discarded — only 0\/6 ingredient lines found .* — left out/,
    );
    /* The list's positions stay (36e review, M3): a gap where it was. */
    expect(dry.found.map((recipe) => recipe.n)).toEqual([1, 3, 4]);
    expect(dry.leftOut).toEqual([
      expect.objectContaining({ n: 2, name: "Stuffing" }),
    ]);
    expect(dry.recipes[1].draft?.ingredients?.at(-1)).toMatch(
      /\]\(\/recipe\/fried-shallots\)$/,
    );
    /* A pick of the gap says why, by position or by name. */
    const gap = await importAndCreate(ctx, VIDEO_URL, { pick: [2] }).catch(
      (e) => e,
    );
    expect(gap.code).toBe("validation");
    expect(gap.message).toMatch(
      /^pick 2 \("Stuffing"\) was left out this time/,
    );
    const named = await importAndCreate(ctx, VIDEO_URL, {
      pick: ["stuffing"],
    }).catch((e) => e);
    expect(named.message).toMatch(/^pick "stuffing" was left out this time/);
  });

  it("inspect lists every recipe with its own draft; draft stays the first", async () => {
    stub();
    const result = await inspectUrl(VIDEO_URL);
    expect(
      result.recipes?.map((recipe) => [
        recipe.n,
        recipe.slug,
        recipe.chapter?.start,
      ]),
    ).toEqual([
      [1, "potato-puree", 32],
      [2, "stuffing", 304],
      [3, "green-bean-casserole", 652],
      [4, "fried-shallots", 652],
    ]);
    expect(result.draft?.name).toBe("Potato Puree");
    expect(result.recipes?.[2].draft.ingredients?.at(-1)).toBe(
      "[Crispy fried shallots (or onions) - see recipe below](/recipe/fried-shallots)",
    );
    expect(result.warnings?.[0]).toMatch(/found 4 recipes/);
  });
});

describe("pasted text with several recipes (36e)", () => {
  it("splits a paste the same way, and its commits say so", async () => {
    stub();
    const text = await description();
    const dry = asBatch(await importFromText(ctx, { text, dryRun: true }));
    expect(dry.pastedText).toBe(true);
    expect(dry.found).toHaveLength(4);
    /* No video, no chapters: no start. */
    expect(dry.found.every((recipe) => recipe.chapter === undefined)).toBe(
      true,
    );
    const created = asBatch(await importFromText(ctx, { text, pick: [3, 4] }));
    expect(created.recipes.map((recipe) => recipe.status)).toEqual([
      "imported",
      "imported",
    ]);
    expect(await messages(2)).toEqual([
      "Create recipe: fried-shallots (local model, pasted text, 4 of 4)",
      "Create recipe: green-bean-casserole (local model, pasted text, 3 of 4)",
    ]);
    const casserole = (await getRecipe(ctx, "green-bean-casserole")).recipe;
    expect(casserole.ingredients?.at(-1)?.ingredient).toMatch(
      /\]\(\/recipe\/fried-shallots\)$/,
    );
  });

  it("partial on its own under the text's own gate (force over nothing)", async () => {
    stub();
    /* Two of the pasted recipes, one with an invented line among four. */
    const text = [
      "CAKE",
      "200g flour",
      "100g sugar",
      "2 eggs",
      "",
      "Mix and bake.",
      "",
      "GLAZE",
      "100g icing sugar",
      "20g lemon juice",
      "",
      "Whisk and pour over the cake.",
    ].join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        const answer = standInChat(body);
        const content = JSON.parse(answer.message.content);
        if (content.name === "CAKE") {
          content.ingredients = [...content.ingredients, "1 tsp unicorn dust"];
        }
        return new Response(
          JSON.stringify({
            ...answer,
            message: { ...answer.message, content: JSON.stringify(content) },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const dry = asBatch(await importFromText(ctx, { text, dryRun: true }));
    expect(
      dry.found.map((recipe) => [recipe.name, recipe.partial ?? false]),
    ).toEqual([
      ["Cake", true],
      ["Glaze", false],
    ]);
    /* A create of the partial one alone needs allowPartial; the other lands. */
    const created = asBatch(await importFromText(ctx, { text, all: true }));
    expect(created.recipes[0]).toMatchObject({
      status: "failed",
      error: { code: "import_failed" },
    });
    expect(created.recipes[1]).toMatchObject({
      status: "imported",
      slug: "glaze",
    });
  });

  it("leaves a single recipe in sections exactly as before: one call, no list", async () => {
    stub();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        modelCalls.push(body.messages[0].content.slice(0, 40));
        return new Response(
          JSON.stringify({
            model: "qwen3:8b",
            message: {
              role: "assistant",
              content: JSON.stringify({
                found: true,
                name: "Fully Loaded Pasta Salad",
                ingredients: PASTA_SALAD.split("\n")
                  .slice(2, 11)
                  .filter(Boolean),
                instructions: [
                  "Boil the pasta and cool it.",
                  "Toss everything together.",
                ],
              }),
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const dry = await importFromText(ctx, { text: PASTA_SALAD, dryRun: true });
    expect("batch" in dry).toBe(false);
    expect(modelCalls).toHaveLength(1);
    expect(modelCalls[0]).toMatch(/^You extract one recipe/);
    /* pick 1 is the one recipe; pick 2 names nothing. */
    const two = await importFromText(ctx, {
      text: PASTA_SALAD,
      pick: [2],
    }).catch((e) => e);
    expect(two.code).toBe("validation");
  });
});

describe("applyLlm and the picker's helpers (36e)", () => {
  it("a video's chapters ride on its source, never in the model's text", async () => {
    const meta = await fixture();
    const source = videoSource(meta);
    expect("text" in source && source.chapters?.[3]).toEqual({
      title: "Green Bean Casserole",
      start: 652,
    });
    stub();
    const applied = await applyLlm({
      url: VIDEO_URL,
      source,
      mapped: ytdlpToRecipe(meta, VIDEO_URL),
      mode: "auto",
      split: true,
    });
    expect(applied.recipes).toHaveLength(4);
    expect(applied.recipe).toBe(applied.recipes![0].recipe);
    expect(applied.recipes![2].components).toEqual([{ line: 5, target: 4 }]);
    /* Without `split` (a page), one reading of the whole text. */
    stub();
    const single = await applyLlm({
      url: VIDEO_URL,
      source,
      mapped: ytdlpToRecipe(meta, VIDEO_URL),
      mode: "auto",
    });
    expect(single.recipes).toBeUndefined();
    expect(modelCalls).toHaveLength(1);
  });

  it("merges the parts back into one recipe", async () => {
    stub();
    const meta = await fixture();
    const applied = await applyLlm({
      url: VIDEO_URL,
      source: videoSource(meta),
      mapped: ytdlpToRecipe(meta, VIDEO_URL),
      mode: "auto",
      split: true,
    });
    const merged = mergeReadings(applied.recipes!, meta.title);
    expect(merged.name).toBe("Holiday Sides 3 Ways");
    expect(merged.source?.url).toBe(VIDEO_URL);
    expect(merged.videoImportUrl).toBe(VIDEO_URL);
    expect(
      merged.ingredients
        ?.filter((line) => line.type === "heading")
        .map((line) => line.ingredient),
    ).toEqual([
      "Potato Puree:",
      "Stuffing:",
      "Green Bean Casserole:",
      "Fried Shallots:",
    ]);
    expect(
      merged.instructions?.map((entry) => "name" in entry && entry.name),
    ).toEqual([
      "Potato Puree",
      "Stuffing",
      "Green Bean Casserole",
      "Fried Shallots",
    ]);
  });
});

describe("pick and all on the way in (36e)", () => {
  it("parses --pick: names, positions, repeated flags; refuses junk", () => {
    expect(parseRecipePicks("1,3")).toEqual([1, 3]);
    expect(parseRecipePicks("2-4,2")).toEqual([2, 3, 4]);
    expect(parseRecipePicks("Green Bean Casserole")).toEqual([
      "Green Bean Casserole",
    ]);
    expect(parseRecipePicks(["Fried Shallots", "1"])).toEqual([
      "Fried Shallots",
      1,
    ]);
    expect(() => parseRecipePicks("0")).toThrow(/1-based positions/);
    expect(() => parseRecipePicks(",")).toThrow(/names no recipes/);
  });

  it("the request schema takes pick or all, not both", () => {
    expect(
      ImportRequestSchema.safeParse({ url: VIDEO_URL, pick: [1, 3] }).success,
    ).toBe(true);
    expect(
      ImportRequestSchema.safeParse({ text: "x", all: true }).success,
    ).toBe(true);
    const both = ImportRequestSchema.safeParse({
      url: VIDEO_URL,
      pick: [1],
      all: true,
    });
    expect(both.success).toBe(false);
    expect(
      ImportRequestSchema.safeParse({ url: VIDEO_URL, pick: [0] }).success,
    ).toBe(false);
    expect(
      ImportRequestSchema.safeParse({ url: VIDEO_URL, pick: [] }).success,
    ).toBe(false);
    expect(
      ImportRequestSchema.safeParse({
        url: VIDEO_URL,
        pick: ["Green Bean Casserole", 4],
      }).success,
    ).toBe(true);
    expect(
      ImportRequestSchema.safeParse({ url: VIDEO_URL, asOne: true }).success,
    ).toBe(true);
    expect(
      ImportRequestSchema.safeParse({ url: VIDEO_URL, asOne: true, all: true })
        .success,
    ).toBe(false);
  });

  it("the CLI waits under undici's 300 s for an import (L5)", () => {
    expect(IMPORT_HTTP_TIMEOUT_MS).toBe(285_000);
  });
});

/* ------------------------------------------------------------------ */
/* 36e review                                                          */
/* ------------------------------------------------------------------ */

describe("36e review: locating, failing safely, picks, as-one, re-runs", () => {
  it("M2: a heading is never an ingredient line or a chapter line", () => {
    const text = [
      "0:00 Intro",
      "5:04 Stuffing",
      "10:52 Fried Shallots",
      "",
      "STUFFING",
      "500g white bread",
      "2 eggs",
      "",
      "Toss and bake.",
      "",
      "GREEN BEAN CASSEROLE",
      "900g green beans",
      "2 cups fried shallots",
      "",
      "Bake it.",
      "",
      "FRIED SHALLOTS (FOR THE CASSEROLE)",
      "250g shallots",
      "200g flour",
      "",
      "Fry them.",
    ].join("\n");
    const lines = text.split("\n");
    const starts = locateRecipes(text, [
      {
        name: "Stuffing",
        heading: "Stuffing",
        firstIngredient: "500g white bread",
      },
      {
        name: "Green Bean Casserole",
        heading: "GREEN BEAN CASSEROLE",
        firstIngredient: "900g green beans",
      },
      {
        name: "Fried Shallots",
        heading: "FRIED SHALLOTS",
        firstIngredient: "250g shallots",
      },
    ])!;
    expect(starts.map((at) => lines[at])).toEqual([
      "STUFFING",
      "GREEN BEAN CASSEROLE",
      "FRIED SHALLOTS (FOR THE CASSEROLE)",
    ]);
    /* The casserole keeps its shallot line. */
    expect(sliceText(text, starts)[1]).toContain("2 cups fried shallots");

    /* A heading whose list is not near it falls back to the first ingredient. */
    const far = [
      "Holiday notes",
      "",
      "SIDES",
      "Lots of words about sides here.",
      "More words about the table.",
      "Even more words.",
      "And more.",
      "300g onion",
      "2 eggs",
    ].join("\n");
    const at = locateRecipes(far, [
      { name: "Sides", heading: "SIDES", firstIngredient: "300g onion" },
    ])!;
    expect(far.split("\n")[at[0]]).toBe("300g onion");
  });

  it("M1: a failed list call costs nothing — the text is read as one", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input) === THUMB) {
          return new Response(init?.method === "HEAD" ? null : "img", {
            headers: { "content-type": "image/webp" },
          });
        }
        calls += 1;
        const body = JSON.parse(String(init?.body));
        if (body.messages[0].content.startsWith("You find the separate")) {
          return new Response("upstream broke", { status: 500 });
        }
        return Response.json(standInChat(body));
      }),
    );
    const dry = await importAndCreate(ctx, VIDEO_URL, { dryRun: true });
    expect("batch" in dry).toBe(false);
    expect(calls).toBe(2);
    expect("warnings" in dry && dry.warnings?.join(" ")).toMatch(
      /looking for several recipes failed — the local model at .* answered 500.*; read as one/,
    );
  });

  it("M1: a failed slice is left out with a warning; the rest stay", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input) === THUMB) {
          return new Response("img", {
            headers: { "content-type": "image/webp" },
          });
        }
        const body = JSON.parse(String(init?.body));
        if (
          String(body.messages[1]?.content).includes("--- TEXT ---\nSTUFFING")
        ) {
          return new Response("{not json", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return Response.json(standInChat(body));
      }),
    );
    const dry = asBatch(
      await importAndCreate(ctx, VIDEO_URL, { dryRun: true }),
    );
    expect(dry.found.map((recipe) => recipe.n)).toEqual([1, 3, 4]);
    expect(dry.leftOut?.[0]).toMatchObject({ n: 2, name: "Stuffing" });
    expect(dry.leftOut?.[0].reason).toMatch(/^local model failed — /);
  });

  it("L5: past its deadline the split gives up, and the text is read as one", async () => {
    const meta = await fixture();
    let slow = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        if (
          slow &&
          body.messages[0].content.startsWith("You find the separate")
        ) {
          slow = false;
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 5_000);
            init?.signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(init.signal!.reason);
            });
          });
        }
        return Response.json(standInChat(body));
      }),
    );
    const applied = await applyLlm({
      url: VIDEO_URL,
      source: videoSource(meta),
      mapped: ytdlpToRecipe(meta, VIDEO_URL),
      mode: "auto",
      split: true,
      splitDeadlineMs: 50,
    });
    /* Read as one: one more call, no batch. */
    expect(applied.recipes).toBeUndefined();
    expect(applied.llm).toBeDefined();
    expect(applied.warnings.join(" ")).toMatch(
      /looking for several recipes failed — no answer within 0 s; read as one/,
    );
  });

  it("M3: picks by name, case and dashes aside; a missing name is refused", async () => {
    stub();
    const result = asBatch(
      await importAndCreate(ctx, VIDEO_URL, {
        pick: ["green bean casserole", "fried-shallots"],
      }),
    );
    expect(result.recipes.map((recipe) => [recipe.n, recipe.status])).toEqual([
      [3, "imported"],
      [4, "imported"],
    ]);
    const missing = await importAndCreate(ctx, VIDEO_URL, {
      pick: ["Gravy"],
    }).catch((e) => e);
    expect(missing.code).toBe("validation");
    expect(missing.message).toBe(
      'pick "Gravy": no recipe of that name this time. Found: 1. Potato Puree, 2. Stuffing, 3. Green Bean Casserole, 4. Fried Shallots.',
    );
    const refused = await importAndCreate(ctx, VIDEO_URL).catch((e) => e);
    expect(refused.message).toContain('--pick "Stuffing"');
  });

  it("M4: asOne reads the video as one recipe, no list asked", async () => {
    stub();
    const dry = await importAndCreate(ctx, VIDEO_URL, {
      dryRun: true,
      asOne: true,
    });
    expect("batch" in dry).toBe(false);
    expect(modelCalls).toEqual([
      expect.stringMatching(/^You extract one recipe/),
    ]);
    const both = await importAndCreate(ctx, VIDEO_URL, {
      asOne: true,
      all: true,
    }).catch((e) => e);
    expect(both.code).toBe("usage");
    /* Pasted text too. */
    stub();
    const text = await description();
    /* The stand-in finds nothing in the whole text at once: what counts is
     * that it was asked once, as one recipe. */
    await importFromText(ctx, { text, dryRun: true, asOne: true }).catch(
      () => undefined,
    );
    expect(modelCalls).toEqual([
      expect.stringMatching(/^You extract one recipe/),
    ]);
  });

  it("L1: --all again after a partial run imports only what is missing", async () => {
    stub();
    await importAndCreate(ctx, VIDEO_URL, { pick: ["Stuffing"] });
    const again = asBatch(await importAndCreate(ctx, VIDEO_URL, { all: true }));
    expect(again.recipes.map((recipe) => [recipe.n, recipe.status])).toEqual([
      [1, "imported"],
      [2, "existing"],
      [3, "imported"],
      [4, "imported"],
    ]);
    expect(again.recipes[1]).toMatchObject({ slug: "stuffing" });
    const third = asBatch(await importAndCreate(ctx, VIDEO_URL, { all: true }));
    expect(third.recipes.every((recipe) => recipe.status === "existing")).toBe(
      true,
    );
    /* Four commits and the initial one: nothing written the third time. */
    expect(await messages(6)).toHaveLength(5);
  });

  it("L2: an existing target is linked; a failed one is not, with a warning", async () => {
    stub();
    await importAndCreate(ctx, VIDEO_URL, { pick: ["Fried Shallots"] });
    const both = asBatch(
      await importAndCreate(ctx, VIDEO_URL, { pick: [3, 4] }),
    );
    expect(both.recipes.map((recipe) => recipe.status)).toEqual([
      "imported",
      "existing",
    ]);
    expect(
      (await getRecipe(ctx, "green-bean-casserole")).recipe.ingredients?.at(-1)
        ?.ingredient,
    ).toMatch(/\]\(\/recipe\/fried-shallots\)$/);
  });

  it("L2: a target that fails leaves the line unlinked, said", async () => {
    stub();
    await createRecipe(ctx, { name: "Fried Shallots", ingredients: ["1 x"] });
    const result = asBatch(
      await importAndCreate(ctx, VIDEO_URL, { pick: [3, 4] }),
    );
    expect(result.recipes.map((recipe) => recipe.status)).toEqual([
      "imported",
      "failed",
    ]);
    expect(result.recipes[0].warnings).toContain(
      '"Crispy fried shallots (or onions) - see recipe below" is not linked: "Fried Shallots" was not imported',
    );
  });

  it("L4: no chapter means no start, not the pasted one", async () => {
    stub();
    const dry = asBatch(
      await importFromText(ctx, {
        text: await description(),
        source: `${VIDEO_URL}&t=32s`,
        dryRun: true,
      }),
    );
    expect(dry.recipes.map((recipe) => recipe.draft?.source?.url)).toEqual(
      Array(4).fill(VIDEO_URL),
    );
    expect(withVideoStart(`${VIDEO_URL}&t=32s`, 0)).toBe(VIDEO_URL);
  });

  it("L3: a link's target is not an amount", () => {
    expect(
      createIngredient("[2 cups 7-layer dip](/recipe/7-layer-dip)")?.ingredient,
    ).toBe(
      '[<Multiplyable baseNumber="2" /> cups <Multiplyable baseNumber="7" />-layer dip](/recipe/7-layer-dip)',
    );
    expect(
      createIngredient("1 [beans](/recipe/beans-2) or 3")?.ingredient,
    ).toBe(
      '<Multiplyable baseNumber="1" /> [beans](/recipe/beans-2) or <Multiplyable baseNumber="3" />',
    );
  });

  it("L1: Edit this one first keeps the link, to the sibling's planned slug", () => {
    const linked = linkReading(
      {
        name: "Green Bean Casserole",
        ingredients: [
          { ingredient: "900g beans" },
          { ingredient: "Crispy fried shallots - see recipe below" },
        ],
      },
      [{ line: 1, target: 4 }],
      (n) => (n === 4 ? "fried-shallots" : undefined),
    );
    expect(linked.ingredients?.[1].ingredient).toBe(
      "[Crispy fried shallots - see recipe below](/recipe/fried-shallots)",
    );
  });
});

/* ------------------------------------------------------------------ */
/* The step log (epic 37, 37a)                                         */
/* ------------------------------------------------------------------ */

describe("the job's step log (37a)", () => {
  /**
   * The stand-in model with Ollama's numbers on each answer, and an
   * `/api/ps` that puts `gpu` percent of the model on the GPU.
   */
  function stubWithPlacement(gpu: number) {
    stub();
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === `${MODEL_URL}/api/ps`) {
          return Response.json({
            models: [
              {
                name: "qwen3:8b",
                model: "qwen3:8b",
                size: 1000,
                size_vram: gpu * 10,
              },
            ],
          });
        }
        const response = await inner(input, init);
        if (!url.startsWith(MODEL_URL)) return response;
        return Response.json({
          ...(await response.json()),
          prompt_eval_count: 900,
          prompt_eval_duration: 2e9,
          eval_count: 400,
          eval_duration: 10e9,
          load_duration: 3e6,
        });
      }),
    );
  }

  it("logs the video's steps in order: yt-dlp, the split, each model call, each reading", async () => {
    stubWithPlacement(100);
    const { log, lines } = memoryJobLog();
    await importAndCreate(ctx, VIDEO_URL, { dryRun: true }, { log });
    const ends = lines.filter((line) => line.phase === "end");
    expect(ends.map((line) => line.step)).toEqual([
      "ytdlp",
      "llm.list",
      "llm.oneDish",
      "llm.extract",
      "llm.extract",
      "llm.extract",
      "llm.extract",
      "image",
    ]);
    for (const line of ends) {
      expect(line.ok).toBe(true);
      expect(typeof line.ms).toBe("number");
    }
    expect(ends[0].data).toMatchObject({
      exit: 0,
      chapters: 5,
      comments: true,
    });
    expect(ends[1].data).toMatchObject({
      names: [
        "Potato Puree",
        "Stuffing",
        "Green Bean Casserole",
        "Fried Shallots",
      ],
      promptTokens: 900,
      outputTokens: 400,
      tokPerSec: 40,
      promptTokPerSec: 450,
      gpu: 100,
    });
    expect(ends[2].data).toMatchObject({ oneDish: false });
    const readings = ends.filter((line) => line.step === "llm.extract");
    expect(readings.map((line) => [line.data?.part, line.data?.name])).toEqual([
      ["1/4", "Potato Puree"],
      ["2/4", "Stuffing"],
      ["3/4", "Green Bean Casserole"],
      ["4/4", "Fried Shallots"],
    ]);
    expect(readings[2].data).toMatchObject({
      found: true,
      grounded: 6,
      total: 6,
      ingredients: 6,
      outputTokens: 400,
      tokPerSec: 40,
      gpu: 100,
    });
    /* The picture is probed once for the four (T51). */
    expect(ends.at(-1)?.data).toMatchObject({ mode: "head", status: 200 });
    /* The split's notes, and one `ground` note per reading. */
    const notes = lines.filter((line) => line.phase === "note");
    expect(
      notes.filter((line) => line.step === "split").map((line) => line.data),
    ).toEqual([
      { gate: true, blocks: 4 },
      expect.objectContaining({ slices: expect.any(Array) }),
      { kept: [1, 2, 3, 4] },
    ]);
    expect(
      notes
        .filter((line) => line.step === "ground")
        .map((line) => line.data?.outcome),
    ).toEqual(["trusted", "trusted", "trusted", "trusted"]);
    /* All on the GPU: no placement warning. */
    expect(notes.some((line) => line.step === "llm.placement")).toBe(false);
    /* No page or model text in the log: lengths only. */
    expect(JSON.stringify(lines)).not.toContain("white bread");
  });

  it("warns when the model sits mostly on the CPU, and the job's result says so", async () => {
    stubWithPlacement(2);
    const text = await description();
    const { result, job } = await runJob(
      { kind: "import-text", label: "x", spec: {} },
      (job) =>
        importFromText(ctx, { text, pick: ["Stuffing"], dryRun: true }, job),
      { mirror: null },
    );
    const warning =
      'local model qwen3:8b ran 2% on the GPU — another program holds VRAM, and the rest runs on the CPU, many times slower; run "ollama stop qwen3:8b" once it frees';
    /* Once, however many calls saw it. */
    expect(result.warnings?.filter((entry) => entry === warning)).toHaveLength(
      1,
    );
    /* A pick was given: the found list says what was taken (37a review). */
    expect(result.warnings?.join("\n")).not.toMatch(/pick the ones/);
    expect(result.warnings).toContainEqual(
      expect.stringMatching(/found 4 recipes .* — picked \d+\. Stuffing$/),
    );
    const { lines } = await readJobLog(process.env.RECIPE_JOBS_DIR!, job);
    const placements = lines.filter((line) => line.step === "llm.placement");
    /* One per call: the list, the question, four readings. */
    expect(placements).toHaveLength(6);
    expect(placements[0]).toMatchObject({
      phase: "note",
      level: "warn",
      msg: '2% GPU — another program holds VRAM; run "ollama stop qwen3:8b" once it frees',
      data: { model: "qwen3:8b", gpu: 2 },
    });
    expect(
      lines.find((line) => line.step === "llm.list" && line.phase === "end")
        ?.data,
    ).toMatchObject({ gpu: 2 });
  });

  it("a cancel during a pick's image download ends the batch: nothing written after it, the job cancelled", async () => {
    stub();
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input) !== THUMB || init?.method === "HEAD") {
          return inner(input, init);
        }
        /* The first image GET: cancel the job while it is in flight. */
        const signal = init?.signal;
        const [id] = runningJobIds();
        cancelJob(id, new Error("cancelled by a person"));
        return new Promise<Response>((_, reject) => {
          if (signal?.aborted) return reject(signal.reason);
          signal?.addEventListener("abort", () => reject(signal.reason));
        });
      }),
    );
    let jobId = "";
    const error = await runJob(
      { kind: "import-url", label: "x", spec: {} },
      (job) => {
        jobId = job.jobId!;
        return importAndCreate(ctx, VIDEO_URL, { all: true }, job);
      },
      { mirror: null },
    ).catch((caught) => caught);
    expect((error as Error).message).toBe("cancelled by a person");
    /* No pick was written: the image was not skipped and the write gone on. */
    expect(await messages(1)).toEqual(["Initial commit"]);
    expect(
      await readJobMeta(process.env.RECIPE_JOBS_DIR!, jobId),
    ).toMatchObject({
      status: "cancelled",
      error: { code: "cancelled", message: "cancelled by a person" },
    });
  });

  it("an /api/ps that fails is a note, never a failure", async () => {
    stub();
    const inner = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) =>
        String(input).endsWith("/api/ps")
          ? Promise.reject(new Error("connection refused"))
          : inner(input, init),
      ),
    );
    const { log, lines } = memoryJobLog();
    const dry = asBatch(
      await importFromText(
        ctx,
        { text: await description(), dryRun: true },
        { log },
      ),
    );
    expect(dry.found).toHaveLength(4);
    expect(dry.warnings?.join(" ")).not.toMatch(/GPU/);
    const notes = lines.filter((line) => line.step === "llm.placement");
    expect(notes[0]).toMatchObject({
      phase: "note",
      level: "info",
      msg: "could not read /api/ps: connection refused",
    });
    expect(
      lines.filter((line) => line.phase === "end").every((line) => line.ok),
    ).toBe(true);
  });
});
