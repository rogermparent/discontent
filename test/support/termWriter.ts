/**
 * One writer process for `test/concurrentWrites.test.ts` (epic 34, 34c).
 *
 * `tsx termWriter.ts <contentDirectory> <prefix> <count>` creates terms
 * `<prefix>-0` … `<prefix>-<count - 1>` through the site's real curation seat,
 * one after another, each its own commit, and prints one JSON line with the
 * per-write milliseconds. Not a test file (vitest only collects `*.test.*`).
 */
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { createTerm } from "../../websites/recipe-website/editor/controller/curation/terms";

async function main() {
  const [contentDirectory, prefix, count] = process.argv.slice(2);
  const ctx = {
    contentDirectory,
    author: { name: `Writer ${prefix}`, email: `${prefix}@test.local` },
  };
  const timings: number[] = [];
  for (let i = 0; i < Number(count); i++) {
    const started = Date.now();
    await createTerm(ctx, { label: `${prefix} ${i}`, slug: `${prefix}-${i}` });
    timings.push(Date.now() - started);
  }
  await closeCachedEnvironments();
  process.stdout.write(`${JSON.stringify({ prefix, timings })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
