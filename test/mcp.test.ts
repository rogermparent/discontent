// @vitest-environment node
//
// The MCP registry, driven the way a client drives it (23b/D13).
//
// `curation.test.ts` already proves the layer underneath does the right thing,
// so nothing here re-checks that a recipe lands on disk. What is worth pinning
// is everything the *tool wrapper* adds and nothing else covers: that the tool
// list is exactly what it claims to be, that rows come back compact and
// `fields` opens them up again, that a failure from below arrives as the same
// `{error: {code}}` object the CLI prints — and that a failure from *above*,
// which the SDK rejects before dispatch, does not (T28).
//
// The transport is `InMemoryTransport`, so this is the registry over a real
// protocol conversation without a process. `mcpStdio.test.ts` is the other
// half: a real process, proving stdout purity.

import { mkdtemp, rm, writeFile } from "fs-extra";
import { tmpdir } from "os";
import { join } from "path";
import simpleGit from "simple-git";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";

import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";
import {
  sentPhotoKey,
  standInChat,
} from "../websites/recipe-website/editor/playwright/fixtures/llm/standInModel";

import {
  createLocalBackend,
  STALE_EDITOR_HINT,
} from "../websites/recipe-website/editor/cli/backend/local";
import { resolveBackendConfig } from "../websites/recipe-website/editor/cli/backend/resolve";
import { MISSING_INDEX_WARNING } from "../websites/recipe-website/editor/controller/curation/importList";
import {
  TOOL_NAMES,
  createRecipeServer,
} from "../websites/recipe-website/editor/mcp/registry";

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

