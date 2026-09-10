// @vitest-environment node
//
// Pure tag derivation over config objects. No LMDB, no DOM, no server.

import { describe, expect, it } from "vitest";

import {
  derivedTagsOf,
  derivedTagsOfAll,
} from "@discontent/cms/content/next/revalidateDerived";
import type { AnyContentTypeConfig } from "@discontent/cms/content/types";

import { demoContentTypes } from "../packages/cms/demo/lib/contentTypes";
import { portfolioContentTypes } from "../websites/portfolio/editor/controller/contentTypes";
import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import { featuredRecipeContentConfig } from "../websites/recipe-website/common/controller/featuredRecipeContentConfig";
import { groupContentConfig } from "../websites/recipe-website/common/controller/groupContentConfig";
import { recipeContentConfig } from "../websites/recipe-website/common/controller/recipeContentConfig";

/*
 * F21b's safety property.
 *
 * The reset seat's job is to leave nothing cached from the previous fixture, so
 * replacing a hand-written list with a derivation may only *add* tags. A tag
 * that stopped firing would not fail loudly — it would make the suite
 * order-dependent, and surface later as an unrelated-looking flake on a
 * reshard. That is why the five tags the recipe route named before F21b are
 * pinned here as literal strings: they are the contract, and they are a floor.
 *
 * They are spelled out rather than imported from the cached-read modules on
 * purpose. Importing those would pull `unstable_cache` and the whole Next
 * runtime into a unit test, and would also make the assertion circular — both
 * sides would derive from the same helper, so a change to the tag *format*
 * would pass while silently invalidating every cache entry in existence.
 */
const RECIPE_ROUTE_BEFORE = [
  "pagination:recipes:by-date", // recipePages.tags.all
  "pagination:featured-recipes:by-date", // featuredRecipePages.tags.all
  "aggregate:recipes:tags", // recipeTagReads.tags.value
  "aggregate:recipes:by-tag", // recipeTagIndexReads.tags.value
  "item:recipes", // recipeItems.tags.all
];

describe("derivedTagsOf", () => {
  it("fires one tag per index, one per aggregate, and the item catch-all", () => {
    const config = {
      contentType: "notes",
      paginationIndexes: [{ name: "by-date" }, { name: "by-title" }],
      aggregates: [{ name: "tags" }],
    } as AnyContentTypeConfig;

    expect(derivedTagsOf(config)).toEqual([
      "pagination:notes:by-date",
      "pagination:notes:by-title",
      "aggregate:notes:tags",
      "item:notes",
    ]);
  });

  it("fires the item catch-all for a type that declares no derived state", () => {
    // The no-op case, and the reason it is sound: a repair seat is exactly what
    // the catch-all exists for, and a type with no cached item reads loses
    // nothing by expiring a tag no entry carries.
    const config = { contentType: "pages" } as AnyContentTypeConfig;

    expect(derivedTagsOf(config)).toEqual(["item:pages"]);
  });

  it("fires the index catch-all, not the per-page tags", () => {
    // `tags.all` is on every entry the keyspace produces, so one expiry covers
    // head, meta and every numbered page. The precise tags are the write path's.
    const config = {
      contentType: "notes",
      paginationIndexes: [{ name: "by-date" }],
    } as AnyContentTypeConfig;

    const tags = derivedTagsOf(config);
    expect(tags).toContain("pagination:notes:by-date");
    expect(tags.some((tag) => tag.includes(":page:"))).toBe(false);
    expect(tags).not.toContain("pagination:notes:by-date:meta");
    expect(tags).not.toContain("pagination:notes:by-date:head");
  });
});

