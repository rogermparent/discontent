/*
 * Epic 29 — what a full reindex costs, without tsx startup in the number.
 *
 *   CONTENT_DIRECTORY=/path/to/a/copy RUNS=5 \
 *     pnpm exec tsx ./scripts/measure-reindex.ts
 *
 * Runs the real seat, `reindex({contentDirectory})`, `RUNS` times in one
 * process and reports the min and median of each type's timing (from
 * `ReindexResult.timings`), the peak `heapUsed` seen while it ran, and — from
 * the last run — how many commits each index environment took.
 *
 * **Commits are counted, not inferred.** Every content, pagination and
 * aggregate environment the registry declares is opened through the same cache
 * the engine uses, so wrapping a method on the handle here wraps the handle
 * the engine writes through (the spy `test/pagination.test.ts` uses). A `put`,
 * `remove` or `drop` made outside a transaction is its own commit; one inside
 * a `transaction` callback is not. That split is the whole of 29a: before it,
 * a rebuild was one synced commit per item.
 *
 * Min leads, as in `measure-engine-scale.ts`: a rebuild is a fixed amount of
 * work, so every run above the minimum is the host doing something else.
 *
 * **Writes to the directory it is pointed at** — it rebuilds every index there
 * and moves the index stamp. Point it at a copy (`git clone` of the content
 * repo, or `seed-scale-corpus.ts` output). It refuses the editor's own
 * `content` symlink.
 */
import { realpath } from "fs-extra";
import { resolve } from "node:path";
import type { RootDatabase } from "lmdb";
import { getAggregateDatabase } from "@discontent/cms/aggregates/database";
import { getContentDatabase } from "@discontent/cms/content/database";
import { getPaginationDatabase } from "@discontent/cms/pagination/database";
import { aggregatesOf } from "@discontent/cms/taxonomies/aggregates";
import { recipeContentTypes } from "../controller/contentTypes";
import { reindex } from "../controller/curation/reindex";

interface Counts {
  /** Writes outside a transaction — one commit each. */
  standalone: number;
  /** `transaction`/`transactionSync` calls at depth 0 — one commit each. */
  transactions: number;
  /** Writes made inside a transaction. */
  batched: number;
}

function newCounts(): Counts {
  return { standalone: 0, transactions: 0, batched: 0 };
}

const counts = new Map<string, Counts>();
let depth = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function spy(name: string, db: RootDatabase<any, any>) {
  if (counts.has(name)) return;
  counts.set(name, newCounts());
  const count = () => counts.get(name) as Counts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = db as any;
  for (const method of ["put", "remove", "drop"]) {
    const original = handle[method].bind(db);
    handle[method] = (...args: unknown[]) => {
      if (depth > 0) count().batched += 1;
      else count().standalone += 1;
      return original(...args);
    };
  }
  /*
   * Inside a transaction lmdb-js's `putSync`/`removeSync` go through `put` and
   * `remove`, which already counted them; outside one they commit alone.
   */
  for (const method of ["putSync", "removeSync"]) {
    const original = handle[method].bind(db);
    handle[method] = (...args: unknown[]) => {
      if (depth === 0) count().standalone += 1;
      return original(...args);
    };
  }
  for (const method of ["transaction", "transactionSync"]) {
    const original = handle[method].bind(db);
    handle[method] = (callback: () => unknown, ...rest: unknown[]) => {
      if (depth === 0) count().transactions += 1;
      return original(
        () => {
          depth += 1;
          try {
            return callback();
          } finally {
            depth -= 1;
          }
        },
        ...rest,
      );
    };
  }
}

function spyEverything(contentDirectory: string) {
  for (const config of recipeContentTypes) {
    spy(`${config.contentType}`, getContentDatabase(config, contentDirectory));
    for (const pagination of config.paginationIndexes ?? []) {
      spy(
        `${config.contentType}/pagination/${pagination.name}`,
        getPaginationDatabase(config, pagination, contentDirectory),
      );
    }
    for (const aggregate of aggregatesOf(config)) {
      spy(
        `${config.contentType}/aggregates/${aggregate.name}`,
        getAggregateDatabase(config, aggregate, contentDirectory),
      );
    }
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
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
  const runs = Number(process.env.RUNS ?? 5);

  spyEverything(contentDirectory);

  let peakHeap = process.memoryUsage().heapUsed;
  const sampler = setInterval(() => {
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  }, 5);

  const samples = new Map<string, number[]>();
  for (let run = 0; run < runs; run += 1) {
    for (const entry of counts.values()) Object.assign(entry, newCounts());
    const result = await reindex({ contentDirectory });
    for (const [key, ms] of Object.entries(result.timings ?? {})) {
      samples.set(key, [...(samples.get(key) ?? []), ms]);
    }
    console.log(`run ${run + 1}: ${JSON.stringify(result.timings)}`);
  }
  clearInterval(sampler);

  console.log(`\ncontent directory: ${contentDirectory}`);
  console.log(`runs: ${runs}`);
  console.log("\ntiming (ms)          min   median  samples");
  for (const [key, values] of samples) {
    console.log(
      `${key.padEnd(18)} ${String(Math.min(...values)).padStart(6)} ${String(
        median(values),
      ).padStart(8)}  ${values.join(" ")}`,
    );
  }
  console.log(`\npeak heapUsed: ${(peakHeap / 1024 / 1024).toFixed(1)} MiB`);

  console.log(
    "\ncommits, last run          standalone  transactions  batched writes",
  );
  let commits = 0;
  for (const [name, entry] of counts) {
    commits += entry.standalone + entry.transactions;
    console.log(
      `${name.padEnd(30)} ${String(entry.standalone).padStart(6)} ${String(
        entry.transactions,
      ).padStart(13)} ${String(entry.batched).padStart(15)}`,
    );
  }
  console.log(`total commits: ${commits}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
