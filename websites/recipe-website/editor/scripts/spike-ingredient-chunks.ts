/*
 * F4b spike — does chunking `/search/ingredients` actually save a re-download?
 *
 *   CONTENT_DIRECTORY=/path/to/scratch/corpus PER_PAGE=50 SCENARIO=append \
 *     pnpm exec tsx ./scripts/spike-ingredient-chunks.ts
 *
 * Builds a real pagination keyspace over the ingredients projection, records
 * every chunk's bytes and hash, performs one write, rebuilds, and reports which
 * chunks moved. No engine change: the config below is declared here and thrown
 * away, so nothing on disk outside the scratch corpus is touched.
 *
 * `SCENARIO` is `append` (newest), `edit` (one recipe mid-corpus) or `backdate`
 * (oldest, i.e. at the anchored end). Measuring only `append` answers the
 * question the optimistic way — see §12.10, where `backdate` dirties every
 * chunk and the other two dirty one.
 *
 * **Give each run a fresh copy of the corpus.** A second run against the same
 * directory compares an already-written corpus with itself and reports that
 * nothing moved, which reads exactly like a result.
 *
 * Point it at a scratch copy. Opening an index creates it (§10).
 */
import { createHash } from "node:crypto";
import { readPage } from "@discontent/cms/pagination/readPage";
import { updatePaginationIndexes } from "@discontent/cms/pagination/updatePaginationIndexes";
import {
  writeToIndex,
  getContentDatabase,
} from "@discontent/cms/content/database";
import type { PaginationIndexConfig } from "@discontent/cms/pagination/types";
import recipeContentConfig from "recipe-website-common/controller/recipeContentConfig";
import type {
  RecipeEntryKey,
  RecipeEntryValue,
} from "recipe-website-common/controller/types";

const contentDirectory = process.env.CONTENT_DIRECTORY;
if (!contentDirectory) throw new Error("set CONTENT_DIRECTORY");

const PER_PAGE = Number(process.env.PER_PAGE || 50);

interface IngredientsEntry {
  slug: string;
  ingredients: string[];
}

const ingredientsChunks: PaginationIndexConfig<
  RecipeEntryValue,
  RecipeEntryKey,
  IngredientsEntry
> = {
  name: "spike-ingredients",
  perPage: PER_PAGE,
  version: "1",
  key: ({ key: [date], id }) => [date, id],
  /*
   * The route drops recipes with no ingredients, so the chunked index has to
   * as well — which is exactly what makes `total` diverge from the recipe
   * count, and what `version` would have to cover.
   */
  filter: ({ value }) => !!value.ingredients?.length,
  project: ({ value, id }) => ({
    slug: id,
    ingredients: value.ingredients ?? [],
  }),
};

const config = {
  ...recipeContentConfig,
  paginationIndexes: [ingredientsChunks],
} as typeof recipeContentConfig;

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

async function snapshot() {
  const chunks: { page: number; items: number; bytes: number; hash: string }[] =
    [];
  // Walk from page 0 up to and including the head.
  for (let page = 0; ; page += 1) {
    const result = await readPage({
      config,
      paginationConfig: ingredientsChunks,
      contentDirectory,
      pageIndex: page,
    });
    if (!result) break;
    chunks.push({
      page,
      items: result.items.length,
      bytes: Buffer.byteLength(JSON.stringify(result.items)),
      hash: hash(result.items),
    });
    if (page >= result.headPage) break;
  }
  return chunks;
}

async function rebuild() {
  return updatePaginationIndexes({ config, contentDirectory, force: true });
}

function report(label: string, chunks: Awaited<ReturnType<typeof snapshot>>) {
  const total = chunks.reduce((sum, c) => sum + c.bytes, 0);
  console.log(`\n${label} — ${chunks.length} chunks, ${total} B total`);
  for (const c of chunks) {
    console.log(
      `  page ${String(c.page).padStart(2)}: ${String(c.items).padStart(3)} items  ${String(c.bytes).padStart(7)} B  ${c.hash}`,
    );
  }
  return { total, chunks };
}

async function main() {
  const [results] = await rebuild();
  console.log(
    `perPage ${PER_PAGE} — total ${results.total}, headPage ${results.headPage}`,
  );
  const before = report("BEFORE", await snapshot());

  const db = getContentDatabase<RecipeEntryValue, RecipeEntryKey>(
    recipeContentConfig,
    contentDirectory,
  );

  /*
   * Three writes, not one. "Append" is the case the stable-end anchoring is
   * designed to make cheap, so measuring only that answers the question the
   * optimistic way.
   */
  const scenario = process.env.SCENARIO || "append";
  if (scenario === "append") {
    // Newest — the ordinary case.
    await writeToIndex(
      db,
      [
        Date.parse("2030-01-01T00:00:00Z"),
        "spike-appended-recipe",
      ] as RecipeEntryKey,
      {
        name: "Spike Appended Recipe",
        ingredients: ["1 spike", "2 cups measurement"],
      } as RecipeEntryValue,
    );
  } else if (scenario === "edit") {
    // Edit one existing recipe's ingredients, mid-corpus.
    const entries = [...db.getRange({})];
    const middle = entries[Math.floor(entries.length / 2)];
    const [date, id] = middle.key as RecipeEntryKey;
    await writeToIndex(
      db,
      [date, id] as RecipeEntryKey,
      {
        ...(middle.value as RecipeEntryValue),
        ingredients: ["1 edited ingredient"],
      } as RecipeEntryValue,
    );
  } else if (scenario === "backdate") {
    // Insert at the *oldest* end, which is the anchored one.
    await writeToIndex(
      db,
      [
        Date.parse("1990-01-01T00:00:00Z"),
        "spike-backdated-recipe",
      ] as RecipeEntryKey,
      {
        name: "Spike Backdated Recipe",
        ingredients: ["1 spike", "2 cups measurement"],
      } as RecipeEntryValue,
    );
  }

  await rebuild();
  const after = report(`AFTER one ${scenario}`, await snapshot());

  const moved = after.chunks.filter(
    (c) => before.chunks[c.page]?.hash !== c.hash,
  );
  const movedBytes = moved.reduce((sum, c) => sum + c.bytes, 0);
  console.log(
    `\nchunks moved: ${moved.map((c) => c.page).join(", ") || "none"} (${moved.length} of ${after.chunks.length})`,
  );
  console.log(
    `re-download after one ${scenario}: ${movedBytes} B chunked vs ${after.total} B whole — ${((movedBytes / after.total) * 100).toFixed(1)}%`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