describe("derivedTagsOfAll", () => {
  it("covers every tag the recipe route enumerated by hand", () => {
    const fired = derivedTagsOfAll(recipeContentTypes);

    for (const tag of RECIPE_ROUTE_BEFORE) {
      expect(fired).toContain(tag);
    }
  });

  it("adds the item catch-alls the recipe route was missing, plus everything groups declares", () => {
    const fired = derivedTagsOfAll(recipeContentTypes);

    /*
     * In registry order, and `derivedTagsOf` emits each type's pagination
     * indexes, then its aggregates, then its item catch-all — so groups
     * contribute their three at the end, after `pages`, which was last before
     * 22b appended them.
     *
     * That the groups triple appeared here with no edit to the reset route is
     * the property F21b bought: the seat reads the registry, so declaring a
     * content type is the whole of adopting it. The only edit 22b needed was to
     * this expectation (T15).
     */
    expect(fired.filter((tag) => !RECIPE_ROUTE_BEFORE.includes(tag))).toEqual([
      "item:featured-recipes",
      "item:pages",
      "pagination:groups:by-date",
      "aggregate:groups:by-recipe",
      "item:groups",
    ]);
  });

  it("fires the projects index for portfolio, which now declares one", () => {
    // Portfolio's route expired nothing before F21b and was correct only
    // because of that. F29 is what made it stop being true: `projects` declares
    // `projectsByDate`, and the tag appeared here without an edit to either
    // seat, because both read the registry rather than a hand-written list.
    //
    // `pages` still declares nothing, so it contributes its catch-all alone —
    // which is what keeps this case honest as a mixed one rather than a
    // symmetric one.
    expect(derivedTagsOfAll(portfolioContentTypes)).toEqual([
      "pagination:projects:by-date",
      "item:projects",
      "item:pages",
    ]);
  });

  it("reproduces the demo route's five tags exactly, adding and losing none", () => {
    // The demo is the one seat where the derivation is a *pure* simplification:
    // its hand-written list and the derived one are the same set, so adopting
    // it could not have changed behaviour. Pinned so it stays that way.
    expect(derivedTagsOfAll(demoContentTypes).sort()).toEqual(
      [
        "pagination:notes:by-date", // notePages.tags.all
        "aggregate:notes:tags", // noteTagReads.tags.value
        "item:notes", // noteItems.tags.all
        "pagination:bookmarks:by-date", // bookmarkPages.tags.all
        "item:bookmarks", // bookmarkItems.tags.all
      ].sort(),
    );
  });

  it("emits no duplicate tags", () => {
    const fired = derivedTagsOfAll(recipeContentTypes);
    expect(fired).toEqual([...new Set(fired)]);
  });
});

/*
 * F22b's property, and the reason it is a unit test.
 *
 * A rebuild seat's argument *is* its blast radius: it passes the configs it
 * moved, and `derivedTagsOf` turns that into tags. Two seats on recipe pass
 * deliberately different lists, and the difference is invisible to every e2e
 * test in the repo — over-invalidation has no symptom you can assert on a page,
 * because the page is simply correct either way, just recomputed. So the
 * narrowness of the featured seat is a claim only this file can keep honest.
 *
 * It is also the one property F22a proved e2e cannot reach at all. In
 * production the old `revalidatePath("/")` seat kept both the homepage and
 * `/recipe/shared` fresh, by some route Next's implicit tags do not explain —
 * so a browser cannot distinguish "fires the right tags" from "fires a path
 * call broad enough to cover it". Asserting the derivation directly can.
 */
