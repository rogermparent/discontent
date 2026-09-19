// @vitest-environment node
//
// Reads config modules off disk as text. No LMDB here, but no DOM either.

import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import { hashValue } from "@discontent/cms/pagination/hash";

/*
 * The safety net that replaced hashing `fn.toString()` (F16).
 *
 * `computeSpecHash` and `computeAggregateSpecHash` used to fold the source text
 * of a config's functions into the spec hash, so editing a projection or a fold
 * invalidated every index built by the old one automatically. That was not
 * build-stable — a production build minifies those functions and a dev server
 * does not, so the same config hashed two ways and every cross-build read
 * rebuilt wholesale. Both hashes now cover the declared `version` and nothing
 * else.
 *
 * What that gives up is the automatic catch for "edited a projection, forgot to
 * bump `version`", which is a *staleness* footgun and strictly the worse of the
 * two. This test is the replacement: it pins a hash of each config module's
 * source text next to the versions declared in it, so any edit to any of them
 * fails CI until an author has looked at it.
 *
 * When this test fails:
 *   1. Did the edit change what a config's functions produce — the sort key, the
 *      projection, the filter, the fingerprint, the fold, the id? Then bump that
 *      config's `version` so every reader rebuilds.
 *   2. If it did not — a comment, a rename, a type-only change — the version
 *      stays as it is.
 *   3. Either way, re-run with `pnpm exec vitest run -u` to accept the new
 *      source hash, and make sure the diff shows the version change you meant.
 *
 * Deliberately whole-file rather than per-function: this test runs from a
 * repo-root vitest, where importing `recipe-website-common/*` would drag in
 * Next's module graph for nothing. Reading text costs no resolution at all. The
 * price is that a comment edit trips it too — over-triggering, which is the safe
 * direction, at a cost of one snapshot update.
 */

/**
 * Every version literal a module declares, in source order.
 *
 * Two spellings, because the engine has two kinds of declaration site. A config
 * object writes `version: "1"`; the taxonomy kind's *engine* half is a module
 * constant (`TAXONOMY_FOLD_VERSION = "1"`) that every site's stored spec
 * version is prefixed with, so an edit to the shared fold bumps one place
 * rather than every site. Both have to be visible here, or a module whose only
 * version is the constant would trip the "declares at least one" guard below
 * and could never be pinned at all.
 */
function declaredVersions(source: string): string[] {
  return [
    ...source.matchAll(/\bversion:\s*"([^"]*)"|VERSION\s*=\s*"([^"]*)"/g),
  ].map((match) => match[1] ?? match[2]);
}

/** Repo root, resolved from this file rather than from the runner's cwd. */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Line endings normalized, so a checkout with a different `core.autocrlf` does
 * not read as an edit.
 */
