// @vitest-environment node
//
// The Christmas-Cookies user story, replayed over the tools (23f/D30).
//
// The ask that drove this epic, in the user's words:
//
//   "Organize the cluster of cookie recipes into one featured group called
//    Christmas Cookies, then combine the linzer cookie recipes into a group
//    that is accessible both at the top level and inside Christmas Cookies."
//
// `mcp.test.ts` proves each tool does what its description says on a corpus it
// builds itself. What is only provable end to end is that the *sequence* an
// agent would run — find the cluster, group it, feature it, group a subset,
// nest the subset, read both back — lands the shape the ask describes, on a
// corpus nobody tuned per assertion. So this runs against the committed
// `christmas-cookies` fixture, whose eight cookies and two deliberate
// distractors are the whole point (D29): a search that widens by one recipe
// fails here rather than in a person's content repo.
//
// No model is in the loop. The skill tells an agent which tools to call; this
// pins that those calls, in that order, still work. The headless run in
// `.claude/skills/recipe-curator/examples.md` is the other half.

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

describe("the Christmas-Cookies story, over the MCP tools", () => {
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
    const { data } = await call("recipe_search", { query });
    return {
      total: data.total,
      slugs: (data.recipes as Array<{ slug: string }>).map((row) => row.slug),
    };
  }

  it("finds the cluster, groups it, features it, and nests the linzer subset", async () => {
    /* --- 1. What is here ------------------------------------------- */

    /*
     * First call of the run, and deliberately a read of a *derived* record:
     * the tag aggregate is committed with the fixture, so a non-empty answer
     * is proof the copy carried its indexes and nothing rebuilt them.
     */
    const tags = (await call("tag_list", {})).data.tags as string[];
    expect(tags).toContain("cookies");
    expect(tags).toContain("christmas");

    /*
     * The cluster is eight, in date order, and neither distractor is in it
     * — the assertion the fixture exists for (T66). Free text is
     * prefix-at-word-start with the *query* as the prefix, so "cookie"
     * finds "cookies" and the chili and the banana bread, which carry no
     * such word in name, description, tags or ingredients, stay out.
     */
    expect(await searchSlugs("cookie")).toEqual({ total: 8, slugs: COOKIES });
    expect(await searchSlugs("linzer")).toEqual({ total: 3, slugs: LINZER });
    expect((await searchSlugs("tag:cookies")).total).toBe(8);

    /* --- 2. The parent collection ---------------------------------- */

    const parent = await call("group_create", {
      group: {
        name: "Christmas Cookies",
        kind: "collection",
        description: "Everything that comes out of the oven in December.",
        items: COOKIES,
      },
    });
    expect(parent.isError).toBe(false);
    expect(parent.data).toMatchObject({ slug: "christmas-cookies" });
    /*
     * The local backend is not `inProcess`, so `afterWrite` fires and the
     * write answers with the stale-editor hint — the inverse of T53, and the
     * line the skill tells an agent to restate in plain words.
     */
    expect(parent.data.warnings).toEqual([
      expect.stringContaining(STALE_EDITOR_HINT),
    ]);

    /* --- 3. On the homepage ---------------------------------------- */

    /* Explicit `slug`: the default has one-second resolution (T26). */
    const featured = await call("feature", {
      group: "christmas-cookies",
      slug: "christmas-cookies-strip",
    });
    expect(featured.isError).toBe(false);
    expect(featured.data).toMatchObject({
      slug: "christmas-cookies-strip",
      group: "christmas-cookies",
    });

    /* --- 4. The child collection ------------------------------------ */

    const child = await call("group_create", {
      group: {
        name: "Linzer Cookies",
        kind: "collection",
        description: "Jam between two almond cookies, three ways.",
        items: LINZER,
      },
    });
    expect(child.isError).toBe(false);
    expect(child.data).toMatchObject({ slug: "linzer-cookies" });

    /* --- 5. Nest the child, and refuse the cycle -------------------- */

    /*
     * The second half of the ask: the linzer group replaces its three
     * members inside the parent, so it is reachable from Christmas Cookies
     * *and* from /groups. `group_set_items` takes a `{group}` item like any
     * other, which is the one-call way to do both edits at once.
     */
    const nested = await call("group_set_items", {
      group: "christmas-cookies",
      items: [...NOT_LINZER, { group: "linzer-cookies", label: "Linzer" }],
    });
    expect(nested.isError).toBe(false);

    /* And the other direction is a cycle, reported as one and final. */
    expect(
      await callError("group_add_item", {
        group: "linzer-cookies",
        subgroup: "christmas-cookies",
      }),
    ).toMatchObject({
      code: "group_cycle",
      groups: ["linzer-cookies", "christmas-cookies", "linzer-cookies"],
    });

    /* --- 6. Read back what the user asked for ----------------------- */

    const parentItems = (await call("group_get", { slug: "christmas-cookies" }))
      .data.items as Array<Record<string, unknown>>;
    expect(parentItems).toEqual([
      ...NOT_LINZER.map((slug) => ({
        recipe: slug,
        name: expect.any(String),
      })),
      {
        group: "linzer-cookies",
        label: "Linzer",
        name: "Linzer Cookies",
        kind: "collection",
      },
    ]);
    /* Every row resolved: nothing dangling behind the nesting. */
    expect(parentItems.some((item) => "missing" in item)).toBe(false);

    const childItems = (await call("group_get", { slug: "linzer-cookies" }))
      .data.items as Array<Record<string, unknown>>;
    expect(childItems.map((item) => item.recipe)).toEqual(LINZER);
    expect(childItems.some((item) => "missing" in item)).toBe(false);

    /* Both groups are top-level rows, which is "accessible at the top level". */
    const groups = await call("group_list", {});
    expect(groups.data.total).toBe(2);
    expect(groups.data.groups).toEqual([
      expect.objectContaining({
        slug: "linzer-cookies",
        name: "Linzer Cookies",
        kind: "collection",
        itemCount: 3,
      }),
      expect.objectContaining({
        slug: "christmas-cookies",
        name: "Christmas Cookies",
        kind: "collection",
        itemCount: 6,
      }),
    ]);

    const strip = await call("featured_list", {});
    expect(strip.data.total).toBe(1);
    expect(
      (strip.data.featured as Array<Record<string, unknown>>)[0],
    ).toMatchObject({
      slug: "christmas-cookies-strip",
      group: "christmas-cookies",
      name: "Christmas Cookies",
    });

    /* The distractor is exactly where it was: grouped nothing, indexed still. */
    expect(await searchSlugs("chili")).toEqual({
      total: 1,
      slugs: ["weeknight-chili"],
    });
  }, 30_000);
});
