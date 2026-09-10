/*
 * F28 — what one ordinary write costs the engine, as the corpus grows.
 *
 *   CONTENT_DIRECTORY=/path/to/seeded/corpus SCENARIO=append \
 *     pnpm exec tsx ./scripts/measure-engine-scale.ts
 *
 * Point it at a corpus made by `seed-scale-corpus.ts`. Sibling of
 * `measure-search-corpus.ts`, `measure-description-cap.ts` and
 * `measure-corpus-caching.ts`; like `spike-ingredient-chunks.ts` it stays out of
 * `playwright/tests/` so a slow host cannot turn the 416 gate into noise.
 *
 * **Three deferrals in §11 are written against events nobody has quantified**
 * — F12 ("worth doing only if the full walk shows up in a profile"), F18 ("a
 * corpus large enough to make a create visibly slow") and F8b ("no tag in the
 * corpus is close to `perPage`"). This script gives each of them a number. One
 * ordinary write costs **three full passes**: two O(N) in the corpus and one
 * O(D) in the dependent corpus.
 *
 * **The two passes are called separately, not through `syncPaginationItems`.**
 * That helper runs `updatePaginationIndexes` then `updateAggregates` in sequence
 * (`syncContentItems.ts:87,95`), so calling them individually attributes the
 * cost to the right pass and still sums to a real write's derived-state cost.
 * Phase 1 is replicated here from the same helper's transaction rather than
 * skipped: without it the new item is not in the SORTED keyspace, and phase 2
 * would have to be `force`d — which measures the *rebuild* path, not the walk.
 *
 * `SCENARIO` picks the write, and the five are not five flavours of the same
 * thing — they land on different sides of the dependent pass's gate:
 *
 *  - `append`    a create at the newest end. **Opens the dependent gate**:
 *                `hashValue(undefined) !== hashValue(name)`, which is F18's
 *                "now runs on creates". Scans D and finds nothing, because
 *                nothing references a slug that did not exist.
 *  - `backdate`  a create at the *anchored* end (§3.1), where every position
 *                after it moves. Same gate behaviour as `append`.
 *  - `edit`      one recipe mid-corpus, `description` only. **Gate closed** —
 *                `borrowedFieldsOf(recipeContentConfig)` is `["name","image"]`
 *                (`references.ts:233`) and `updateDependents:121` gates the
 *                whole pass on one of those moving, so an ingredients or
 *                description edit opens nothing and costs zero. It is also not
 *                projected, so phase 2 walks N and dirties no page: the purest
 *                reading of the walk on its own.
 *  - `name-edit` `name` on a recipe some feature points at. Gate open, the key
 *                does not move, dependents' index entries are rewritten.
 *  - `rename`    the same recipe under a new slug. Gate open via `renamed`,
 *                and the one scenario that rewrites dependents' *data files*.
 *
 * **Counters lead and milliseconds follow**, with `loadavg` recorded on both
 * sides — F27's precedent, where the bytes answer was load-independent and the
 * timings were not. Both O(N) passes are therefore also run `RUNS` times (5)
 * with nothing written in between, before the write and again after it, and the
 * reported cost is the **minimum**: a pass is a fixed amount of work with no
 * randomness in it, so every run above the minimum is interference from whatever
 * else the host is doing. All the samples are printed, because a wide spread is
 * the signal that only the minimum is worth reading.
 *
 * Every counter comes from a value the engine already returns, except one:
 *
 *  - items walked (phase 2)   `updatePaginationIndex`'s returned `total`
 *  - items folded (aggregate) `AggregateUpdateResult.total`
 *  - `PAGED` keys written     wraps `db.put`, `test/pagination.test.ts:280-285`
 *  - `.asArray` load (D)      the featured **content** index's key count
 *
 * The last one is a counted D plus a code fact — `updateDependents:317` calls
 * `.asArray` on the whole range — not an interception. `getRange` is
 * deliberately **not** wrapped: LMDB hands back an `ArrayLikeIterable` carrying
 * `.asArray`, `.map` and `.filter`, so a wrapper would have to reproduce that
 * surface and would end up measuring itself. The load is timed instead by
 * calling `.asArray` on the same index directly, which is a sibling
 * measurement of the same work rather than a reading of the engine's own call.
 *
 * **Writes to the corpus it is pointed at.** It performs a real write and runs
 * real derived-state passes, so give every run its own freshly seeded directory
 * — the seeder enforces that — and never point it at `~/Projects/recipe-content`.
 * Opening an index creates it (§10); `git status` after every run.
 */