function readConfigModule(path: string): { versions: string[]; hash: string } {
  const source = readFileSync(resolve(ROOT, path), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  const versions = declaredVersions(source);
  expect(versions.length).toBeGreaterThan(0);
  return { versions, hash: hashValue(source).slice(0, 16) };
}

describe("declared spec versions", () => {
  it("recipe pagination configs", () => {
    expect(
      readConfigModule(
        "websites/recipe-website/common/controller/paginationConfigs.ts",
      ),
    ).toMatchInlineSnapshot(`
      {
        "hash": "33646aad81dd3ce3",
        "versions": [
          "1",
          "3",
        ],
      }
    `);
  });

  /*
   * Replaces the `aggregateConfigs.ts` block this test used to carry (24b). The
   * `recipeTags` / `recipesByTag` pair is gone; the site declares the
   * vocabulary and the engine derives both folds from it — under the same two
   * names, at a bumped version, because the terms value's *shape* moved from
   * `string[]` to `TaxonomyTerm[]`.
   */
  it("recipe tag taxonomy", () => {
    expect(
      readConfigModule(
        "websites/recipe-website/common/controller/recipeTagTaxonomy.ts",
      ),
    ).toMatchInlineSnapshot(`
      {
        "hash": "2e54f933941af602",
        "versions": [
          "2",
        ],
      }
    `);
  });

  it("group tag taxonomy", () => {
    expect(
      readConfigModule(
        "websites/recipe-website/common/controller/groupTagTaxonomy.ts",
      ),
    ).toMatchInlineSnapshot(`
      {
        "hash": "287df9893bac4e82",
        "versions": [
          "1",
        ],
      }
    `);
  });

  it("project tag taxonomy", () => {
    expect(
      readConfigModule(
        "packages/projects-collection/controller/projectTagTaxonomy.ts",
      ),
    ).toMatchInlineSnapshot(`
      {
        "hash": "53b3f8688ec0823d",
        "versions": [
          "1",
        ],
      }
    `);
  });

  /*
   * Groups get their own two blocks because they get their own two *modules*
   * (T1). Folding `groupsByDate` into `paginationConfigs.ts` would have moved
   * that file's hash, which is this test asking an author whether the recipe
   * configs needed a version bump — for an edit that could not possibly have
   * touched them.
   */
  it("group pagination config", () => {
    expect(
      readConfigModule(
        "websites/recipe-website/common/controller/groupPaginationConfig.ts",
      ),
    ).toMatchInlineSnapshot(`
      {
        "hash": "3e55db6867df4a9c",
        "versions": [
          "3",
        ],
      }
    `);
  });

  it("group aggregate configs", () => {
    expect(
      readConfigModule(
        "websites/recipe-website/common/controller/groupAggregateConfigs.ts",
      ),
    ).toMatchInlineSnapshot(`
      {
        "hash": "4e18dcbf088c3ff0",
        "versions": [
          "1",
          "1",
        ],
      }
    `);
  });

  it("project pagination configs", () => {
    expect(
      readConfigModule(
        "packages/projects-collection/controller/paginationConfigs.ts",
      ),
    ).toMatchInlineSnapshot(`
      {
        "hash": "4a90b4e49550bbcc",
        "versions": [
          "1",
        ],
      }
    `);
  });

  it("demo note pagination config", () => {
    expect(readConfigModule("packages/cms/demo/lib/notePagination.ts"))
      .toMatchInlineSnapshot(`
        {
          "hash": "9005484b645ebe99",
          "versions": [
            "1",
          ],
        }
      `);
  });

  it("demo bookmark pagination config", () => {
    expect(readConfigModule("packages/cms/demo/lib/bookmarkPagination.ts"))
      .toMatchInlineSnapshot(`
        {
          "hash": "fa12735abed428aa",
          "versions": [
            "1",
          ],
        }
      `);
  });

  it("demo note taxonomy config", () => {
    // Replaces the `noteAggregates.ts` block this test used to carry: the demo
    // declares the vocabulary now and the engine derives both folds from it.
    expect(readConfigModule("packages/cms/demo/lib/noteTaxonomy.ts"))
      .toMatchInlineSnapshot(`
        {
          "hash": "9dddd00b5d4ddd91",
          "versions": [
            "1",
          ],
        }
      `);
  });

  /*
   * The engine's own two, pinned for the reason every site config is (T1).
   *
   * They are different in kind from the ones above, and that is why they are
   * here: a site config's fold is read by one site, while these two are read by
   * *every* site that declares a taxonomy. An edit to either changes what is
   * stored under names — `tags`, `by-tag`, `tree` — that no site's version can
   * speak for, so `TAXONOMY_FOLD_VERSION` and the tree's `version` are the only
   * lever, and this test is what asks whether the lever was pulled.
   */
  it("engine taxonomy folds", () => {
    expect(readConfigModule("packages/cms/taxonomies/aggregates.ts"))
      .toMatchInlineSnapshot(`
        {
          "hash": "38a209cd0c85b3f4",
          "versions": [
            "1",
          ],
        }
      `);
  });

  it("engine term tree fold", () => {
    expect(readConfigModule("packages/cms/taxonomies/tree.ts"))
      .toMatchInlineSnapshot(`
      {
        "hash": "593a8a1b6da11675",
        "versions": [
          "1",
        ],
      }
    `);
  });
});
