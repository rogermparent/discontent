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

/** Every `version: "..."` a module declares, in source order. */
function declaredVersions(source: string): string[] {
  return [...source.matchAll(/\bversion:\s*"([^"]*)"/g)].map(
    (match) => match[1],
  );
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
        "hash": "0d0d2499bc2a1719",
        "versions": [
          "1",
          "2",
        ],
      }
    `);
  });

  it("recipe aggregate configs", () => {
    expect(
      readConfigModule(
        "websites/recipe-website/common/controller/aggregateConfigs.ts",
      ),
    ).toMatchInlineSnapshot(`
      {
        "hash": "58a62281af838fe1",
        "versions": [
          "1",
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
        "hash": "798bcf7a1f07c6a8",
        "versions": [
          "1",
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
        "hash": "bc0222918ed67b5f",
        "versions": [
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

  it("demo note aggregate config", () => {
    expect(readConfigModule("packages/cms/demo/lib/noteAggregates.ts"))
      .toMatchInlineSnapshot(`
        {
          "hash": "11f11fb8a9117609",
          "versions": [
            "1",
          ],
        }
      `);
  });
});