describe("rebuild seats", () => {
  it("moves both keyspaces for a recipe rebuild, which cascades", () => {
    // `rebuildIndex` cascades to dependents by default (D1), so the recipe seat
    // in `actions/index.ts` really does move featured recipes too.
    expect(
      derivedTagsOfAll([recipeContentConfig, featuredRecipeContentConfig]),
    ).toEqual([
      "pagination:recipes:by-date",
      "aggregate:recipes:tags",
      "aggregate:recipes:by-tag",
      "item:recipes",
      "pagination:featured-recipes:by-date",
      "item:featured-recipes",
    ]);
  });

  it("covers every tag the recipe rebuild seat fired by hand", () => {
    // The floor, for the same reason `RECIPE_ROUTE_BEFORE` is one: a tag that
    // stopped firing would leave a rebuilt corpus serving pre-rebuild pages,
    // and would not fail loudly anywhere.
    const fired = derivedTagsOfAll([
      recipeContentConfig,
      featuredRecipeContentConfig,
    ]);

    for (const tag of RECIPE_ROUTE_BEFORE) {
      expect(fired).toContain(tag);
    }
  });

  it("a group rebuild fires featured tags but no recipe tag", () => {
    /*
     * `rebuildGroupIndex`'s radius, and the one case in this file that *grew*.
     *
     * Until 22g the seat passed groups alone, on the argument that groups
     * declare no references (D3) so `rebuildIndex`'s cascade is empty. Half of
     * that is still true and half is not: groups borrow nothing, but a featured
     * entry may now point at one and borrow its `name` and `kind`, so the
     * cascade reaches featured recipes and the seat has to say so — or every
     * featured *group* card would go on serving pre-rebuild borrowed values,
     * which is the exact failure the button exists to repair.
     *
     * Five tags: the group keyspace, the aggregate behind "Appears in",
     * `item:groups`, then the featured keyspace and `item:featured-recipes`.
     * Recipes are still absent, and that is still the point — a group rebuild
     * moves no recipe record, page or aggregate.
     */
    const fired = derivedTagsOfAll([
      groupContentConfig,
      featuredRecipeContentConfig,
    ]);

    expect(fired).toEqual([
      "pagination:groups:by-date",
      "aggregate:groups:by-recipe",
      "item:groups",
      "pagination:featured-recipes:by-date",
      "item:featured-recipes",
    ]);
    for (const tag of RECIPE_ROUTE_BEFORE) {
      /*
       * `pagination:featured-recipes:by-date` is in the floor list because the
       * recipe *route* fired it; a group rebuild firing it is correct, so only
       * the four genuinely recipe-owned tags are asserted absent here.
       */
      if (tag === "pagination:featured-recipes:by-date") continue;
      expect(fired).not.toContain(tag);
    }
  });

  it("fires every type's tags for the export's rebuild-all seat", () => {
    // `rebuildAllIndexes` (22b/T9) is the deliberately *wide* seat: it rebuilds
    // the whole registry and hands the whole registry to `revalidateDerivedState`,
    // because the export rebuilds everything and groups are nobody's dependent
    // — so the narrow recipe seat it replaced left an unbuilt groups index
    // alone. Its argument and the registry are the same list by construction,
    // which is what this pins.
    expect(derivedTagsOfAll(recipeContentTypes)).toContain("item:groups");
    expect(derivedTagsOfAll(recipeContentTypes)).toContain(
      "pagination:groups:by-date",
    );
    expect(derivedTagsOfAll(recipeContentTypes)).toContain(
      "aggregate:groups:by-recipe",
    );
  });

  it("fires no recipe tag for a featured-recipe rebuild", () => {
    // The narrow radius `rebuildFeaturedRecipeIndex`'s comment argues for, and
    // the assertion that makes the argument checkable. Recipe records and
    // recipe pages are untouched by a featured rebuild; widening this seat to
    // match its sibling would be the over-invalidation §6.4 exists to prevent.
    const fired = derivedTagsOf(featuredRecipeContentConfig);

    expect(fired).toEqual([
      "pagination:featured-recipes:by-date",
      "item:featured-recipes",
    ]);
    expect(fired).not.toContain("pagination:recipes:by-date");
    expect(fired).not.toContain("aggregate:recipes:tags");
    expect(fired).not.toContain("aggregate:recipes:by-tag");
    expect(fired).not.toContain("item:recipes");
  });

  it("fires the projects index for a portfolio export rebuild", () => {
    // `buildExport` rebuilds every type portfolio owns, so its list and the
    // registry are the same list. Before F29 both expanded to item catch-alls
    // no entry carried, which made the seat correct for a reason that would not
    // have survived §11.2; this is the other side of that, and the seat itself
    // never changed.
    const fired = derivedTagsOfAll(portfolioContentTypes);

    expect(fired).toEqual([
      "pagination:projects:by-date",
      "item:projects",
      "item:pages",
    ]);
    // Still no aggregate anywhere in portfolio — F29 adopted pagination only.
    expect(fired.some((tag) => tag.startsWith("aggregate:"))).toBe(false);
  });
});