import { loadavg } from "node:os";
import {
  getAggregateDatabase,
  readAggregateRecord,
} from "@discontent/cms/aggregates/database";
import { updateAggregates } from "@discontent/cms/aggregates/updateAggregates";
import {
  getContentDatabase,
  removeFromIndex,
  writeToIndex,
} from "@discontent/cms/content/database";
import {
  readContentFromFilesystem,
  writeContentToFilesystem,
} from "@discontent/cms/content/filesystem";
import { createReferenceResolver } from "@discontent/cms/content/references";
import { updateDependents } from "@discontent/cms/content/updateDependents";
import {
  PAGED,
  SORTED,
  getPaginationDatabase,
} from "@discontent/cms/pagination/database";
import { updatePaginationIndexes } from "@discontent/cms/pagination/updatePaginationIndexes";
import { writeSortedEntryTo } from "@discontent/cms/pagination/writeSortedEntry";
import buildRecipeIndexValue from "recipe-website-common/controller/buildIndexValue";
import { recipesByTag } from "recipe-website-common/controller/aggregateConfigs";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import { recipesByDate } from "recipe-website-common/controller/paginationConfigs";
import recipeContentConfig from "recipe-website-common/controller/recipeContentConfig";
import type { TagIndexEntry } from "recipe-website-common/controller/aggregateConfigs";
import type {
  FeaturedRecipeEntryKey,
  FeaturedRecipeEntryValue,
  Recipe,
  RecipeEntryKey,
  RecipeEntryValue,
} from "recipe-website-common/controller/types";

/*
 * Read as a required `string` rather than narrowed in place: two of the seats
 * below take a non-optional `contentDirectory`, and a module-level narrowing
 * does not survive into the functions that use it.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`set ${name}`);
  return value;
}

const contentDirectory = requireEnv("CONTENT_DIRECTORY");

const SCENARIO = process.env.SCENARIO || "append";
const SCENARIOS = ["append", "backdate", "edit", "name-edit", "rename"];
if (!SCENARIOS.includes(SCENARIO)) {
  throw new Error(`SCENARIO must be one of ${SCENARIOS.join(", ")}`);
}

const recipeDb = getContentDatabase<RecipeEntryValue, RecipeEntryKey>(
  recipeContentConfig,
  contentDirectory,
);
const paginationDb = getPaginationDatabase(
  recipeContentConfig,
  recipesByDate,
  contentDirectory,
);

/** Repetitions of each no-op pass. The minimum of them is the reported cost. */
const RUNS = Number(process.env.RUNS || 5);

const ms = (value: number) => value.toFixed(1).padStart(9);
const pad = (value: string, width: number) => value.padEnd(width);
const num = (value: number | string, width = 8) =>
  String(value).padStart(width);

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const started = performance.now();
  const result = await fn();
  return [result, performance.now() - started];
}

/**
 * Counts the keys one pass writes into a given keyspace, by the technique
 * `test/pagination.test.ts` already uses on itself. Restores `put` in a
 * `finally`, because the environment is process-cached (F1) and a leaked
 * wrapper would be counting for every later pass too.
 */
async function countingPuts<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { put: any },
  prefix: number,
  fn: () => Promise<T>,
): Promise<[T, number]> {
  const original = db.put.bind(db);
  let writes = 0;
  db.put = (key: unknown, value: unknown) => {
    if (Array.isArray(key) && key[0] === prefix) writes += 1;
    return original(key, value);
  };
  try {
    return [await fn(), writes];
  } finally {
    db.put = original;
  }
}

/**
 * Both O(N) passes, `RUNS` times, with nothing written in between — so every
 * run does identical work and the spread between them is host noise.
 */
async function timeRepeatedly() {
  const pagination: number[] = [];
  const aggregate: number[] = [];
  let total = 0;
  for (let run = 0; run < RUNS; run += 1) {
    const [results, elapsed] = await timed(runPagination);
    pagination.push(elapsed);
    total = results[0]?.total ?? 0;
    const [, aggregateElapsed] = await timed(runAggregates);
    aggregate.push(aggregateElapsed);
  }
  return { pagination, aggregate, total };
}

function reportRepeated(label: string, samples: number[]) {
  const min = Math.min(...samples);
  console.log(
    `  ${pad(label, 26)} ${ms(min)}  ${samples.map((value) => value.toFixed(1)).join(" ")}`,
  );
}

const runPagination = () =>
  updatePaginationIndexes({ config: recipeContentConfig, contentDirectory });
const runAggregates = () =>
  updateAggregates({ config: recipeContentConfig, contentDirectory });

/** Every recipe index entry, ascending by `[date, slug]` — so also by age. */
const recipeEntries = () =>
  [...recipeDb.getRange({})] as {
    key: RecipeEntryKey;
    value: RecipeEntryValue;
  }[];

