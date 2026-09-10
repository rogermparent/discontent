// @vitest-environment node
//
// D9: the half of `handleContentSuccess` that an API route can call.
//
// Two claims, and both are invisible to every other kind of test.
//
// **It fires everything the form path fires.** The write path is precise —
// pagination and aggregate tags come from the engine's own return value, item
// tags from the slug — and a route that revalidated less than a form submission
// would serve stale pages *sometimes*, which no Playwright spec reliably
// catches. The recording stubs are the only place the fired set is visible.
//
// **It never redirects.** `redirect()` throws `NEXT_REDIRECT` in real Next; a
// route handler has no router to catch that, so it would escape as a 500 on
// every successful write. The stub records instead of throwing, so the negative
// is assertable here and nowhere else.

import { beforeEach, describe, expect, it } from "vitest";

import { revalidateContentWrite } from "@discontent/cms/content/genericActions";
import type { ContentWriteResult } from "@discontent/cms/content/types";

import {
  groupSuccessConfig,
  pageSuccessConfig,
  recipeSuccessConfig,
  successConfigFor,
} from "../websites/recipe-website/editor/controller/successConfigs";

import {
  resetRevalidatedPaths,
  resetRevalidatedTags,
  revalidatedPaths,
  revalidatedTags,
} from "./stub_cache.js";
import { redirects, resetRedirects } from "./stub_navigation.js";

/**
 * One write that dirtied a sealed page and moved an aggregate.
 *
 * Hand-built rather than taken from a real `createContent`: what is under test
 * is the *fan-out*, and a synthetic result can say "page 3 moved and the tag
 * cloud changed" without needing a corpus large enough to have a page 3.
 */
function writeResult(): ContentWriteResult {
  return {
    pagination: [
      {
        name: "by-date",
        total: 42,
        headPage: 5,
        previousHeadPage: 5,
        dirtyPages: [3],
        removedPages: [],
        unchanged: false,
        rebuilt: false,
      },
    ],
    aggregates: [{ name: "tags", changed: true, total: 42 }],
    dependents: [],
  };
}

const paths = () => revalidatedPaths.map((entry) => entry.path);
const tags = () => revalidatedTags.map((entry) => entry.tag);

beforeEach(() => {
  resetRevalidatedPaths();
  resetRevalidatedTags();
  resetRedirects();
});

describe("revalidateContentWrite", () => {
  it("fires both item URLs and both item tags on a rename, and never redirects", () => {
    revalidateContentWrite(
      recipeSuccessConfig,
      "recipes",
      writeResult(),
      "a",
      "b",
    );

    /* The old URL first — it is the one that now 404s. */
    expect(paths()).toEqual(["/recipe/b", "/recipe/a"]);
    expect(tags()).toContain("item:recipes:a");
    expect(tags()).toContain("item:recipes:b");
    expect(redirects).toEqual([]);
  });

  it("fires the pagination and aggregate tags the engine reported", () => {
    revalidateContentWrite(recipeSuccessConfig, "recipes", writeResult(), "a");

    expect(tags().some((tag) => tag.includes("pagination:recipes"))).toBe(true);
    expect(tags().some((tag) => tag.includes("aggregate:recipes"))).toBe(true);
  });

  it("does not touch `/` for a paginationOnly config", () => {
    revalidateContentWrite(recipeSuccessConfig, "recipes", writeResult(), "a");
    expect(paths()).toEqual(["/recipe/a"]);
    expect(paths()).not.toContain("/");

    resetRevalidatedPaths();
    revalidateContentWrite(groupSuccessConfig, "groups", writeResult(), "g");
    expect(paths()).toEqual(["/group/g"]);
  });

  it("fires the list path and `/` for a config that is not paginationOnly", () => {
    revalidateContentWrite(pageSuccessConfig, "pages", writeResult(), "about");
    /* `itemBasePath` is "" for pages, so the item URL is "/about". */
    expect(paths()).toEqual(["/about", "/pages", "/"]);
    expect(redirects).toEqual([]);
  });
});

describe("successConfigFor", () => {
  it("gives each content type its write and delete configs", () => {
    expect(successConfigFor("groups", "delete").redirectTo?.("x")).toBe(
      "/groups",
    );
    expect(successConfigFor("recipes", "delete").redirectTo?.("x")).toBe("/");
    expect(successConfigFor("pages", "delete").redirectTo?.("x")).toBe(
      "/pages",
    );
    expect(successConfigFor("recipes", "write")).toBe(recipeSuccessConfig);
    expect(successConfigFor("groups", "write")).toBe(groupSuccessConfig);
  });

  it("falls back to the write config for a type with no delete config", () => {
    /* Featured recipes have one config; a delete redirects home like a write. */
    expect(successConfigFor("featured-recipes", "delete")).toBe(
      successConfigFor("featured-recipes", "write"),
    );
  });

  it("throws on an unknown content type rather than silently skipping", () => {
    expect(() => successConfigFor("nope", "write")).toThrow(/nope/);
  });
});
