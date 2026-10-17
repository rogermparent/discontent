/*
 * Epic 40, 40d — what each term-cloud read costs on a cache miss.
 *
 *   CONTENT_DIRECTORY=/path/to/a/copy NODE_ENV=production RUNS=9 \
 *     pnpm exec tsx ./scripts/measure-term-clouds.ts
 *
 * A "cloud" is a read of the whole tag vocabulary with counts. The editor
 * serves each one through `unstable_cache`, so a reader pays this cost only
 * when the entry is missing: the first request after a start, or the first
 * after a write fired one of its tags. This script times exactly that miss:
 * the same aggregate reads and the same pure join as each function in
 * `common/controller/data/readTermPage.ts`, without the Next cache around
 * them (which needs a request context).
 *
 * - **warm**: one process, the LMDB environments already open (what a
 *   running server pays on a miss). One untimed call first, then `RUNS`.
 * - **cold**: a fresh child process per run, timing the first call alone
 *   (environment opens included — what the first request after a start pays).
 *
 * Min leads, as in `measure-reindex.ts`. Bytes are `JSON.stringify` of the
 * result, the size `unstable_cache` stores and an RSC payload roughly carries.
 *
 * Read-only: aggregate reads never create an environment (F30). It refuses
 * the editor's own `content` symlink all the same.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { realpath } from "fs-extra";
import { readAggregate } from "@discontent/cms/aggregates/readAggregate";
import {
  readTaxonomyByTerm,
  readTaxonomyByTermEntry,
  readTaxonomyTerms,
} from "@discontent/cms/taxonomies/read";
import { termTreeAggregate } from "@discontent/cms/taxonomies/tree";
import { groupContentConfig } from "recipe-website-common/controller/groupContentConfig";
import { groupTagTaxonomy } from "recipe-website-common/controller/groupTagTaxonomy";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "recipe-website-common/controller/recipeTagTaxonomy";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";
import {
  mergeTagVocabulary,
  tagOptions,
  termBoard,
  termCarriers,
  vocabularyOfRows,
} from "recipe-website-common/controller/tagVocabulary";

function sources(contentDirectory: string) {
  const recipe = { config: recipeContentConfig, contentDirectory };
  const group = { config: groupContentConfig, contentDirectory };
  return {
    recipeTerms: () =>
      readTaxonomyTerms({ ...recipe, taxonomy: recipeTagTaxonomy }),
    groupTerms: () =>
      readTaxonomyTerms({ ...group, taxonomy: groupTagTaxonomy }),
    recipeByTerm: () =>
      readTaxonomyByTerm({ ...recipe, taxonomy: recipeTagTaxonomy }),
    groupByTerm: () =>
      readTaxonomyByTerm({ ...group, taxonomy: groupTagTaxonomy }),
    recipeKey: (slug: string) =>
      readTaxonomyByTermEntry({ ...recipe, taxonomy: recipeTagTaxonomy, slug }),
    tree: () =>
      readAggregate({
        config: tagTermContentConfig,
        aggregateConfig: termTreeAggregate(),
        contentDirectory,
      }),
  };
}

/** Each cloud, as `readTermPage.ts` composes it, minus the cache. */
function clouds(contentDirectory: string) {
  const s = sources(contentDirectory);
  const vocabulary = async () => {
    const [recipeTerms, groupTerms, tree] = await Promise.all([
      s.recipeTerms(),
      s.groupTerms(),
      s.tree(),
    ]);
    return {
      vocabulary: mergeTagVocabulary({ recipeTerms, groupTerms, tree }),
      tree,
    };
  };
  return {
    /* The parts, for scale. */
    "recipes:tags": s.recipeTerms,
    "groups:tags": s.groupTerms,
    "tag-terms:tree": s.tree,
    "recipes:by-tag (whole)": s.recipeByTerm,
    "recipes:by-tag[drink]": () => s.recipeKey("drink"),
    /* `/tags`' list, `/new-recipe`. */
    readTagVocabulary: async () => (await vocabulary()).vocabulary,
    /* `/tags`' board and the homepage. */
    readTagBoard: async () => {
      const [byRecipeTag, byGroupTag, tree] = await Promise.all([
        s.recipeByTerm(),
        s.groupByTerm(),
        s.tree(),
      ]);
      const counts = new Map(
        vocabularyOfRows({
          recipeRows: byRecipeTag,
          groupRows: byGroupTag,
          tree,
        }).map((entry) => [entry.slug, entry]),
      );
      return termBoard(
        tree,
        counts,
        termCarriers(tree, byRecipeTag, byGroupTag),
      );
    },
    /* The recipe and group forms' suggestions. */
    readTagLabels: async () =>
      (await vocabulary()).vocabulary
        .filter((entry) => entry.count > 0)
        .map((entry) => entry.label),
    /* `/make`. */
    readTagOptions: async () => {
      const { vocabulary: v, tree } = await vocabulary();
      return tagOptions(v, tree);
    },
    /* `/search/terms`: autocomplete, ⌘K, the tag rail, BrowseChips. */
    readSearchTerms: async () => {
      const { vocabulary: v, tree } = await vocabulary();
      return tagOptions(v, tree).map((option, index) => ({
        ...option,
        count: v[index].count,
      }));
    },
  } satisfies Record<string, () => Promise<unknown>>;
}

type CloudName = keyof ReturnType<typeof clouds>;

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const ms = (value: number) => value.toFixed(2).padStart(8);

async function timeOnce(fn: () => Promise<unknown>) {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

async function main() {
  const configured = process.env.CONTENT_DIRECTORY;
  if (!configured) throw new Error("set CONTENT_DIRECTORY to a copy");
  const contentDirectory = await realpath(resolve(configured));
  const live = await realpath(resolve(__dirname, "..", "content")).catch(
    () => undefined,
  );
  if (live && live === contentDirectory) {
    throw new Error("refusing the editor's own content directory");
  }
  const table = clouds(contentDirectory);

  /* A child: time one cloud's first call and report it. */
  const only = process.env.MEASURE_CLOUD as CloudName | undefined;
  if (only) {
    const { ms: first } = await timeOnce(table[only]);
    process.stdout.write(JSON.stringify({ ms: first }));
    return;
  }

  const runs = Number(process.env.RUNS ?? 9);
  console.log(`content directory: ${contentDirectory}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV ?? "(unset)"}, runs: ${runs}`);
  console.log(
    `\n${"cloud".padEnd(24)} ${"bytes".padStart(8)} ${"cold min".padStart(8)} ${"cold med".padStart(8)} ${"warm min".padStart(8)} ${"warm med".padStart(8)}`,
  );
  for (const name of Object.keys(table) as CloudName[]) {
    const cold: number[] = [];
    for (let run = 0; run < runs; run += 1) {
      const child = spawnSync(
        process.execPath,
        [...process.execArgv, __filename],
        { env: { ...process.env, MEASURE_CLOUD: name }, encoding: "utf8" },
      );
      if (child.status !== 0) throw new Error(child.stderr);
      cold.push(JSON.parse(child.stdout).ms);
    }
    const { value } = await timeOnce(table[name]);
    const warm: number[] = [];
    for (let run = 0; run < runs; run += 1) {
      warm.push((await timeOnce(table[name])).ms);
    }
    const bytes = Buffer.byteLength(JSON.stringify(value ?? null));
    console.log(
      `${name.padEnd(24)} ${String(bytes).padStart(8)} ${ms(Math.min(...cold))} ${ms(median(cold))} ${ms(Math.min(...warm))} ${ms(median(warm))}`,
    );
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