/** The dependent index the scan walks — `featured-recipes`, keyed `[date, slug]`. */
const featuredDatabase = () =>
  getContentDatabase<FeaturedRecipeEntryValue, FeaturedRecipeEntryKey>(
    featuredRecipeContentConfig,
    contentDirectory,
  );

/**
 * D, counted rather than intercepted: the number of entries
 * `updateDependents`'s `.asArray` materializes is the featured content index's
 * key count, because the scan reads the whole range unfiltered.
 */
async function featuredCount(): Promise<number> {
  try {
    return (await featuredDatabase().getKeys({}).asArray).length;
  } catch {
    /* No featured index means no dependents, which is a D of zero. */
    return 0;
  }
}

/**
 * The recipe slug a mid-corpus feature points at, for the two scenarios that
 * open the dependent gate *and* should find something. Falls back to the
 * mid-corpus recipe when the corpus carries no features, where the scan's cost
 * is the whole answer anyway.
 */
async function targetSlug(entries: { key: RecipeEntryKey }[]): Promise<string> {
  const middle = String(entries[Math.floor(entries.length / 2)].key[1]);
  if (SCENARIO !== "name-edit" && SCENARIO !== "rename") return middle;
  try {
    const features = await featuredDatabase().getRange({}).asArray;
    if (features.length === 0) return middle;
    return features[Math.floor(features.length / 2)].value.recipe || middle;
  } catch {
    return middle;
  }
}

interface WriteDescription {
  /** Slug after the write. */
  slug: string;
  /** Slug before it, when this write renamed. */
  previousSlug?: string;
  previousData?: Recipe;
  data: Recipe;
  /** Sorted-entry writes phase 1 made, for the phase-1 row. */
  sortedWrites: number;
  /** Whether the item's content index key moved. */
  keyMoved: boolean;
}

/**
 * The content-index half of a write, plus phase 1 — exactly what
 * `updateContent.ts:181-194` and `syncContentItems.ts:71-83` do between them,
 * with nothing in front of the two passes this script is here to time.
 */
async function performWrite(
  entries: { key: RecipeEntryKey; value: RecipeEntryValue }[],
): Promise<WriteDescription> {
  const newest = entries[entries.length - 1];
  const oldest = entries[0];

  if (SCENARIO === "append" || SCENARIO === "backdate") {
    /*
     * A create, built from a real recipe rather than filler, so its index value
     * has the corpus's own shape. `backdate` goes in at the anchored end, where
     * §3.1's guarantee does not hold and every later position moves.
     */
    const template = (await readContentFromFilesystem<Recipe>(
      recipeContentConfig,
      String(newest.key[1]),
      contentDirectory,
    )) as Recipe;
    const slug = `measure-${SCENARIO}`;
    const date =
      SCENARIO === "append"
        ? Number(newest.key[0]) + 60 * 60 * 1000
        : Number(oldest.key[0]) - 60 * 60 * 1000;
    const data: Recipe = { ...template, name: `Measure ${SCENARIO}`, date };
    const key: RecipeEntryKey = [date, slug];
    const value = buildRecipeIndexValue(data);

    await writeContentToFilesystem(
      recipeContentConfig,
      slug,
      data,
      contentDirectory,
    );
    await writeToIndex(recipeDb, key, value);
    const [, sortedWrites] = await countingPuts(paginationDb, SORTED, () =>
      paginationDb.transaction(() => {
        writeSortedEntryTo(paginationDb, recipesByDate, slug, { key, value });
      }),
    );
    return { slug, data, sortedWrites, keyMoved: false };
  }

  const slug = await targetSlug(entries);
  const previousData = (await readContentFromFilesystem<Recipe>(
    recipeContentConfig,
    slug,
    contentDirectory,
  )) as Recipe;
  const oldKey = recipeContentConfig.buildIndexKey(slug, previousData);

  if (SCENARIO === "edit") {
    /*
     * `description`: in the index value, in neither `borrowedFieldsOf` nor
     * `recipesByDate.project`. So the dependent gate stays shut and no page
     * goes dirty — the walk with nothing else attached to it.
     */
    const data: Recipe = {
      ...previousData,
      description: `Edited by measure-engine-scale at position ${Math.floor(entries.length / 2)}.`,
    };
    const value = buildRecipeIndexValue(data);
    await writeContentToFilesystem(
      recipeContentConfig,
      slug,
      data,
      contentDirectory,
    );
    await writeToIndex(recipeDb, oldKey, value);
    const [, sortedWrites] = await countingPuts(paginationDb, SORTED, () =>
      paginationDb.transaction(() => {
        writeSortedEntryTo(paginationDb, recipesByDate, slug, {
          key: oldKey,
          value,
        });
      }),
    );
    return { slug, previousData, data, sortedWrites, keyMoved: false };
  }

  if (SCENARIO === "name-edit") {
    /* `name` is borrowed, so this is the cheapest write that opens the gate. */
    const data: Recipe = {
      ...previousData,
      name: `${previousData.name} (renamed field)`,
    };
    const value = buildRecipeIndexValue(data);
    await writeContentToFilesystem(
      recipeContentConfig,
      slug,
      data,
      contentDirectory,
    );
    await writeToIndex(recipeDb, oldKey, value);
    const [, sortedWrites] = await countingPuts(paginationDb, SORTED, () =>
      paginationDb.transaction(() => {
        writeSortedEntryTo(paginationDb, recipesByDate, slug, {
          key: oldKey,
          value,
        });
      }),
    );
    return { slug, previousData, data, sortedWrites, keyMoved: false };
  }

  /*
   * `rename`. The slug *is* the id, so this is a delete plus an insert in both
   * keyspaces — and phase 1 must remove the old sorted entry first, or the walk
   * counts the item twice (`syncContentItems.ts:74-80`).
   */
  const newSlug = `${slug}-renamed`;
  const data: Recipe = { ...previousData };
  const newKey = recipeContentConfig.buildIndexKey(newSlug, data);
  const value = buildRecipeIndexValue(data);

  await writeContentToFilesystem(
    recipeContentConfig,
    newSlug,
    data,
    contentDirectory,
  );
  await removeFromIndex(recipeDb, oldKey);
  await writeToIndex(recipeDb, newKey, value);
  const [, sortedWrites] = await countingPuts(paginationDb, SORTED, () =>
    paginationDb.transaction(() => {
      writeSortedEntryTo(paginationDb, recipesByDate, slug);
      writeSortedEntryTo(paginationDb, recipesByDate, newSlug, {
        key: newKey,
        value,
      });
    }),
  );
  return {
    slug: newSlug,
    previousSlug: slug,
    previousData,
    data,
    sortedWrites,
    keyMoved: true,
  };
}

