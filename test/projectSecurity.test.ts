import { describe, expect, it } from "vitest";
import { z } from "zod";
import parseFormData, {
  isSafeFormDataKey,
} from "@discontent/cms/forms/parseFormData";
import { getProjectDirectory } from "@discontent/projects-collection/controller/filesystemDirectories";

/*
 * The security fixes from PR 05 of the portfolio rebuild.
 *
 * All three of these were live: FormData keys reached lodash `set` unfiltered,
 * project slugs reached a recursive `rm` unconfined, and the projects actions
 * had no auth check at all. The auth gate is now structural — `authenticate` is
 * a required field on EditorContentConfig, so it cannot be forgotten — but the
 * two input-validation fixes need tests, because nothing about them is visible
 * at a call site.
 */

describe("FormData key guard", () => {
  it("rejects prototype-walking keys", () => {
    expect(isSafeFormDataKey("__proto__")).toBe(false);
    expect(isSafeFormDataKey("__proto__.isAdmin")).toBe(false);
    expect(isSafeFormDataKey("a.__proto__.b")).toBe(false);
    expect(isSafeFormDataKey("constructor.prototype.x")).toBe(false);
    expect(isSafeFormDataKey("a[0].__proto__")).toBe(false);
  });

  it("allows the nested names real forms use", () => {
    expect(isSafeFormDataKey("name")).toBe(true);
    expect(isSafeFormDataKey("links[0].url")).toBe(true);
    expect(isSafeFormDataKey("instructions[0].instructions[2].text")).toBe(
      true,
    );
  });

  it("does not pollute Object.prototype", () => {
    const formData = new FormData();
    formData.set("__proto__.polluted", "yes");
    formData.set("name", "Real Project");

    parseFormData(formData, z.object({ name: z.string() }));

    // The assertion that matters: Zod runs *after* the set() loop, so a schema
    // rejecting the field would be no defence — the prototype would already be
    // polluted by the time validation happened.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("polluted");
  });
});

describe("project slug confinement", () => {
  const contentDirectory = "/tmp/ce-test-content";

  it("resolves an ordinary slug under the projects tree", () => {
    expect(getProjectDirectory("my-project", contentDirectory)).toBe(
      "/tmp/ce-test-content/projects/data/my-project",
    );
  });

  it("refuses to escape the tree", () => {
    // The delete action hands its slug straight to a recursive rm, so this is
    // the difference between deleting a project and deleting the users file.
    //
    // The message moved with the implementation: this logic is now the shared
    // `resolveWithin` helper, used by pages, menus and both sites' upload and
    // image routes, so it can no longer name the projects tree specifically. It
    // still names the offending slug, which is the part worth asserting.
    expect(() => getProjectDirectory("../../users", contentDirectory)).toThrow(
      /Refusing to resolve project slug outside its base directory: \.\.\/\.\.\/users/,
    );
    expect(() => getProjectDirectory("../../..", contentDirectory)).toThrow();
    expect(() =>
      getProjectDirectory("a/../../../etc", contentDirectory),
    ).toThrow();
  });

  it("honours the contentDirectory argument", () => {
    // It could not before: the module captured an eagerly-evaluated
    // module-level `contentDirectory`, so the argument was dead.
    expect(getProjectDirectory("p", "/tmp/other")).toBe(
      "/tmp/other/projects/data/p",
    );
  });
});
