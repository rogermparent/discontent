// @vitest-environment node
//
// Pure string derivation over config objects. No LMDB, no DOM.

import { describe, expect, it } from "vitest";

import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import type { AnyContentTypeConfig } from "@discontent/cms/content/types";

import { portfolioContentTypes } from "../websites/portfolio/editor/controller/contentTypes";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";

/*
 * F21a's safety property, and the reason this is a unit test rather than
 * something only Playwright observes.
 *
 * The three writers of a content repository's `.gitignore` each held their own
 * copy of the same knowledge, and all three had drifted. Replacing them with a
 * derivation is behaviour-preserving in exactly one direction: the generated
 * body must **lose nothing** any of them had, and may only gain paths one of
 * them was missing. A lost entry means an LMDB binary swept into a content
 * commit, which no rendered-output check would notice.
 *
 * So the historical literals are pinned here verbatim. They are not a spec to
 * keep in step — they are a floor, asserted as a subset. Adding a content type
 * to a registry grows the generated body and leaves these alone.
 */

/** `initializeContentGit` in `recipe-website/editor/controller/actions`, before F21a. */
const RECIPE_PRODUCTION_BEFORE = `/transformed-images
/recipes/index
/recipes/pagination
/recipes/aggregates
/featured-recipes/index
/featured-recipes/pagination
/featured-recipes/aggregates
/.pagination-changes.json`;

/** `initializeContentGit` in `recipe-website/editor/playwright/support/tasks.ts`, before F21a. */
const RECIPE_HARNESS_BEFORE = `\n/transformed-images\n/recipes/index\n/recipes/pagination\n/recipes/aggregates\n/featured-recipes/index\n/featured-recipes/pagination\n/featured-recipes/aggregates\n/pages/index\n/.pagination-changes.json\n`;

/** `initializeContentGit` in `portfolio/editor/playwright/support/tasks.ts`, before F21a. */
const PORTFOLIO_HARNESS_BEFORE = `\n/transformed-images\n/projects/index\n/pages/index\n`;

/** The ignore entries a literal carried, blank lines dropped. */
function entriesOf(body: string): string[] {
  return body.split("\n").filter((line) => line.length > 0);
}

describe("derivedContentPaths", () => {
  it("names the three derived directories of every config, plus the two site-wide paths", () => {
    const configs = [
      { indexDirectory: "notes/index" },
      { indexDirectory: "bookmarks/index" },
    ] as AnyContentTypeConfig[];

    expect(derivedContentPaths(configs)).toBe(
      [
        "/transformed-images",
        "/notes/index",
        "/notes/pagination",
        "/notes/aggregates",
        "/bookmarks/index",
        "/bookmarks/pagination",
        "/bookmarks/aggregates",
        "/.pagination-changes.json",
      ].join("\n") + "\n",
    );
  });

  it("names pagination and aggregates for a type that declares neither", () => {
    // The unconditional emit, which is the whole reason §11.2's adoption needs
    // no ignore-list edit. `pageContentConfig` declares no index today.
    const body = derivedContentPaths([
      { indexDirectory: "pages/index" },
    ] as AnyContentTypeConfig[]);

    expect(entriesOf(body)).toContain("/pages/pagination");
    expect(entriesOf(body)).toContain("/pages/aggregates");
  });

  it("follows indexDirectory rather than contentType", () => {
    // `getPaginationDirectory` and `getAggregateDirectory` both build from
    // `dirname(indexDirectory)`. A type whose directory and type name disagree
    // must follow the directory, or the generated line names nothing.
    const body = derivedContentPaths([
      { contentType: "featured-recipes", indexDirectory: "featured/index" },
    ] as AnyContentTypeConfig[]);

    expect(entriesOf(body)).toEqual([
      "/transformed-images",
      "/featured/index",
      "/featured/pagination",
      "/featured/aggregates",
      "/.pagination-changes.json",
    ]);
  });

  it("emits no duplicate line when two configs share a directory", () => {
    const body = derivedContentPaths([
      { indexDirectory: "pages/index" },
      { indexDirectory: "pages/index" },
    ] as AnyContentTypeConfig[]);

    const entries = entriesOf(body);
    expect(entries).toEqual([...new Set(entries)]);
  });

  it("ends with a newline and starts without one", () => {
    const body = derivedContentPaths([
      { indexDirectory: "notes/index" },
    ] as AnyContentTypeConfig[]);

    expect(body.endsWith("\n")).toBe(true);
    expect(body.startsWith("\n")).toBe(false);
  });

  describe("loses nothing the hand-written lists had", () => {
    it("recipe: covers both the production writer and the harness", () => {
      const generated = entriesOf(derivedContentPaths(recipeContentTypes));

      for (const entry of entriesOf(RECIPE_PRODUCTION_BEFORE)) {
        expect(generated).toContain(entry);
      }
      for (const entry of entriesOf(RECIPE_HARNESS_BEFORE)) {
        expect(generated).toContain(entry);
      }
    });

    it("recipe: gains exactly the pages and groups directories the production writer lacked", () => {
      const generated = entriesOf(derivedContentPaths(recipeContentTypes));
      const before = entriesOf(RECIPE_PRODUCTION_BEFORE);

      /*
       * In registry order, so `groups` follows `pages` — the derivation walks
       * `recipeContentTypes` and 22b appended the group config last. The groups
       * triple is the payoff this module exists for: a new content type gains
       * its ignore lines by being declared, with no edit to either writer. The
       * *content repository's* `.gitignore` is hand-written and is the one
       * copy still not derived (T6), so it needs the manual paste this list is
       * the source for.
       */
      expect(generated.filter((entry) => !before.includes(entry))).toEqual([
        "/pages/index",
        "/pages/pagination",
        "/pages/aggregates",
        "/groups/index",
        "/groups/pagination",
        "/groups/aggregates",
      ]);
    });

    it("portfolio: covers the harness list", () => {
      const generated = entriesOf(derivedContentPaths(portfolioContentTypes));

      for (const entry of entriesOf(PORTFOLIO_HARNESS_BEFORE)) {
        expect(generated).toContain(entry);
      }
    });

    it("portfolio: gains the derived directories it never named", () => {
      const generated = entriesOf(derivedContentPaths(portfolioContentTypes));
      const before = entriesOf(PORTFOLIO_HARNESS_BEFORE);

      expect(generated.filter((entry) => !before.includes(entry))).toEqual([
        "/projects/pagination",
        "/projects/aggregates",
        "/pages/pagination",
        "/pages/aggregates",
        "/.pagination-changes.json",
      ]);
    });
  });
});