/** F8b's number: what the single by-tag record holds at this corpus size. */
function reportByTag(perPage: number) {
  const db = getAggregateDatabase(
    recipeContentConfig,
    recipesByTag,
    contentDirectory,
  );
  const record = readAggregateRecord<Record<string, TagIndexEntry>>(db);
  if (!record) {
    console.log("\nF8b — no by-tag record");
    return;
  }
  const sizes = Object.entries(record.value).map(([slug, entry]) => ({
    slug,
    count: entry.recipes.length,
  }));
  sizes.sort((a, b) => b.count - a.count);
  const overflowing = sizes.filter((tag) => tag.count > perPage);
  console.log("\nF8b — the single by-tag aggregate at this corpus size");
  console.log(`  tags:            ${sizes.length}`);
  console.log(
    `  record bytes:    ${Buffer.byteLength(JSON.stringify(record.value))}`,
  );
  console.log(
    `  largest tag:     ${sizes[0]?.slug ?? "—"} with ${sizes[0]?.count ?? 0} recipes (perPage ${perPage})`,
  );
  console.log(
    `  over perPage:    ${overflowing.length}  ${overflowing
      .slice(0, 5)
      .map((tag) => `${tag.slug}=${tag.count}`)
      .join(" ")}`,
  );
}

async function main() {
  console.log(`CONTENT_DIRECTORY: ${contentDirectory}`);
  console.log(`SCENARIO:          ${SCENARIO}`);
  console.log(
    `loadavg before:    ${loadavg()
      .map((v) => v.toFixed(2))
      .join(" ")}`,
  );

  const before = recipeEntries();
  const D = await featuredCount();
  console.log(
    `corpus:            ${before.length} recipes, ${D} featured, perPage ${recipesByDate.perPage}`,
  );

  /*
   * A settle pass first, discarded. The seeder's `rebuildIndex` leaves the
   * index current, but a pass that turned out to rebuild would put its cost in
   * the first timed row and nothing would say so.
   */
  await runPagination();
  await runAggregates();

  /*
   * The floor, min-of-`RUNS`. **The minimum is the statistic, not the mean.**
   * A pass is a fixed amount of work with no randomness in it, so every run
   * above the minimum is interference from whatever else the host is doing —
   * and on a loaded machine the spread between the best and worst run of one
   * identical pass reaches 9x. The spread is printed anyway, because a wide one
   * is the signal that the minimum is the only row worth reading.
   */
  console.log(
    `\nno-op passes at N=${before.length} — no write, ${RUNS} runs (the floor)`,
  );
  console.log(`  ${pad("pass", 26)} ${num("min", 9)}  runs`);
  const noop = await timeRepeatedly();
  reportRepeated("phase 2 (pagination walk)", noop.pagination);
  reportRepeated("aggregate fold", noop.aggregate);
  console.log(`  ${pad("walked / folded", 26)} ${num(noop.total, 9)}`);

  const write = await performWrite(before);
  console.log(`\none ${SCENARIO} write — slug ${write.slug}`);
  console.log(`  ${pad("pass", 26)} ${num("ms", 9)}  counters`);
  console.log(
    `  ${pad("phase 1 (sorted entries)", 26)} ${num("—", 9)}  ${write.sortedWrites} SORTED keys written`,
  );

  /* Phase 2, then aggregates: the order `syncPaginationItems` runs them in. */
  const [[paginationResults, pagedWrites], paginationMs] = await timed(
    async () => await countingPuts(paginationDb, PAGED, runPagination),
  );
  const pagination = paginationResults[0];
  console.log(
    `  ${pad("phase 2 (pagination walk)", 26)} ${ms(paginationMs)}  walked ${pagination.total}, ${pagedWrites} PAGED keys, dirty ${pagination.dirtyPages.length}, removed ${pagination.removedPages.length}, rebuilt ${pagination.rebuilt}`,
  );

  const [aggregateResults, aggregateMs] = await timed(runAggregates);
  console.log(
    `  ${pad("aggregate fold", 26)} ${ms(aggregateMs)}  folded ${aggregateResults[0]?.total ?? 0}, moved ${
      aggregateResults
        .filter((result) => result.changed)
        .map((result) => result.name)
        .join("+") || "none"
    }`,
  );

  /*
   * The dependent pass, called directly with a write-scoped resolver seeded the
   * way `updateContent.ts:207` seeds it — so the target's own data file is not
   * re-read, and the cost measured is the scan and the cascade rather than one
   * avoidable read.
   */
  const resolver = createReferenceResolver(contentDirectory);
  resolver.seed(recipeContentConfig.contentType, write.slug, write.data);
  const [dependentResult, dependentMs] = await timed(() =>
    updateDependents({
      config: recipeContentConfig,
      contentDirectory,
      slug: write.slug,
      previousSlug: write.previousSlug,
      previousData: write.previousData,
      data: write.data,
      resolver,
    }),
  );
  const dependent = dependentResult.dependents[0];
  console.log(
    `  ${pad("dependent pass (O(D))", 26)} ${ms(dependentMs)}  D=${D}, updated ${dependent?.updatedSlugs.length ?? 0}, files ${dependentResult.touchedPaths.length}, featured walked ${dependent?.pagination[0]?.total ?? 0}, featured dirty ${dependent?.pagination[0]?.dirtyPages.length ?? 0}`,
  );

  /*
   * The `.asArray` load on its own, timed by calling it directly on the same
   * index. A sibling measurement of the work `updateDependents:317` does, not a
   * reading of the engine's own call — nothing here wraps `getRange`.
   */
  if (D > 0) {
    const [loaded, asArrayMs] = await timed(
      () => featuredDatabase().getRange().asArray,
    );
    console.log(
      `  ${pad(".asArray over D (sibling)", 26)} ${ms(asArrayMs)}  ${loaded.length} entries materialized`,
    );
  }

  console.log(
    `\nderived state for one ${SCENARIO} write: ${(paginationMs + aggregateMs + dependentMs).toFixed(1)} ms across three passes`,
  );

  /*
   * The same floor again, now that the write has landed. Both O(N) passes are
   * no-ops from here, so this is the walk cost at the new N with the write's own
   * work removed — and it is min-of-`RUNS` where the row above is a single run.
   * The difference between the two is what the write itself added; where the row
   * above is *below* this floor, the pass simply caught a quieter moment and the
   * honest reading is that the write added nothing measurable.
   */
  console.log(
    `\nno-op passes at N=${pagination.total} — after the write, ${RUNS} runs`,
  );
  console.log(`  ${pad("pass", 26)} ${num("min", 9)}  runs`);
  const settled = await timeRepeatedly();
  reportRepeated("phase 2 (pagination walk)", settled.pagination);
  reportRepeated("aggregate fold", settled.aggregate);

  reportByTag(recipesByDate.perPage);
  console.log(
    `\nloadavg after:     ${loadavg()
      .map((v) => v.toFixed(2))
      .join(" ")}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
