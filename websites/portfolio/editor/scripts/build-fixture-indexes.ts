/*
 * Bring every Playwright content fixture's derived indexes into step.
 *
 *   pnpm tsx scripts/build-fixture-indexes.ts
 *
 * Portfolio's first (F21c). It was a no-op when it was written — neither
 * `projects` nor `pages` declared a pagination index or an aggregate, so every
 * fixture was already current — and that is exactly why it existed then rather
 * than later.
 *
 * Without it, the PR that gave `projects` an index would have left every
 * captured fixture serving an empty list, with **nothing going red**: a read
 * does not self-heal what it finds, and an absent index is indistinguishable
 * from an empty corpus. Recipe learned that the expensive way, which is what
 * `rebuildFixtureIndexes` documents. Having the script in place first meant
 * F29 was a config line and a run of this — which is now what it does: the
 * `projects` fixture's `projects/pagination/by-date` environment is written
 * here and nowhere else.
 */
import { resolve } from "node:path";
import { rebuildFixtureIndexes } from "@discontent/cms/content/rebuildFixtureIndexes";
import { portfolioContentTypes } from "../controller/contentTypes";

rebuildFixtureIndexes({
  configs: portfolioContentTypes,
  fixturesDir: resolve(
    __dirname,
    "..",
    "playwright",
    "fixtures",
    "test-content",
  ),
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
