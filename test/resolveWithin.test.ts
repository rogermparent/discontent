import { describe, expect, it } from "vitest";

import { resolveWithin } from "@discontent/cms/fs/resolveWithin";
import { getPageDirectory } from "@discontent/pages-collection/controller/filesystemDirectories";
import { getMenuDirectory } from "@discontent/menus-collection/controller/filesystemDirectories";

/*
 * The confinement helper, and the two collections that gained it.
 *
 * This exists because the traversal fixed in projects turned out to be a
 * *class*: the same `resolve(base, untrustedSlug)` shape was in pages, in menus,
 * and in both sites' upload and image routes. One implementation now, and one
 * place that pins its contract.
 */
describe("resolveWithin", () => {
  const base = "/tmp/ce-base";

  it("resolves an ordinary segment beneath the base", () => {
    expect(resolveWithin(base, "thing")).toBe("/tmp/ce-base/thing");
  });

  it("allows nested segments", () => {
    expect(resolveWithin(base, "a/b/c")).toBe("/tmp/ce-base/a/b/c");
  });

  it("allows the base itself", () => {
    expect(resolveWithin(base, "")).toBe(base);
  });

  it("allows a traversal that stays inside", () => {
    // Refusing this would be over-strict: the *resolved* location is what
    // matters, not whether the input contained "..".
    expect(resolveWithin(base, "a/../b")).toBe("/tmp/ce-base/b");
  });

  it("refuses a traversal that escapes", () => {
    expect(() => resolveWithin(base, "../secret")).toThrow(
      /Refusing to resolve path outside its base directory/,
    );
    expect(() => resolveWithin(base, "a/../../secret")).toThrow();
    expect(() => resolveWithin(base, "../..")).toThrow();
  });

  it("refuses an absolute path", () => {
    // `resolve()` discards the base entirely when handed an absolute path, which
    // is the least obvious way this could have been escaped.
    expect(() => resolveWithin(base, "/etc/passwd")).toThrow();
  });

  it("refuses a sibling directory that merely shares the prefix", () => {
    // The guard compares against `base + sep`, not a bare `startsWith(base)` —
    // otherwise "/tmp/ce-base-evil" would look like it was inside "/tmp/ce-base".
    expect(() => resolveWithin(base, "../ce-base-evil")).toThrow();
  });

  it("names what it was resolving", () => {
    expect(() => resolveWithin(base, "../x", "menu slug")).toThrow(
      /Refusing to resolve menu slug/,
    );
  });
});

describe("pages and menus are confined too", () => {
  const contentDirectory = "/tmp/ce-test-content";

  it("resolves an ordinary page slug under pages/data", () => {
    // Note the path: pages moved under `pages/data/` so the LMDB index can live
    // beside them at `pages/index/`.
    expect(getPageDirectory("about", contentDirectory)).toBe(
      "/tmp/ce-test-content/pages/data/about",
    );
  });

  it("refuses a traversing page slug", () => {
    expect(() => getPageDirectory("../../users", contentDirectory)).toThrow(
      /page slug/,
    );
  });

  it("resolves an ordinary menu slug", () => {
    expect(getMenuDirectory("header", contentDirectory)).toBe(
      "/tmp/ce-test-content/menus/header",
    );
  });

  it("refuses a traversing menu slug", () => {
    // deleteMenu handed this straight to a recursive `rm`.
    expect(() => getMenuDirectory("../../users", contentDirectory)).toThrow(
      /menu slug/,
    );
  });

  it("honours the contentDirectory argument", () => {
    // Neither could before: both modules captured an eagerly-evaluated
    // module-level `contentDirectory`, so the argument was dead code.
    expect(getPageDirectory("p", "/tmp/other")).toBe("/tmp/other/pages/data/p");
    expect(getMenuDirectory("m", "/tmp/other")).toBe("/tmp/other/menus/m");
  });
});
