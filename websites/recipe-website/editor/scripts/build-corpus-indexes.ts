/*
 * Phase 0 measurement harness — bring an arbitrary content directory's derived
 * indexes into step, the way `build-fixture-indexes.ts` does for the Playwright
 * fixtures. Same call, different directory: this one takes the fixtures-style
 * parent directory on argv so it can run against a scratch copy of the real
 * 436-recipe corpus, which is the corpus the §12 numbers need.
 *
 *   pnpm exec tsx ./scripts/build-corpus-indexes.ts /path/to/corpora
 *
 * `fixturesDir` is the *parent*: every immediate subdirectory of it is treated
 * as a content directory.
 */
import { rebuildFixtureIndexes } from "@discontent/cms/content/rebuildFixtureIndexes";
import { recipeContentTypes } from "../controller/contentTypes";

const fixturesDir = process.argv[2];
if (!fixturesDir) {
  console.error("usage: tsx ./scripts/build-corpus-indexes.ts <fixturesDir>");
  process.exit(1);
}

rebuildFixtureIndexes({ configs: recipeContentTypes, fixturesDir }).catch(
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
