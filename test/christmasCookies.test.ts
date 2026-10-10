// @vitest-environment node
//
// The Christmas-Cookies user story, replayed over the tools — the taxonomy
// edition (31c, 24-D7; the groups edition was 23f/D30).
//
// The ask that drove epic 23, in the user's words:
//
//   "Organize the cluster of cookie recipes into one featured group called
//    Christmas Cookies, then combine the linzer cookie recipes into a group
//    that is accessible both at the top level and inside Christmas Cookies."
//
// Epic 24 (D5) decided that a collection is a **term**, not a group: a tag
// with a record that carries a label, a description and a parent. So the
// same ask now lands as two terms — `christmas-cookies`, and `linzer` beneath
// it — whose `tag:` search reaches the linzers through the hierarchy (31b),
// and a group is what a meal plan is. `Group.kind` narrowed to `meal-plan` in
// the same phase, which this story also pins.
//
// `mcp.test.ts` and `terms.test.ts` prove each tool on corpora they build.
// What is only provable end to end is that the *sequence* an agent would run
// lands the shape the ask describes, on the committed `christmas-cookies`
// fixture, whose eight cookies and two deliberate distractors are the whole
// point (23-D29): a search that widens by one recipe fails here rather than in
// a person's content repo.
//
// No model is in the loop. The skill tells an agent which tools to call; this
// pins that those calls, in that order, still work.

import { copy, mkdtemp, rm } from "fs-extra";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { closeCachedEnvironments } from "@discontent/cms/lmdb/environmentCache";

import {
  createLocalBackend,
  STALE_EDITOR_HINT,
} from "../websites/recipe-website/editor/cli/backend/local";
import { createRecipeServer } from "../websites/recipe-website/editor/mcp/registry";

/** The committed corpus. Copied, never written to (T63). */
const FIXTURE = resolve(
  __dirname,
  "../websites/recipe-website/editor/playwright/fixtures/test-content/christmas-cookies",
);

/** The eight cookies, newest first — the exact answer to `query: "cookie"`. */
const COOKIES = [
  "linzer-cookies",
  "chocolate-hazelnut-linzer-cookies",
  "apricot-linzer-cookies",
  "gingerbread-cookies",
  "sugar-cookies",
  "snickerdoodles",
  "peanut-butter-blossoms",
  "shortbread",
];
const LINZER = COOKIES.slice(0, 3);
const NOT_LINZER = COOKIES.slice(3);

