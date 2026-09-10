// @vitest-environment node
//
// The repo default is jsdom, which does not reliably provide `Response.json`.
// Nothing else here needs a DOM — and nothing here needs LMDB either: the
// factory takes `PaginatedIndexReads`, a structural interface that exists so a
// test can hand in three plain functions.

import { describe, expect, it, vi } from "vitest";

import { createPaginatedJsonRoute } from "@discontent/cms/pagination/next/createPaginatedJsonRoute";
import type { PaginatedIndexReads } from "@discontent/cms/pagination/next/createPaginatedIndexRoute";
import type {
  PaginationMetaResult,
  PaginationPage,
} from "@discontent/cms/pagination/types";

interface Item {
  slug: string;
}

/**
 * A four-page index: pages 0..3, head 3. The landing folds 3 and 2, so the
 * numbered routes are exactly [0, 1] — the same layout the demo's `many-notes`
 * fixture has, which keeps this test and the Playwright spec describing one
 * shape rather than two.
 */
const META: PaginationMetaResult = {
  total: 14,
  headPage: 3,
  perPage: 4,
  numberedPages: [0, 1],
  version: "v1",
  updatedAt: 1700000000000,
};

function page(pageIndex: number | null, slugs: string[]): PaginationPage<Item> {
  return {
    items: slugs.map((slug) => ({ slug })),
    pageIndex,
    headPage: META.headPage,
    total: META.total,
    /*
     * What `readHead` and `readPage` actually set: the head skips the page
     * folded into the landing, and the oldest page has nothing below it.
     */
    olderPage:
      pageIndex === null
        ? META.headPage - 2
        : pageIndex > 0
          ? pageIndex - 1
          : null,
    newerPage: pageIndex === null ? null : pageIndex + 1,
    nextCursor: null,
    version: META.version,
  };
}

const HEAD_PAGE = page(null, [
  "note-14",
  "note-13",
  "note-12",
  "note-11",
  "note-10",
  "note-09",
]);

const PAGES: Record<number, PaginationPage<Item>> = {
  0: page(0, ["note-04", "note-03", "note-02", "note-01"]),
  1: page(1, ["note-08", "note-07", "note-06", "note-05"]),
};

function makeReads(
  overrides: Partial<PaginatedIndexReads<Item>> = {},
): PaginatedIndexReads<Item> {
  return {
    readHead: async () => HEAD_PAGE,
    readPage: async (pageIndex: number) => PAGES[pageIndex] ?? null,
    readMeta: async () => META,
    ...overrides,
  };
}

/** What Next hands a `[page]` route handler. */
function request(page: string) {
  return [
    new Request("http://test.invalid/"),
    { params: Promise.resolve({ page }) },
  ] as const;
}