describe("the MCP registry over an in-memory transport", () => {
  let contentDirectory: string;
  let previousContentDirectory: string | undefined;
  let backend: ReturnType<typeof createLocalBackend>;
  let server: ReturnType<typeof createRecipeServer>;
  let client: Client;

  beforeEach(async () => {
    contentDirectory = await mkdtemp(join(tmpdir(), "mcp-"));
    /*
     * The tmpdir is not a git repository, so `commitContentChanges` no-ops and
     * `assertCommitIdentity` has nothing to check — the same arrangement
     * `curation.test.ts` uses. Setting the env as well only covers a
     * regression that reached for the ambient directory.
     */
    previousContentDirectory = process.env.CONTENT_DIRECTORY;
    process.env.CONTENT_DIRECTORY = contentDirectory;

    backend = createLocalBackend({ contentDirectory });
    server = createRecipeServer(backend);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: "mcp-test", version: "0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
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

  /** A tool call's `structuredContent`, which every tool here sets. */
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

  /** The `{error: …}` half, for the cases that expect a curation failure. */
  async function callError(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const { isError, data } = await call(name, args);
    expect(isError).toBe(true);
    return (data as { error: Record<string, unknown> }).error;
  }

  async function createCake(overrides: Record<string, unknown> = {}) {
    return call("recipe_create", {
      recipe: {
        name: "Chocolate Cake",
        tags: ["Dessert"],
        description: "Rich and dark.",
        ingredients: ["2 cups flour", "1 cup cocoa"],
        totalTime: 90,
        prepTime: 20,
        ...overrides,
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* 1. The advertised surface                                         */
  /* ---------------------------------------------------------------- */

  it("advertises only the read-only tools to a read-scoped session (27b)", async () => {
    const readOnly = createRecipeServer(backend, { readOnly: true });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const reader = new Client({ name: "mcp-read-test", version: "0" });
    await Promise.all([
      readOnly.connect(serverTransport),
      reader.connect(clientTransport),
    ]);
    try {
      const { tools } = await reader.listTools();
      const names = tools.map((tool) => tool.name);
      expect(names.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      }
      expect(names).toEqual(
        expect.arrayContaining([
          "recipe_search",
          "recipe_get",
          "git_status",
          "git_fetch",
        ]),
      );
      for (const write of [
        "recipe_create",
        "git_pull",
        "git_push",
        "reindex",
      ]) {
        expect(names).not.toContain(write);
      }
      /* And the full list is exactly the read-only half plus the rest. */
      const { tools: all } = await client.listTools();
      expect(
        all.filter((tool) => tool.annotations?.readOnlyHint === true).length,
      ).toBe(names.length);
    } finally {
      await reader.close();
      await readOnly.close();
    }
  });

  it("advertises exactly the tools it claims to, strictly typed", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);

    const create = tools.find((tool) => tool.name === "recipe_create");
    const schema = create?.inputSchema as {
      additionalProperties?: unknown;
      properties?: Record<string, { properties?: Record<string, unknown> }>;
    };
    /* `strictObject` all the way down: a typo'd key is a rejection, not a write. */
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties?.recipe.properties?.name).toBeDefined();
    /* A transformed schema (25a) still advertises its input shape. */
    expect(schema.properties?.recipe.properties?.drink).toMatchObject({
      additionalProperties: false,
      properties: { method: { enum: ["shake", "stir", "build", "blend"] } },
    });

    expect(
      tools.find((tool) => tool.name === "recipe_search")?.annotations,
    ).toMatchObject({ readOnlyHint: true });
    expect(
      tools.find((tool) => tool.name === "recipe_delete")?.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });

    /*
     * The eight term tools (31c, epic 31 D5): two reads, four writes that keep
     * every term, and the two that destroy a record.
     */
    const annotationsOf = (name: string) =>
      tools.find((tool) => tool.name === name)?.annotations;
    for (const name of ["term_list", "term_get"]) {
      expect(annotationsOf(name), name).toMatchObject({ readOnlyHint: true });
    }
    for (const name of [
      "term_create",
      "term_update",
      "term_assign",
      "term_rename",
    ]) {
      expect(annotationsOf(name), name).toMatchObject({ readOnlyHint: false });
      expect(annotationsOf(name)?.destructiveHint, name).toBeUndefined();
    }
    for (const name of ["term_delete", "term_merge"]) {
      expect(annotationsOf(name), name).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
      });
    }
  });

  it("extends tag_list additively with the term rows (31c)", async () => {
    await createCake();
    /* `{}` answers exactly what it always has. */
    expect((await call("tag_list", {})).data).toEqual({ tags: ["dessert"] });
    expect((await call("tag_list", { terms: true })).data).toEqual({
      tags: ["dessert"],
      terms: [{ slug: "dessert", label: "dessert", count: 1, record: false }],
    });

    /* And a term failure arrives in the layer's own shape. */
    await call("term_create", { term: { label: "Dessert" } });
    await call("term_create", { term: { label: "Cake", parent: "dessert" } });
    expect(
      await callError("term_update", {
        slug: "dessert",
        patch: { parent: "cake" },
      }),
    ).toMatchObject({
      code: "term_cycle",
      terms: ["dessert", "cake", "dessert"],
    });
    expect(await callError("term_delete", { slug: "dessert" })).toMatchObject({
      code: "term_in_use",
      recipes: ["chocolate-cake"],
    });
  });

  /* ---------------------------------------------------------------- */
  /* 2. Create, then search compactly                                  */
  /* ---------------------------------------------------------------- */

  it("creates a recipe, warns that the editor is stale, and searches compactly", async () => {
    const created = await createCake();
    expect(created.isError).toBe(false);
    expect(created.data.slug).toBe("chocolate-cake");
    /* The CLI prints this on stderr; a tool has to put it on the result (D13). */
    expect(created.data.warnings).toEqual([
      expect.stringContaining(STALE_EDITOR_HINT),
    ]);

    const found = await call("recipe_search", { query: "chocolate" });
    expect(found.data.total).toBe(1);
    const [row] = found.data.recipes as Record<string, unknown>[];
    expect(row).toEqual({
      slug: "chocolate-cake",
      name: "Chocolate Cake",
      date: expect.any(Number),
      tags: ["dessert"],
      totalTime: 90,
    });

    const opened = await call("recipe_search", {
      query: "chocolate",
      fields: ["description", "ingredients"],
    });
    const [full] = opened.data.recipes as Record<string, unknown>[];
    expect(full.description).toBe("Rich and dark.");
    expect(full.ingredients).toEqual(["2 cups flour", "1 cup cocoa"]);
  });

  /* ---------------------------------------------------------------- */
  /* 3. Listing                                                        */
  /* ---------------------------------------------------------------- */

  it("lists compact rows, opens named fields and filters by tag", async () => {
    await createCake();

    const listed = await call("recipe_list", {});
    const [row] = listed.data.recipes as Record<string, unknown>[];
    expect(Object.keys(row).sort()).toEqual([
      "date",
      "name",
      "slug",
      "tags",
      "totalTime",
    ]);

    const withPrep = await call("recipe_list", { fields: ["prepTime"] });
    expect(
      (withPrep.data.recipes as Record<string, unknown>[])[0].prepTime,
    ).toBe(20);

    expect((await call("recipe_list", { tag: "dessert" })).data.total).toBe(1);
    expect((await call("recipe_list", { tag: "savoury" })).data.total).toBe(0);
  });

  /* ---------------------------------------------------------------- */
  /* 4. Getting one recipe                                             */
  /* ---------------------------------------------------------------- */

  it("returns a whole recipe, or exactly the fields asked for", async () => {
    await createCake();

    const whole = await call("recipe_get", { slug: "chocolate-cake" });
    expect(whole.data.url).toBe("/recipe/chocolate-cake");
    const recipe = whole.data.recipe as Record<string, unknown>;
    expect(recipe.name).toBe("Chocolate Cake");
    expect(recipe.ingredients).toBeDefined();

    const narrow = await call("recipe_get", {
      slug: "chocolate-cake",
      fields: ["name", "tags"],
    });
    expect(narrow.data.recipe).toEqual({
      name: "Chocolate Cake",
      tags: ["dessert"],
    });
  });

  /* ---------------------------------------------------------------- */
  /* 5. The two error shapes (T28)                                     */
  /* ---------------------------------------------------------------- */

  it("reports curation failures as the CLI's error object", async () => {
    expect(await callError("recipe_get", { slug: "ghost" })).toMatchObject({
      code: "not_found",
      slug: "ghost",
    });

    await createCake();
    expect(
      await callError("recipe_create", { recipe: { name: "Chocolate Cake" } }),
    ).toMatchObject({ code: "slug_conflict" });

    /* A curation-only failure, so the shape is guaranteed to be ours. */
    expect(await callError("feature", { group: "ghost" })).toMatchObject({
      code: "unknown_group",
      groups: ["ghost"],
    });
  });

  it("leaves input the schema rejects to the SDK, in the SDK's own shape", async () => {
    /*
     * Pinned as observed rather than as designed: this text is the SDK's, not
     * ours, and the point of the case is that a caller sees *something*
     * actionable and that `toErrorObject` was never reached — there is no
     * `structuredContent` and no `error.code` here.
     */
    const result = await client.callTool({
      name: "recipe_create",
      arguments: { recipe: { name: "x", bogus: 1 } },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect((result.content as { text: string }[])[0].text).toBe(
      'Input validation error: Invalid arguments for tool recipe_create: recipe: Unrecognized key: "bogus"',
    );
  });

  /* ---------------------------------------------------------------- */
  /* 6. The Christmas-Cookies shape, end to end                        */
  /* ---------------------------------------------------------------- */

  it("builds a group, features it, and reads both back", async () => {
    await createCake();

    const group = await call("group_create", {
      group: { name: "Christmas Cookies", kind: "meal-plan" },
    });
    expect(group.data.slug).toBe("christmas-cookies");

    await call("group_add_item", {
      group: "christmas-cookies",
      recipe: "chocolate-cake",
      label: "Mon · Dessert",
    });

    /* An explicit slug, because two features in one second collide (T26). */
    const featured = await call("feature", {
      group: "christmas-cookies",
      slug: "xmas",
    });
    expect(featured.data).toMatchObject({
      slug: "xmas",
      group: "christmas-cookies",
    });

    const strip = await call("featured_list", {});
    expect(strip.data.total).toBe(1);
    expect((strip.data.featured as Record<string, unknown>[])[0]).toMatchObject(
      {
        slug: "xmas",
        group: "christmas-cookies",
        name: "Christmas Cookies",
      },
    );

    const detail = await call("group_get", { slug: "christmas-cookies" });
    expect(detail.data.items).toEqual([
      {
        recipe: "chocolate-cake",
        label: "Mon · Dessert",
        name: "Chocolate Cake",
      },
    ]);
  });

  /* Epic 32, D4: a recipe row's multiplier, on both item-writing tools. */
  it("adds and sets items with a scale, and refuses a bad one", async () => {
    await createCake();
    await call("group_create", { group: { name: "Week One" } });

    const added = await call("group_add_item", {
      group: "week-one",
      recipe: "chocolate-cake",
      label: "Sat",
      scale: "2",
    });
    expect(added.isError).toBe(false);
    expect((await call("group_get", { slug: "week-one" })).data.items).toEqual([
      {
        recipe: "chocolate-cake",
        label: "Sat",
        scale: "2",
        name: "Chocolate Cake",
      },
    ]);

    await call("group_set_items", {
      group: "week-one",
      items: [
        "chocolate-cake:Sun@1/2",
        { recipe: "chocolate-cake", scale: "3" },
      ],
    });
    expect(
      (
        (await call("group_get", { slug: "week-one" })).data.items as Record<
          string,
          unknown
        >[]
      ).map(({ label, scale }) => ({ label, scale })),
    ).toEqual([
      { label: "Sun", scale: "1/2" },
      { label: undefined, scale: "3" },
    ]);

    /* The tool schema's own refine: rejected before dispatch (T28). */
    const zero = await client.callTool({
      name: "group_add_item",
      arguments: { group: "week-one", recipe: "chocolate-cake", scale: "0" },
    });
    expect(zero.isError).toBe(true);
    expect((zero.content as { text: string }[])[0].text).toContain(
      "Scale must be a positive number, like 2, 1/2 or 1.5",
    );

    /* The shorthand's scale is the seat's check, in the layer's shape. */
    expect(
      await callError("group_set_items", {
        group: "week-one",
        items: ["chocolate-cake@-1"],
      }),
    ).toMatchObject({
      code: "validation",
      issues: [{ path: "items.0.scale" }],
    });
  });

  it("refuses a group item naming no recipe, and warns when forced", async () => {
    await call("group_create", { group: { name: "Week One" } });

    expect(
      await callError("group_add_item", { group: "week-one", recipe: "ghost" }),
    ).toMatchObject({ code: "unknown_recipe", recipes: ["ghost"] });

    const forced = await call("group_add_item", {
      group: "week-one",
      recipe: "ghost",
      force: true,
    });
    expect(forced.isError).toBe(false);
    /* Both sources of warning, merged into one array (D13). */
    expect(forced.data.warnings).toEqual([
      expect.stringContaining("ghost"),
      expect.stringContaining(STALE_EDITOR_HINT),
    ]);
  });

  /* ---------------------------------------------------------------- */
  /* 6b. Nested groups (23c)                                           */
  /* ---------------------------------------------------------------- */

  it("nests one group inside another and reads it back resolved", async () => {
    await call("group_create", {
      group: { name: "Week One", kind: "meal-plan" },
    });
    await call("group_create", { group: { name: "Spring Menus" } });

    const added = await call("group_add_item", {
      group: "spring-menus",
      subgroup: "week-one",
      label: "Week 1",
    });
    expect(added.isError).toBe(false);

    expect(
      (await call("group_get", { slug: "spring-menus" })).data.items,
    ).toEqual([
      {
        group: "week-one",
        label: "Week 1",
        name: "Week One",
        kind: "meal-plan",
      },
    ]);

    /* And `group_set_items` takes the same `{group}` object (the free upgrade). */
    await call("group_set_items", {
      group: "spring-menus",
      items: [{ group: "week-one", label: "Week 1 again" }],
    });
    expect(
      (
        (await call("group_get", { slug: "spring-menus" })).data
          .items as Record<string, unknown>[]
      )[0].label,
    ).toBe("Week 1 again");

    const removed = await call("group_remove_item", {
      group: "spring-menus",
      subgroup: "week-one",
    });
    expect(removed.isError).toBe(false);
    expect(
      (await call("group_get", { slug: "spring-menus" })).data.items,
    ).toEqual([]);
  });

  it("refuses a cycle, and reports the XOR miss in the SDK's shape", async () => {
    await call("group_create", { group: { name: "Week One" } });
    await call("group_create", { group: { name: "Spring Menus" } });
    await call("group_add_item", {
      group: "spring-menus",
      subgroup: "week-one",
    });

    /* A curation-layer failure, so it arrives as `{error: {code}}` (T28). */
    expect(
      await callError("group_add_item", {
        group: "week-one",
        subgroup: "spring-menus",
      }),
    ).toMatchObject({
      code: "group_cycle",
      groups: ["week-one", "spring-menus", "week-one"],
    });

    /*
     * The XOR, on the other hand, is the tool schema's own refine — rejected
     * before dispatch, in the SDK's shape and with no `structuredContent` at
     * all (T28/T37). Pinned verbatim, because an agent reading the text is the
     * only thing that tells it what to send next.
     */
    const both = await client.callTool({
      name: "group_add_item",
      arguments: {
        group: "spring-menus",
        recipe: "chocolate-cake",
        subgroup: "week-one",
      },
    });
    expect(both.isError).toBe(true);
    expect(both.structuredContent).toBeUndefined();
    expect((both.content as { text: string }[])[0].text).toBe(
      "Input validation error: Invalid arguments for tool group_add_item: recipe: Name exactly one of `recipe` or `subgroup`",
    );

    const neither = await client.callTool({
      name: "group_add_item",
      arguments: { group: "spring-menus" },
    });
    expect(neither.isError).toBe(true);
    expect((neither.content as { text: string }[])[0].text).toBe(
      "Input validation error: Invalid arguments for tool group_add_item: recipe: Name exactly one of `recipe` or `subgroup`",
    );
  });

  /* ---------------------------------------------------------------- */
  /* 7. Tags                                                           */
  /* ---------------------------------------------------------------- */

  it("lists the corpus's tags, and nothing at all when there are none", async () => {
    expect((await call("tag_list", {})).data).toEqual({ tags: [] });
    await createCake();
    expect((await call("tag_list", {})).data).toEqual({ tags: ["dessert"] });
  });

  /* ---------------------------------------------------------------- */
  /* 8. Group patches                                                  */
  /* ---------------------------------------------------------------- */

  it("renames a group through a patch, and refuses an items key", async () => {
    await call("group_create", { group: { name: "Christmas Cookies" } });

    const renamed = await call("group_update", {
      slug: "christmas-cookies",
      patch: { slug: "xmas-cookies", description: "The good ones." },
    });
    expect(renamed.data).toMatchObject({ slug: "xmas-cookies" });
    expect(
      await callError("group_get", { slug: "christmas-cookies" }),
    ).toMatchObject({ code: "not_found" });
    expect(
      (
        (await call("group_get", { slug: "xmas-cookies" })).data.group as {
          description?: string;
        }
      ).description,
    ).toBe("The good ones.");

    /*
     * `items` is not on `GroupPatchSchema` (D4), so a patch that would wipe a
     * meal plan is rejected — by the SDK, before dispatch, in its shape (T28).
     */
    const wiped = await client.callTool({
      name: "group_update",
      arguments: { slug: "xmas-cookies", patch: { items: [] } },
    });
    expect(wiped.isError).toBe(true);
    expect((wiped.content as { text: string }[])[0].text).toContain(
      'Unrecognized key: "items"',
    );
  });

  /* ---------------------------------------------------------------- */
  /* 9. Deletes                                                        */
  /* ---------------------------------------------------------------- */

  it("deletes a recipe and unfeatures an entry", async () => {
    await createCake();
    expect(
      (await call("recipe_delete", { slug: "chocolate-cake" })).data,
    ).toMatchObject({ slug: "chocolate-cake", deleted: true });
    expect((await call("recipe_list", {})).data.total).toBe(0);

    await call("group_create", { group: { name: "Week One" } });
    await call("feature", { group: "week-one", slug: "w1" });
    expect((await call("unfeature", { slug: "w1" })).data).toMatchObject({
      slug: "w1",
      deleted: true,
    });
    expect((await call("featured_list", {})).data.total).toBe(0);
  });

  /* ---------------------------------------------------------------- */
  /* 10. Reindex                                                       */
  /* ---------------------------------------------------------------- */

  it("rebuilds indexes, and names the types it knows", async () => {
    const all = await call("reindex", {});
    expect(all.isError).toBe(false);
    expect((all.data.rebuilt as string[]).length).toBeGreaterThan(0);

    expect(await callError("reindex", { contentType: "bogus" })).toMatchObject({
      code: "not_found",
    });
  });

  /* ---------------------------------------------------------------- */
  /* 11. Inventory (25d)                                               */
  /* ---------------------------------------------------------------- */

  it("keeps the shared inventory and says what it makes", async () => {
    await call("recipe_create", {
      recipe: {
        name: "Gin and Tonic",
        tags: ["drink"],
        ingredients: ["2 oz gin", "Tonic water, to top"],
      },
    });

    expect((await call("inventory_get")).data).toMatchObject({ items: [] });

    const added = await call("inventory_add", { items: ["gin", "Gnista"] });
    expect(added.isError).toBe(false);
    expect(added.data).toMatchObject({
      items: ["gin", "Gnista"],
      added: ["gin", "Gnista"],
      changed: true,
    });
    /* Nothing caches the list, so there is no stale editor to warn about. */
    expect(added.data.warnings).toBeUndefined();

    /* Every recipe by default (32j); `tag:drink` narrows. */
    const before = await call("inventory_makeable", {});
    expect(before.data).toMatchObject({
      query: "",
      oneAway: expect.arrayContaining([
        {
          slug: "gin-and-tonic",
          name: "Gin and Tonic",
          missing: ["tonic water"],
        },
      ]),
    });
    /* 42m: the bean-swap tier is on by default, and `beanSwaps: false` drops it. */
    expect(before.data).toMatchObject({ beanSwaps: true, beanSwap: [] });
    const noSwaps = await call("inventory_makeable", { beanSwaps: false });
    expect(noSwaps.isError).toBe(false);
    expect(noSwaps.data.beanSwaps).toBe(false);
    expect(noSwaps.data).not.toHaveProperty("beanSwap");
    const drinks = await call("inventory_makeable", { query: "tag:drink" });
    expect(drinks.data).toMatchObject({
      query: "tag:drink",
      oneAway: [{ slug: "gin-and-tonic", missing: ["tonic water"] }],
    });
    /* 41i: featuring, as /make does — gin keeps the G&T, vodka nothing. */
    const featured = await call("inventory_makeable", {
      query: "tag:drink",
      feature: ["gin"],
    });
    expect(featured.data).toMatchObject({
      scope: "tag:drink ingredient:gin",
      features: ["gin"],
      link: expect.stringMatching(/\/make\?q=tag%3Adrink\+ingredient%3Agin$/),
      total: 1,
      oneAway: [{ slug: "gin-and-tonic" }],
    });
    expect(
      (await call("inventory_makeable", { feature: ["vodka"] })).data,
    ).toMatchObject({ total: 0, canMake: [], oneAway: [] });

    await call("inventory_add", { items: ["tonic"] });
    await call("inventory_remove", { items: ["Gnista"] });
    const after = await call("inventory_makeable", { query: "tag:drink" });
    expect(after.data).toMatchObject({
      inventory: 2,
      canMake: [{ slug: "gin-and-tonic", name: "Gin and Tonic" }],
    });

    const replaced = await call("inventory_set", { items: ["vodka"] });
    expect(replaced.data).toMatchObject({
      items: ["vodka"],
      removed: ["gin", "tonic"],
    });

    /* The tool's own schema refuses it, in the SDK's shape (T28). */
    const tooLong = await client.callTool({
      name: "inventory_add",
      arguments: { items: ["x".repeat(81)] },
    });
    expect(tooLong.isError).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /* 12. Shopping list (35c)                                           */
  /* ---------------------------------------------------------------- */

  it("keeps the shopping list: add, read by store, tick by name, remove, clear", async () => {
    await createCake();
    const { tools } = await client.listTools();
    const annotationsOf = (name: string) =>
      tools.find((tool) => tool.name === name)?.annotations;
    expect(annotationsOf("shopping_get")).toMatchObject({ readOnlyHint: true });
    for (const name of ["shopping_add", "shopping_check", "shopping_remove"]) {
      expect(annotationsOf(name), name).toMatchObject({ readOnlyHint: false });
      expect(annotationsOf(name)?.destructiveHint, name).toBeUndefined();
    }
    expect(annotationsOf("shopping_clear")).toMatchObject({
      destructiveHint: true,
    });

    const added = await call("shopping_add", {
      recipe: "chocolate-cake",
      scale: "1/2",
    });
    expect(added.isError).toBe(false);
    expect(added.data).toMatchObject({ changed: true });
    expect(added.data.warnings).toBeUndefined();
    await call("shopping_add", { items: ["2 lemons"] });

    const all = await call("shopping_get");
    expect(all.data.text).toBe(
      "Produce:\n2 lemons\n\nPantry:\n1 cup flour\n½ cup cocoa",
    );
    const atMarketBasket = await call("shopping_get", {
      store: "market-basket",
    });
    expect(atMarketBasket.data.text).toBe(
      "MARKET BASKET\n\nProduce:\n2 lemons",
    );

    const ticked = await call("shopping_check", { names: ["lemons", "kale"] });
    expect(ticked.data).toMatchObject({ changed: true, unmatched: ["kale"] });
    expect((await call("shopping_get")).data.text).toBe(
      "Pantry:\n1 cup flour\n½ cup cocoa",
    );
    await call("shopping_check", { names: ["lemon"], uncheck: true });

    const removed = await call("shopping_remove", { recipe: "chocolate-cake" });
    expect(removed.data).toMatchObject({ changed: true });
    expect((await call("shopping_get")).data.text).toBe("Produce:\n2 lemons");

    /* Two sources at once: the tool's own schema refuses it (T28). */
    const both = await client.callTool({
      name: "shopping_remove",
      arguments: { recipe: "a", group: "b" },
    });
    expect(both.isError).toBe(true);
    expect((await callError("shopping_add", { recipe: "nope" })).code).toBe(
      "unknown_recipe",
    );

    await call("shopping_check", { names: ["lemon"] });
    const cleared = await call("shopping_clear", {});
    expect(cleared.data).toMatchObject({ changed: true, items: [] });

    const settings = await call("shopping_settings_set", {
      features: { aisles: false },
    });
    expect(settings.data).toMatchObject({
      changed: true,
      settings: { features: { aisles: false } },
    });
  });

  /*
   * 40c: `for` on the existing `shopping_remove` (39-Dc3) — what a sub-recipe's
   * expansion added goes, the linking recipe's own lines stay. No new tool.
   */
  it("removes what a sub-recipe added with `for`, keeping the recipe's own lines", async () => {
    await call("recipe_create", {
      recipe: {
        name: "Simple Syrup",
        ingredients: ["1/2 cup sugar", "1/2 cup water"],
      },
    });
    await call("recipe_create", {
      recipe: {
        name: "Lemonade",
        ingredients: [
          "1 cup lemon juice",
          "1 batch [Simple Syrup](/recipe/simple-syrup)",
        ],
      },
    });
    const added = await call("shopping_add", { recipe: "lemonade" });
    expect(added.data).toMatchObject({ changed: true });
    expect((added.data.items as unknown[]).length).toBe(3);

    const removed = await call("shopping_remove", { for: "simple-syrup" });
    expect(removed.isError).toBe(false);
    expect(removed.data).toMatchObject({ changed: true });
    expect(removed.data.removed as unknown[]).toHaveLength(2);
    expect(
      (removed.data.items as { text: string }[]).map((item) => item.text),
    ).toEqual(["1 cup lemon juice"]);

    /* Nothing left that the syrup added: a no-op, not an error. */
    const again = await call("shopping_remove", { for: "simple-syrup" });
    expect(again.data).toMatchObject({ changed: false });

    /* `for` with another source: the tool's own schema refuses it. */
    const both = await client.callTool({
      name: "shopping_remove",
      arguments: { recipe: "lemonade", for: "simple-syrup" },
    });
    expect(both.isError).toBe(true);
    expect(
      (await client.listTools()).tools.find(
        (tool) => tool.name === "shopping_remove",
      )?.inputSchema.properties,
    ).toHaveProperty("for");
    expect(TOOL_NAMES).toHaveLength(57);
  });

  /* ---------------------------------------------------------------- */
  /* 26b: page_inspect, dry runs, recipe_set_image                     */
  /* ---------------------------------------------------------------- */

  it("inspects a page without writing, and dry-runs a create without a warning", async () => {
    const page = [
      "<html><head>",
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "Recipe",
        name: "Naan",
        recipeIngredient: ["1 1/2 cups flour"],
        image: "https://cdn.example.com/naan.jpg",
      })}</script>`,
      "</head></html>",
    ].join("");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "HEAD"
          ? new Response(null, { headers: { "content-type": "image/jpeg" } })
          : new Response(page, { headers: { "content-type": "text/html" } }),
      ),
    );
    try {
      const inspected = await call("page_inspect", {
        url: "https://www.example.com/naan",
      });
      expect(inspected.isError).toBe(false);
      expect(inspected.data).toMatchObject({
        partial: false,
        draft: {
          name: "Naan",
          ingredients: ["1 1/2 cups flour"],
          imageImportUrl: "https://cdn.example.com/naan.jpg",
        },
        images: [{ url: "https://cdn.example.com/naan.jpg", from: "jsonld" }],
      });

      const dry = await call("recipe_create", {
        recipe: inspected.data.draft as Record<string, unknown>,
        dryRun: true,
      });
      expect(dry.isError).toBe(false);
      expect(dry.data).toMatchObject({
        dryRun: true,
        slug: "naan",
        conflict: false,
        recipe: { image: "naan.jpg" },
      });
      /* Nothing was written, so nothing is stale. */
      expect(dry.data.warnings).toBeUndefined();
      expect((await call("recipe_list")).data.total).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /* 36b: the local model's mode on the import tools; tool count unchanged. */
  it("passes llm through page_inspect and refuses a mode that is not one (36b)", async () => {
    const model = "http://model.test:11434";
    const page = [
      "<html><head><title>Old Scones</title></head><body><article>",
      "<h1>Old Scones</h1><ul><li>2 cups flour</li><li>3/4 cup cream</li></ul>",
      "<p>Stir together and bake.</p></article></body></html>",
    ].join("");
    vi.stubEnv("RECIPE_LLM_URL", model);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input).startsWith(model)
          ? new Response(
              JSON.stringify({
                model: "qwen3:8b",
                done: true,
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    found: true,
                    name: "Old Scones",
                    ingredients: ["2 cups flour", "3/4 cup cream"],
                    instructions: ["Stir together and bake."],
                  }),
                },
              }),
              { headers: { "content-type": "application/json" } },
            )
          : new Response(page, { headers: { "content-type": "text/html" } }),
      ),
    );
    try {
      const auto = await call("page_inspect", {
        url: "https://www.example.com/old-scones",
      });
      expect(auto.isError).toBe(false);
      expect(auto.data).toMatchObject({
        partial: false,
        llm: { model: "qwen3:8b", mode: "auto", grounded: 2, total: 2 },
        draft: { ingredients: ["2 cups flour", "3/4 cup cream"] },
      });

      const off = await call("page_inspect", {
        url: "https://www.example.com/old-scones",
        llm: "off",
      });
      expect(off.data).toMatchObject({ partial: true });
      expect(off.data.llm).toBeUndefined();

      const bad = await call("recipe_import", {
        url: "https://www.example.com/old-scones",
        dryRun: true,
        llm: "always",
      });
      expect(bad.isError).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  /* 36c: pasted text through recipe_import — no new tool. */
  it("imports pasted text through recipe_import, exactly one of url or text (36c)", async () => {
    const model = "http://model.test:11434";
    vi.stubEnv("RECIPE_LLM_URL", model);
    const fetchStub = vi.fn(async (input: string | URL) =>
      String(input).startsWith(model)
        ? new Response(
            JSON.stringify({
              model: "qwen3:8b",
              done: true,
              message: {
                role: "assistant",
                content: JSON.stringify({
                  found: true,
                  name: "Old Scones",
                  ingredients: ["2 cups flour", "3/4 cup cream"],
                  instructions: ["Stir together and bake."],
                }),
              },
            }),
            { headers: { "content-type": "application/json" } },
          )
        : new Response("not here", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchStub);
    const text = [
      "Old Scones — subscribe! https://example.com/subscribe",
      "2 cups flour",
      "3/4 cup cream",
      "Stir together and bake.",
    ].join("\n");
    try {
      const dry = await call("recipe_import", {
        text,
        source: "https://www.youtube.com/watch?v=OLD1",
        dryRun: true,
      });
      expect(dry.isError).toBe(false);
      expect(dry.data).toMatchObject({
        dryRun: true,
        pastedText: true,
        url: "https://www.youtube.com/watch?v=OLD1",
        video: "https://www.youtube.com/watch?v=OLD1",
        llm: { model: "qwen3:8b", mode: "force", grounded: 2, total: 2 },
        draft: {
          name: "Old Scones",
          ingredients: ["2 cups flour", "3/4 cup cream"],
        },
      });
      /* Only the model was asked: the source URL is never fetched. */
      expect(
        fetchStub.mock.calls.every(([url]) => String(url).startsWith(model)),
      ).toBe(true);

      /* The schema's refusals arrive in the SDK's own shape. */
      expect(
        (
          await call("recipe_import", {
            url: "https://www.example.com/old-scones",
            text,
          })
        ).isError,
      ).toBe(true);
      expect((await call("recipe_import", {})).isError).toBe(true);
      expect(
        (await call("recipe_import", { text, llm: "off", dryRun: true }))
          .isError,
      ).toBe(true);

      const created = await call("recipe_import", { text });
      expect(created.isError).toBe(false);
      expect(created.data).toMatchObject({ slug: "old-scones" });
      expect((await call("recipe_list")).data.total).toBe(1);

      vi.stubEnv("RECIPE_LLM_URL", "");
      expect(
        await callError("recipe_import", { text, dryRun: true }),
      ).toMatchObject({
        code: "import_failed",
        message: "no local model configured (RECIPE_LLM_URL)",
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  /* 38e: photos on recipe_import — local paths, no new tool. */
  it("imports from photo paths on recipe_import (38e)", async () => {
    const model = "http://model.test:11434";
    vi.stubEnv("RECIPE_LLM_URL", model);
    vi.stubEnv("RECIPE_LLM_VISION_MODEL", "qwen2.5vl:7b");
    const { default: sharp } = await import("sharp");
    const bytes = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#fbf6e9" },
    })
      .jpeg()
      .toBuffer();
    const card = join(contentDirectory, "..", `card-${Date.now()}.jpg`);
    await writeFile(card, bytes);
    const key = await sentPhotoKey(bytes);
    const transcripts = {
      [key]: "Old Scones\n2 cups flour\n3/4 cup cream\n\nStir and bake.",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) =>
        new URL(String(input)).pathname === "/api/chat"
          ? Response.json(
              standInChat(JSON.parse(String(init?.body)), { transcripts }),
            )
          : Response.json({}),
      ),
    );
    try {
      const dry = await call("recipe_import", { photos: [card], dryRun: true });
      expect(dry.isError).toBe(false);
      expect(dry.data).toMatchObject({
        dryRun: true,
        photos: 1,
        transcription: transcripts[key],
        draft: { name: "Old Scones" },
      });
      /* The schema's refusals: photos with text, more than four. */
      expect(
        (await call("recipe_import", { photos: [card], text: "x" })).isError,
      ).toBe(true);
      expect(
        (
          await call("recipe_import", {
            photos: [card, card, card, card, card],
          })
        ).isError,
      ).toBe(true);
      vi.stubEnv("RECIPE_LLM_VISION_MODEL", "");
      expect(
        await callError("recipe_import", { photos: [card], dryRun: true }),
      ).toMatchObject({
        code: "usage",
        message: expect.stringContaining("RECIPE_LLM_VISION_MODEL"),
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      await rm(card, { force: true });
    }
  });

  /* 36e: several recipes in one paste — pick / all, no new tool. */
  it("takes pick and all on recipe_import, and refuses to guess (36e)", async () => {
    const model = "http://model.test:11434";
    vi.stubEnv("RECIPE_LLM_URL", model);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL, init?: RequestInit) =>
        Response.json(standInChat(JSON.parse(String(init?.body)))),
      ),
    );
    const text = [
      "CAKE",
      "200g flour",
      "100g sugar",
      "",
      "Mix and bake.",
      "",
      "GLAZE",
      "100g icing sugar",
      "20g lemon juice",
      "",
      "Whisk and pour over the cake.",
    ].join("\n");
    try {
      const dry = await call("recipe_import", { text, dryRun: true });
      expect(dry.isError).toBe(false);
      expect(dry.data).toMatchObject({
        batch: true,
        dryRun: true,
        found: [
          { n: 1, name: "Cake" },
          { n: 2, name: "Glaze" },
        ],
      });
      const refused = await callError("recipe_import", { text });
      expect(refused.code).toBe("usage");
      expect(refused.message).toContain("1. Cake, 2. Glaze");
      /* pick and all together: the tool's own schema (T28). */
      expect(
        (await call("recipe_import", { text, pick: [1], all: true })).isError,
      ).toBe(true);
      const picked = await call("recipe_import", { text, pick: ["glaze"] });
      expect(picked.data).toMatchObject({
        batch: true,
        recipes: [{ n: 2, status: "imported", slug: "glaze" }],
      });
      const all = await call("recipe_import", { text, all: true });
      expect(all.data).toMatchObject({
        recipes: [
          { n: 1, status: "imported", slug: "cake" },
          { n: 2, status: "failed", error: { code: "slug_conflict" } },
        ],
      });
      expect((await call("recipe_list")).data.total).toBe(2);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  /* 34f: roundup import. Loopback URLs, so the default pacing never waits. */
  it("inspects a roundup and imports its picks with a term (34f)", async () => {
    const origin = "http://127.0.0.1:9";
    const card = (slug: string, name: string) =>
      `<div><a href="${origin}/r/${slug}/"><img src="${origin}/c/${slug}.jpg"></a><h2>${name}</h2></div>`;
    const list = [
      "<html><head><title>Pies | Test</title></head><body><article>",
      "<h1>Three Pies</h1><div class='entry-content'>",
      card("apple-pie", "Apple Pie"),
      card("pecan-pie", "Pecan Pie"),
      card("plum-pie", "Plum Pie"),
      "</div></article></body></html>",
    ].join("");
    const recipe = (name: string, slug: string) =>
      `<html><head><script type="application/ld+json">${JSON.stringify({
        "@type": "Recipe",
        name,
        recipeIngredient: ["1 crust"],
        image: `${origin}/img/${slug}.png`,
      })}</script></head></html>`;
    const fetchStub = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/img/")) {
        return new Response("png", {
          headers: { "content-type": "image/png" },
        });
      }
      const slug = /\/r\/([a-z-]+)\//.exec(url)?.[1];
      return new Response(
        slug
          ? recipe(
              slug
                .replace("-pie", " Pie")
                .replace(/^./, (c) => c.toUpperCase()),
              slug,
            )
          : list,
        { headers: { "content-type": "text/html" } },
      );
    });
    vi.stubGlobal("fetch", fetchStub);
    try {
      const inspected = await call("page_inspect_list", {
        url: `${origin}/pies/`,
      });
      expect(inspected.isError).toBe(false);
      expect(inspected.data).toMatchObject({
        title: "Three Pies",
        source: "links",
        items: [
          { n: 1, name: "Apple Pie", url: `${origin}/r/apple-pie/` },
          { n: 2, name: "Pecan Pie" },
          { n: 3, name: "Plum Pie" },
        ],
      });

      /* A dry run: nothing written, so no stale-editor warning. */
      const dry = await call("recipe_import_list", {
        url: `${origin}/pies/`,
        pick: [1],
        dryRun: true,
      });
      expect(dry.data).toMatchObject({
        dryRun: true,
        results: [{ n: 1, status: "would-import", slug: "apple-pie" }],
        remaining: [],
      });
      /*
       * The only warning is 35p's: this corpus has no recipe index yet, so
       * nothing could be marked `existing`. No stale-editor line.
       */
      expect(dry.data.warnings).toEqual([MISSING_INDEX_WARNING]);
      expect((await call("recipe_list")).data.total).toBe(0);

      /* The default cap is three, so `all` fits in one call. */
      const real = await call("recipe_import_list", {
        url: `${origin}/pies/`,
        all: true,
        term: "pies",
      });
      expect(real.isError).toBe(false);
      expect(real.data).toMatchObject({
        total: 3,
        remaining: [],
        term: { slug: "pies", label: "Three Pies", created: true },
      });
      expect(
        (real.data.results as { status: string }[]).map((r) => r.status),
      ).toEqual(["imported", "imported", "imported"]);
      /* Still no index when the list was read; then the write's own hint. */
      expect(real.data.warnings).toEqual([
        MISSING_INDEX_WARNING,
        expect.stringContaining("stale"),
      ]);
      expect((await call("recipe_list", { tag: "pies" })).data.total).toBe(3);

      /* And the list now says so. */
      const again = await call("page_inspect_list", { url: `${origin}/pies/` });
      expect(
        (again.data.items as { existing?: string }[]).map((i) => i.existing),
      ).toEqual(["apple-pie", "pecan-pie", "plum-pie"]);

      expect(
        await callError("recipe_import_list", {
          url: `${origin}/pies/`,
          pick: [9],
        }),
      ).toMatchObject({ code: "validation" });
      expect(
        await callError("recipe_import_list", { url: `${origin}/pies/` }),
      ).toMatchObject({ code: "validation" });

      const { tools } = await client.listTools();
      const annotationsOf = (name: string) =>
        tools.find((tool) => tool.name === name)?.annotations;
      expect(annotationsOf("page_inspect_list")).toMatchObject({
        readOnlyHint: true,
      });
      expect(annotationsOf("recipe_import_list")).toMatchObject({
        readOnlyHint: false,
      });
      expect(
        annotationsOf("recipe_import_list")?.destructiveHint,
      ).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sets an image from a local path, clears it, and wants exactly one source", async () => {
    await createCake();
    const picture = join(contentDirectory, "..", `cake-${Date.now()}.png`);
    await writeFile(picture, "png bytes");
    try {
      const set = await call("recipe_set_image", {
        slug: "chocolate-cake",
        path: picture,
      });
      expect(set.isError).toBe(false);
      expect(set.data).toMatchObject({
        slug: "chocolate-cake",
        image: expect.stringMatching(/^cake-\d+\.png$/),
      });
      /* A write: the stale-editor hint rides it, as on every other write. */
      expect(set.data.warnings).toEqual([expect.stringContaining("stale")]);

      const cleared = await call("recipe_set_image", {
        slug: "chocolate-cake",
        clear: true,
      });
      expect(cleared.data).toMatchObject({ image: null });
      const detail = await call("recipe_get", {
        slug: "chocolate-cake",
        fields: ["image"],
      });
      expect(detail.data.recipe).toEqual({});

      const both = await client.callTool({
        name: "recipe_set_image",
        arguments: {
          slug: "chocolate-cake",
          clear: true,
          url: "https://x/y.png",
        },
      });
      expect(both.isError).toBe(true);

      expect(
        await callError("recipe_set_image", {
          slug: "chocolate-cake",
          path: join(contentDirectory, "notes.txt"),
        }),
      ).toMatchObject({ code: "validation" });
    } finally {
      await rm(picture, { force: true });
    }
  });

  /* 32c: term_set_image, recipe_set_image's twin for a term record. */
  it("sets a term's picture from a local path, clears it, and needs a record", async () => {
    const picture = join(contentDirectory, "..", `tin-${Date.now()}.png`);
    await writeFile(picture, "png bytes");
    try {
      expect(
        await callError("term_set_image", { slug: "cookies", path: picture }),
      ).toMatchObject({ code: "not_found", slug: "cookies" });

      await call("term_create", { term: { label: "Cookies" } });
      const set = await call("term_set_image", {
        slug: "cookies",
        path: picture,
      });
      expect(set.isError).toBe(false);
      expect(set.data).toMatchObject({
        slug: "cookies",
        url: "/tags/cookies",
        image: expect.stringMatching(/^tin-\d+\.png$/),
      });
      expect(set.data.warnings).toEqual([expect.stringContaining("stale")]);
      const detail = await call("term_get", { slug: "cookies" });
      expect((detail.data.record as { image?: string }).image).toBe(
        set.data.image,
      );

      const cleared = await call("term_set_image", {
        slug: "cookies",
        clear: true,
      });
      expect(cleared.data).toMatchObject({
        image: null,
        previous: set.data.image,
      });

      const both = await client.callTool({
        name: "term_set_image",
        arguments: { slug: "cookies", clear: true, path: picture },
      });
      expect(both.isError).toBe(true);
    } finally {
      await rm(picture, { force: true });
    }
  });

  /* 32i: aliases through term_create / term_update / term_get, and search. */
  it("records aliases, refuses a clash, and recipe_search follows them", async () => {
    const tools = await client.listTools();
    const describe = (name: string) =>
      tools.tools.find((tool) => tool.name === name)?.description ?? "";
    expect(describe("term_create")).toContain("aliases");
    expect(describe("term_update")).toContain("aliases");
    expect(describe("term_merge")).toContain("alias");

    await call("recipe_create", {
      recipe: { name: "Shortbread", tags: ["cookies"] },
    });
    await call("term_create", {
      term: { label: "Cookies", aliases: ["Biscuits"] },
    });
    expect((await call("term_get", { slug: "cookies" })).data).toMatchObject({
      aliases: ["biscuits"],
    });
    const found = await call("recipe_search", { query: "tag:biscuits" });
    expect(
      (found.data.recipes as { slug: string }[]).map((row) => row.slug),
    ).toEqual(["shortbread"]);

    await call("term_create", { term: { label: "Dessert" } });
    expect(
      await callError("term_update", {
        slug: "dessert",
        patch: { aliases: ["biscuits"] },
      }),
    ).toMatchObject({
      code: "validation",
      issues: [
        {
          path: "aliases.0",
          message: '"biscuits" is already an alias of the term "cookies"',
        },
      ],
    });
  });
});

/* ------------------------------------------------------------------ */
/* 10. Git (23d)                                                      */
/* ------------------------------------------------------------------ */

/**
 * Its own harness, because the suite above deliberately works in a directory
 * that is *not* a repository — which is what lets every other tool run without
 * a committer identity. The git tools need the opposite, so this describe
 * builds a real repo the way `curationGit.test.ts` does (T49).
 *
 * `curationGit.test.ts` covers what the seats *do*; what is worth pinning here
 * is the wrapper: that a rewind's warnings carry the stale-editor hint, and
 * that a hash the schema rejects never reaches the layer at all (T28).
 */
describe("git", () => {
  let contentDirectory: string;
  let previousContentDirectory: string | undefined;
  let backend: ReturnType<typeof createLocalBackend>;
  let server: ReturnType<typeof createRecipeServer>;
  let client: Client;

  beforeEach(async () => {
    contentDirectory = await mkdtemp(join(tmpdir(), "mcp-git-"));
    const repo = simpleGit({ baseDir: contentDirectory });
    await repo.init();
    await repo.addConfig("user.email", "curator@test.local");
    await repo.addConfig("user.name", "Test Curator");
    await repo.addConfig("commit.gpgsign", "false");
    await writeFile(
      join(contentDirectory, ".gitignore"),
      derivedContentPaths(recipeContentTypes),
    );
    await repo.add(".");
    await repo.commit("Initial commit");

    previousContentDirectory = process.env.CONTENT_DIRECTORY;
    process.env.CONTENT_DIRECTORY = contentDirectory;

    backend = createLocalBackend({ contentDirectory });
    server = createRecipeServer(backend);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: "mcp-git-test", version: "0" });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
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

  it("reports the repository and a write's own commit", async () => {
    expect((await call("git_status")).data).toMatchObject({
      isRepo: true,
      dirty: false,
    });

    await call("recipe_create", { recipe: { name: "Naan" } });

    const log = await call("git_log", { type: "recipe", slug: "naan" });
    expect(log.isError).toBe(false);
    const commits = log.data.commits as {
      message: string;
      files: string[];
    }[];
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      message: "Create recipe: naan",
      files: ["recipes/data/naan/recipe.json"],
    });
  });

  it("reverts a group creation, and the hint rides the warnings", async () => {
    await call("group_create", { group: { name: "Week One" } });
    const log = await call("git_log", { type: "group" });
    const hash = (log.data.commits as { hash: string }[])[0].hash;

    const reverted = await call("git_revert", { hash });
    expect(reverted.isError).toBe(false);
    expect(reverted.data.commit).toBeTruthy();
    /* Five since 24c, when the registry gained the `tag-terms` records. */
    expect(reverted.data.rebuilt).toHaveLength(5);
    /* `write()` folds `afterWrite`'s stale-editor hint in, as every write does. */
    expect(reverted.data.warnings).toEqual([
      expect.stringContaining(STALE_EDITOR_HINT),
    ]);

    expect((await call("group_list")).data).toMatchObject({
      total: 0,
      groups: [],
    });
  });

  it("leaves a hash the schema rejects to the SDK, in the SDK's own shape", async () => {
    /*
     * The pattern is on `GitRevertSchema`, so "zzz" never reaches `gitRevert`:
     * there is no `structuredContent` and no `error.code` here, only the SDK's
     * text (T28). Pinned verbatim — an agent reading it is the only thing that
     * tells it what a hash looks like.
     */
    const result = await client.callTool({
      name: "git_revert",
      arguments: { hash: "zzz" },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect((result.content as { text: string }[])[0].text).toBe(
      "Input validation error: Invalid arguments for tool git_revert: hash: Expected 7 to 40 hexadecimal characters",
    );
  });

  it("reports a push with no remote as a curation failure", async () => {
    const result = await client.callTool({
      name: "git_push",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const error = (
      result.structuredContent as { error: { code: string; message: string } }
    ).error;
    /*
     * `validation` since epic 31: a push with nowhere to go is the caller's
     * input to fix (add a remote, or pass one), refused before git runs —
     * the code `git_pull` already gives a missing upstream. It was `internal`
     * from 23d, with git's own message.
     */
    expect(error.code).toBe("validation");
    expect(error.message).toContain("no remote");
  });
});

/* ------------------------------------------------------------------ */
/* 11. Mode resolution (D11)                                          */
/* ------------------------------------------------------------------ */

/**
 * The CLI and the MCP server share this function, so it is the one place a
 * "which corpus am I talking to" bug can be caught once rather than twice.
 * Every case passes an explicit `env` object rather than mutating
 * `process.env`, which is also what proves the parameter is threaded at all.
 */
describe("resolveBackendConfig", () => {
  it("defaults to the engine's own content directory", () => {
    expect(resolveBackendConfig({}, {})).toEqual({
      kind: "local",
      contentDirectory: getContentDirectory(),
      author: undefined,
      notify: undefined,
    });
  });

  it("reads an empty RECIPE_API_URL as unset (T27)", () => {
    /* `${RECIPE_API_URL:-}` in `.mcp.json` expands to exactly this. */
    expect(
      resolveBackendConfig({}, { RECIPE_API_URL: "", CONTENT_DIRECTORY: "" }),
    ).toMatchObject({ kind: "local", contentDirectory: getContentDirectory() });
  });

  it("goes remote when RECIPE_API_URL is set, carrying the token", () => {
    expect(
      resolveBackendConfig(
        {},
        {
          RECIPE_API_URL: "http://localhost:3000",
          RECIPE_API_TOKEN: "rcp_secret",
        },
      ),
    ).toEqual({
      kind: "http",
      baseUrl: "http://localhost:3000",
      token: "rcp_secret",
    });
  });

  it("lets an override beat the environment", () => {
    expect(
      resolveBackendConfig(
        { remote: "http://flag" },
        { RECIPE_API_URL: "http://env" },
      ),
    ).toMatchObject({ kind: "http", baseUrl: "http://flag" });

    expect(
      resolveBackendConfig(
        { contentDir: "/flag/content" },
        { CONTENT_DIRECTORY: "/env/content" },
      ),
    ).toMatchObject({ kind: "local", contentDirectory: "/flag/content" });
  });

  it("resolves a relative content directory against INIT_CWD", () => {
    /* pnpm runs the script from the package directory, not where it was typed. */
    expect(
      resolveBackendConfig(
        {},
        { CONTENT_DIRECTORY: "./fixtures/x", INIT_CWD: "/repo/root" },
      ),
    ).toMatchObject({ contentDirectory: "/repo/root/fixtures/x" });
  });
});
