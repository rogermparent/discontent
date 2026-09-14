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
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";

import { recipeContentTypes } from "../websites/recipe-website/editor/controller/contentTypes";

import {
  createLocalBackend,
  STALE_EDITOR_HINT,
} from "../websites/recipe-website/editor/cli/backend/local";
import { resolveBackendConfig } from "../websites/recipe-website/editor/cli/backend/resolve";
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

    expect(
      tools.find((tool) => tool.name === "recipe_search")?.annotations,
    ).toMatchObject({ readOnlyHint: true });
    expect(
      tools.find((tool) => tool.name === "recipe_delete")?.annotations,
    ).toMatchObject({ readOnlyHint: false, destructiveHint: true });
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
      group: { name: "Christmas Cookies", kind: "collection" },
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
    expect(reverted.data.rebuilt).toHaveLength(4);
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
     * Whatever git says about the missing remote, wrapped in our vocabulary —
     * `internal`, because "there is no remote called origin" is not one of the
     * four git codes and inventing a fifth for it is a design call 23d did not
     * make. What matters to a caller is that it is an `{error: {code,
     * message}}` object naming the remote, not an unhandled throw.
     */
    expect(error.code).toBe("internal");
    expect(error.message).toContain("origin");
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