describe("createPaginatedJsonRoute", () => {
  describe("head", () => {
    it("serves the head page, unprojected", async () => {
      const routes = createPaginatedJsonRoute({ reads: makeReads() });
      const response = await routes.head();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(HEAD_PAGE);
    });

    it("hands back an olderPage that skips the folded page", async () => {
      /*
       * The no-duplicates property of the whole infinite walk rests on this
       * one number: the landing already shows page 2, so the client's first
       * append must be page 1.
       */
      const routes = createPaginatedJsonRoute({ reads: makeReads() });
      const body = (await (await routes.head()).json()) as PaginationPage<Item>;

      expect(body.olderPage).toBe(1);
      expect(body.olderPage).toBe(META.headPage - 2);
    });
  });

  describe("numbered", () => {
    it("serves a numbered page, offset by firstPageNumber", async () => {
      const routes = createPaginatedJsonRoute({ reads: makeReads() });
      /* Default offset is 1, so URL "1" is stable page 0 — the oldest. */
      const response = await routes.numbered(...request("1"));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(PAGES[0]);
    });

    it("honours a zero offset, as the demo uses", async () => {
      const routes = createPaginatedJsonRoute({
        reads: makeReads(),
        firstPageNumber: 0,
      });
      const response = await routes.numbered(...request("1"));

      expect(await response.json()).toEqual(PAGES[1]);
    });

    it("404s a non-numeric param without reading anything", async () => {
      const readPage = vi.fn();
      const readMeta = vi.fn();
      const routes = createPaginatedJsonRoute({
        reads: makeReads({ readPage, readMeta }),
      });

      for (const raw of ["abc", "1e1", " 2", "0x3", "-1", "1.5", ""]) {
        const response = await routes.numbered(...request(raw));
        expect(response.status, `param ${JSON.stringify(raw)}`).toBe(404);
      }
      expect(readPage).not.toHaveBeenCalled();
      expect(readMeta).not.toHaveBeenCalled();
    });

    it("404s the head and the page folded into it", async () => {
      /*
       * Pages 2 and 3 exist in the index but are reachable only through the
       * landing. Serving them here too would put the same items at two URLs.
       */
      const routes = createPaginatedJsonRoute({
        reads: makeReads(),
        firstPageNumber: 0,
      });

      for (const raw of ["2", "3", "99"]) {
        const response = await routes.numbered(...request(raw));
        expect(response.status, `page ${raw}`).toBe(404);
      }
    });

    it("404s with a parseable body rather than throwing", async () => {
      /*
       * A route handler has no error boundary to throw into, and under
       * `output: "export"` only the body survives to disk — so the body is
       * what a client that walks off the end has to read.
       */
      const routes = createPaginatedJsonRoute({ reads: makeReads() });
      const response = await routes.numbered(...request("99"));

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Page not found" });
    });

    it("404s when the page is in range but missing", async () => {
      const routes = createPaginatedJsonRoute({
        reads: makeReads({ readPage: async () => null }),
      });
      const response = await routes.numbered(...request("1"));

      expect(response.status).toBe(404);
    });
  });

  describe("generateStaticParams", () => {
    it("emits every numbered page, offset by firstPageNumber", async () => {
      const routes = createPaginatedJsonRoute({ reads: makeReads() });

      expect(await routes.generateStaticParams()).toEqual([
        { page: "1" },
        { page: "2" },
      ]);
    });

    it("is never empty, because output: export rejects that", async () => {
      /*
       * A corpus small enough to fit in the landing fold has no numbered pages
       * at all. Returning [] fails the export build outright — "Page … is
       * missing generateStaticParams()" — so one param is emitted regardless,
       * and `numbered` answers it with the 404 body.
       */
      const routes = createPaginatedJsonRoute({
        reads: makeReads({
          readMeta: async () => ({ ...META, headPage: 0, numberedPages: [] }),
        }),
      });

      expect(await routes.generateStaticParams()).toEqual([{ page: "1" }]);

      const response = await routes.numbered(...request("1"));
      expect(response.status).toBe(404);
    });

    it("reads meta once rather than loading the corpus to count it", async () => {
      const readMeta = vi.fn(async () => META);
      const readPage = vi.fn();
      const routes = createPaginatedJsonRoute({
        reads: makeReads({ readMeta, readPage }),
      });

      await routes.generateStaticParams();

      expect(readMeta).toHaveBeenCalledTimes(1);
      expect(readPage).not.toHaveBeenCalled();
    });
  });

  describe("the walk the client makes", () => {
    it("covers the corpus exactly once from the head to the oldest page", async () => {
      /*
       * §12.4's property, asserted against the factory rather than a browser:
       * following `olderPage` from the head visits every item once and stops.
       */
      const routes = createPaginatedJsonRoute({
        reads: makeReads(),
        firstPageNumber: 0,
      });

      const seen: string[] = [];
      let next: number | null = null;
      let body = (await (await routes.head()).json()) as PaginationPage<Item>;

      seen.push(...body.items.map((item) => item.slug));
      next = body.olderPage;

      while (next !== null) {
        const response = await routes.numbered(...request(String(next)));
        expect(response.status).toBe(200);
        body = (await response.json()) as PaginationPage<Item>;
        seen.push(...body.items.map((item) => item.slug));
        next = body.olderPage;
      }

      expect(seen).toHaveLength(14);
      expect(new Set(seen).size).toBe(14);
      expect(seen[0]).toBe("note-14");
      expect(seen[13]).toBe("note-01");
    });
  });
});