describe("the Christmas-Cookies story, taxonomy edition, over the MCP tools", () => {
  let contentDirectory: string;
  let previousContentDirectory: string | undefined;
  let backend: ReturnType<typeof createLocalBackend>;
  let server: ReturnType<typeof createRecipeServer>;
  let client: Client;

  beforeAll(async () => {
    /*
     * Before the copy, not after: `copy` reads the fixture's `lock.mdb`, and
     * anything this process still holds open on an LMDB environment elsewhere
     * is a slot it has to release first (T16).
     */
    await closeCachedEnvironments();
    contentDirectory = await mkdtemp(join(tmpdir(), "christmas-cookies-"));
    await copy(FIXTURE, contentDirectory);

    /* Not a git repository, so writes land on disk and commit nothing. */
    previousContentDirectory = process.env.CONTENT_DIRECTORY;
    process.env.CONTENT_DIRECTORY = contentDirectory;

    backend = createLocalBackend({ contentDirectory });
    server = createRecipeServer(backend);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: "christmas-cookies-test", version: "0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
    await backend.close();
    if (previousContentDirectory === undefined) {
      delete process.env.CONTENT_DIRECTORY;
    } else {
      process.env.CONTENT_DIRECTORY = previousContentDirectory;
    }
    await rm(contentDirectory, { recursive: true, force: true });
  });

  async function call(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<{ isError: boolean; data: Record<string, unknown> }> {
    const result = await client.callTool({ name, arguments: args });
    return {
      isError: result.isError === true,
      data: (result.structuredContent ?? {}) as Record<string, unknown>,
    };
  }

  async function callError(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const { isError, data } = await call(name, args);
    expect(isError).toBe(true);
    return (data as { error: Record<string, unknown> }).error;
  }

  /** `recipe_search` slugs, in the order the tool returned them. */
  async function searchSlugs(query: string) {
    const { data } = await call("recipe_search", { query, limit: 100 });
    return {
      total: data.total,
      slugs: (data.recipes as Array<{ slug: string }>).map((row) => row.slug),
    };
  }

  it("finds the cluster, makes it a featured term, and nests the linzers beneath it", async () => {
    /* --- 1. What is here ------------------------------------------- */

    /*
     * A read of *derived* records first: the term tree and the tag folds are
     * committed with the fixture, so a non-empty answer is proof the copy
     * carried its indexes and nothing rebuilt them.
     */
    const listed = (await call("term_list", {})).data as {
      total: number;
      terms: Array<Record<string, unknown>>;
    };
    const bySlug = new Map(listed.terms.map((term) => [term.slug, term]));
    expect(bySlug.get("cookies")).toMatchObject({
      label: "Cookies",
      count: 8,
      parent: "dessert",
      record: true,
    });
    /* A record nobody has assigned yet, and a tag with no record. */
    expect(bySlug.get("holiday")).toMatchObject({ count: 0, record: true });
    expect(bySlug.get("christmas")).toMatchObject({ record: false });
    expect(bySlug.has("christmas-cookies")).toBe(false);

    /*
     * The cluster is eight, in date order, and neither distractor is in it
     * — the assertion the fixture exists for (T66).
     */
    expect(await searchSlugs("cookie")).toEqual({ total: 8, slugs: COOKIES });

    /* --- 2. The parent term ----------------------------------------- */

    const parent = await call("term_create", {
      term: {
        label: "Christmas Cookies",
        description: "Everything that comes out of the oven in December.",
      },
    });
    expect(parent.isError).toBe(false);
    expect(parent.data).toMatchObject({
      slug: "christmas-cookies",
      url: "/tags/christmas-cookies",
      /* The string a carrier gets: the label, normalised, since it slugs back. */
      tag: "christmas cookies",
    });
    /*
     * The local backend is not `inProcess`, so `afterWrite` fires and the
     * write answers with the stale-editor hint — the line the skill tells an
     * agent to restate in plain words.
     */
    expect(parent.data.warnings).toEqual([
      expect.stringContaining(STALE_EDITOR_HINT),
    ]);

    /* Five of the eight directly; the linzers arrive through the child. */
    const assigned = await call("term_assign", {
      slug: "christmas-cookies",
      add: NOT_LINZER,
    });
    expect(assigned.isError).toBe(false);
    expect(assigned.data).toMatchObject({
      slug: "christmas-cookies",
      type: "recipe",
      tag: "christmas cookies",
      updated: NOT_LINZER,
      unchanged: [],
      missing: [],
    });

    /* --- 3. The child term, beneath it ------------------------------ */

    const child = await call("term_create", {
      term: {
        label: "Linzer",
        parent: "christmas-cookies",
        description: "Jam between two almond cookies, three ways.",
      },
    });
    expect(child.isError).toBe(false);
    expect(child.data).toMatchObject({ slug: "linzer", tag: "linzer" });

    const linzers = await call("term_assign", {
      slug: "linzer",
      add: LINZER,
    });
    expect(linzers.data).toMatchObject({ updated: LINZER, missing: [] });

    /* Assigning again is a no-op per carrier, not a second write. */
    expect(
      (await call("term_assign", { slug: "linzer", add: LINZER })).data,
    ).toMatchObject({ updated: [], unchanged: LINZER });

    /* --- 4. On the homepage ---------------------------------------- */

    /* Explicit `slug`: the default has one-second resolution (T26). */
    const featured = await call("feature", {
      term: "christmas-cookies",
      slug: "christmas-cookies-strip",
    });
    expect(featured.isError).toBe(false);
    expect(featured.data).toMatchObject({
      slug: "christmas-cookies-strip",
      term: "christmas-cookies",
    });

    /* --- 5. The hierarchy answers the search ------------------------ */

    /*
     * The second half of the ask: the linzers are a term of their own (the
     * top level) *and* inside Christmas Cookies, because `tag:` expands to a
     * term's descendants (31b). Eight, though only five carry the parent.
     */
    const expanded = await searchSlugs("tag:christmas-cookies");
    expect(expanded.total).toBe(8);
    expect([...expanded.slugs].sort()).toEqual([...COOKIES].sort());
    expect((await searchSlugs("tag:linzer")).total).toBe(3);

    /* And the other direction is a cycle, reported as one and final. */
    expect(
      await callError("term_update", {
        slug: "christmas-cookies",
        patch: { parent: "linzer" },
      }),
    ).toMatchObject({
      code: "term_cycle",
      terms: ["christmas-cookies", "linzer", "christmas-cookies"],
    });

    /* --- 6. Read back what the user asked for ----------------------- */

    const parentTerm = (await call("term_get", { slug: "christmas-cookies" }))
      .data;
    expect(parentTerm).toMatchObject({
      slug: "christmas-cookies",
      label: "Christmas Cookies",
      url: "/tags/christmas-cookies",
      record: {
        label: "Christmas Cookies",
        description: "Everything that comes out of the oven in December.",
      },
      counts: { own: 5, withDescendants: 8 },
      breadcrumb: [
        { slug: "christmas-cookies", label: "Christmas Cookies", count: 5 },
      ],
      children: [{ slug: "linzer", label: "Linzer", count: 3 }],
    });
    expect([...(parentTerm.recipes as string[])].sort()).toEqual(
      [...NOT_LINZER].sort(),
    );

    const childTerm = (await call("term_get", { slug: "linzer" })).data;
    expect(childTerm).toMatchObject({
      slug: "linzer",
      label: "Linzer",
      parent: "christmas-cookies",
      counts: { own: 3, withDescendants: 3 },
      breadcrumb: [
        { slug: "christmas-cookies", label: "Christmas Cookies", count: 5 },
        { slug: "linzer", label: "Linzer", count: 3 },
      ],
      children: [],
    });

    /* Both are terms of the vocabulary, the child under the parent. */
    const after = (await call("term_list", { records: true })).data as {
      terms: Array<Record<string, unknown>>;
    };
    expect(after.terms).toEqual(
      expect.arrayContaining([
        {
          slug: "christmas-cookies",
          label: "Christmas Cookies",
          count: 5,
          record: true,
        },
        {
          slug: "linzer",
          label: "Linzer",
          count: 3,
          parent: "christmas-cookies",
          record: true,
        },
      ]),
    );

    const strip = await call("featured_list", {});
    expect(strip.data.total).toBe(1);
    expect(
      (strip.data.featured as Array<Record<string, unknown>>)[0],
    ).toMatchObject({
      slug: "christmas-cookies-strip",
      term: "christmas-cookies",
      name: "Christmas Cookies",
    });

    /* --- 7. Collections are terms now (24-D5) ----------------------- */

    /*
     * Nothing above made a group, and a *collection* group can no longer be
     * made: the tool's own schema refuses it before dispatch, in the SDK's
     * shape (T28), naming the replacement.
     */
    const collection = await client.callTool({
      name: "group_create",
      arguments: {
        group: { name: "Christmas Cookies", kind: "collection" },
      },
    });
    expect(collection.isError).toBe(true);
    expect((collection.content as { text: string }[])[0].text).toContain(
      "term_create",
    );
    expect((await call("group_list", {})).data.total).toBe(0);

    /* The distractor is exactly where it was: tagged nothing, indexed still. */
    expect(await searchSlugs("chili")).toEqual({
      total: 1,
      slugs: ["weeknight-chili"],
    });
  }, 30_000);
});
