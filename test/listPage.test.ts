// @vitest-environment node
//
// F6 (epic 35q): numbered pages over the editors' offset list reads —
// `@discontent/cms/content/listPage` and the pages/projects collections'
// list-page reads. Scratch content directories only (not a repository, so
// writes do not commit).

import { mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createContent } from "@discontent/cms/content/createContent";
import { parseListPage, readListPage } from "@discontent/cms/content/listPage";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";
import { getPagesListPage } from "@discontent/pages-collection/controller/data/readIndex";
import { pageContentConfig } from "@discontent/pages-collection/controller/pageContentConfig";
import { getProjectsListPage } from "@discontent/projects-collection/controller/data/readIndex";
import { projectContentConfig } from "@discontent/projects-collection/controller/projectContentConfig";

describe("parseListPage", () => {
  it("reads page 1 when absent, and only plain positive integers", () => {
    expect(parseListPage(undefined)).toBe(1);
    expect(parseListPage("1")).toBe(1);
    expect(parseListPage("12")).toBe(12);
    for (const bad of ["", "0", "-1", "01", "1.5", "abc", "1e3", " 2"]) {
      expect(parseListPage(bad), bad).toBeNull();
    }
    expect(parseListPage(["1", "2"])).toBeNull();
  });
});

describe("readListPage", () => {
  const rows = Array.from({ length: 5 }, (_, i) => `row-${i}`);
  const read = async ({ limit, offset }: { limit: number; offset: number }) => {
    const entries = rows.slice(offset, offset + limit);
    return { entries, more: offset + entries.length < rows.length };
  };

  it("pages by offset, newest first, with the neighbours it can reach", async () => {
    expect(await readListPage(1, 2, read)).toEqual({
      entries: ["row-0", "row-1"],
      page: 1,
      newerPage: null,
      olderPage: 2,
    });
    expect(await readListPage(2, 2, read)).toEqual({
      entries: ["row-2", "row-3"],
      page: 2,
      newerPage: 1,
      olderPage: 3,
    });
    expect(await readListPage(3, 2, read)).toEqual({
      entries: ["row-4"],
      page: 3,
      newerPage: 2,
      olderPage: null,
    });
  });

  it("is null past the end, but page 1 always answers", async () => {
    expect(await readListPage(4, 2, read)).toBeNull();
    const empty = async () => ({ entries: [] as string[], more: false });
    expect(await readListPage(1, 2, empty)).toEqual({
      entries: [],
      page: 1,
      newerPage: null,
      olderPage: null,
    });
    expect(await readListPage(2, 2, empty)).toBeNull();
  });

  it("has no older page when the last page is exactly full", async () => {
    expect((await readListPage(1, 5, read))?.olderPage).toBeNull();
    expect(await readListPage(2, 5, read)).toBeNull();
  });
});

describe("the collections' list pages", () => {
  let contentDirectory: string;
  const DAY = 86_400_000;

  beforeEach(async () => {
    contentDirectory = await mkdtemp(join(tmpdir(), "list-page-"));
  });

  afterEach(async () => {
    closeCachedEnvironments();
    await rm(contentDirectory, { recursive: true, force: true });
  });

  it("pages the pages list, newest first", async () => {
    for (let i = 1; i <= 5; i++) {
      await createContent({
        config: pageContentConfig,
        slug: `page-${i}`,
        data: {
          name: `Page ${i}`,
          date: 1_700_000_000_000 + i * DAY,
          content: "x",
        },
        contentDirectory,
      });
    }
    const first = await getPagesListPage(1, { perPage: 2, contentDirectory });
    expect(first?.entries.map(({ slug }) => slug)).toEqual([
      "page-5",
      "page-4",
    ]);
    expect(first).toMatchObject({ page: 1, newerPage: null, olderPage: 2 });
    const last = await getPagesListPage(3, { perPage: 2, contentDirectory });
    expect(last?.entries.map(({ slug }) => slug)).toEqual(["page-1"]);
    expect(last).toMatchObject({ newerPage: 2, olderPage: null });
    expect(
      await getPagesListPage(4, { perPage: 2, contentDirectory }),
    ).toBeNull();
  });

  it("pages the project list, and answers page 1 of an unbuilt index", async () => {
    expect(await getProjectsListPage(1, { contentDirectory })).toEqual({
      entries: [],
      page: 1,
      newerPage: null,
      olderPage: null,
    });
    for (let i = 1; i <= 3; i++) {
      await createContent({
        config: projectContentConfig,
        slug: `project-${i}`,
        data: {
          name: `Project ${i}`,
          date: 1_700_000_000_000 + i * DAY,
          content: "x",
        },
        contentDirectory,
      });
    }
    const second = await getProjectsListPage(2, {
      perPage: 2,
      contentDirectory,
    });
    expect(second?.entries.map(({ slug }) => slug)).toEqual(["project-1"]);
    expect(second).toMatchObject({ page: 2, newerPage: 1, olderPage: null });
  });
});
