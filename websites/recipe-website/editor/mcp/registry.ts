/**
 * Every MCP tool, defined once over `CuratorBackend` (D1/D13).
 *
 * Two transports will instantiate this: the stdio server in `mcp/server.ts`
 * (23b) and an HTTP route (23e). Neither knows anything about the curation
 * layer — they hand this function a backend and get an `McpServer` back — which
 * is what keeps a tool from existing over stdio and not over HTTP, or answering
 * in two different shapes.
 *
 * ## What a tool answers with
 *
 * Success is the backend's own result object, twice: as `structuredContent`
 * for a client that can use it, and as its JSON in `content[0].text` for one
 * that reads text. Failure is `toErrorObject(error)` the same way with
 * `isError: true` — the identical `{error: {code, message, …}}` the CLI prints
 * and the API answers with, so an agent that has learned one vocabulary knows
 * all three.
 *
 * There are **two** failure shapes reaching a caller, though, and only one of
 * them is ours (T28). Input the tool's own schema rejects — an unknown key, a
 * string where a number belongs — is caught by the SDK *before* dispatch and
 * reported in the SDK's shape. `toErrorObject` only ever describes a failure
 * from below: a slug that names nothing, a duplicate, a patch the curation
 * schema refuses.
 *
 * ## Why the payloads nest
 *
 * `recipe_create` takes `{recipe, overwrite?}` rather than spreading the
 * recipe's fields at the top level, and `recipe_update` takes `{slug, patch}`.
 * Flat would collide: `overwrite` is an option and `slug` is *also* a recipe
 * field, so a flat `recipe_update` could not tell "rename this to X" from
 * "which recipe". Nesting also means the payload schemas are the curation
 * layer's own, imported unchanged, so a tool cannot accept something the API
 * would refuse.
 *
 * ## Compactness (D3)
 *
 * A search that returned whole recipes would spend most of a context window on
 * ingredient lists nobody asked for. Rows are `{slug, name, date, tags,
 * totalTime, image?}` and `fields` opts back into the rest one name at a time.
 */
import {
  McpServer,
  type CallToolResult,
  type RegisteredTool,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CuratorBackend } from "../cli/backend/types";
import { toErrorObject } from "../controller/curation/errors";
import { readImageFile } from "../controller/imageImport";
import type { RecipeRow } from "../controller/curation/recipes";
import {
  FeaturedInputSchema,
  GitDiffQuerySchema,
  GitFetchSchema,
  GitFileQuerySchema,
  GitHashSchema,
  GitLogQuerySchema,
  GitPullSchema,
  GitSyncSchema,
  GitPushSchema,
  GitRestoreSchema,
  GitRevertSchema,
  GitStatusQuerySchema,
  GroupInputSchema,
  GroupItemInputSchema,
  GroupPatchSchema,
  InventoryItemSchema,
  InventoryMakeQuerySchema,
  InventorySetSchema,
  RecipeInputSchema,
  RecipePatchSchema,
} from "../controller/curation/schema";
import packageJson from "../package.json";
import type {
  GroupItemRef,
  Recipe,
} from "recipe-website-common/controller/types";

/**
 * Tool names, in registration order.
 *
 * Exported so a test can assert `tools/list` equals exactly this — a hand-kept
 * list is the point: a rename or an accidental drop shows up as a diff here
 * rather than as a tool an agent silently stops being able to call.
 */
export const TOOL_NAMES = [
  "recipe_search",
  "recipe_list",
  "recipe_get",
  "page_inspect",
  "recipe_import",
  "recipe_create",
  "recipe_update",
  "recipe_set_image",
  "recipe_delete",
  "tag_list",
  "group_list",
  "group_get",
  "group_create",
  "group_update",
  "group_set_items",
  "group_add_item",
  "group_remove_item",
  "group_delete",
  "featured_list",
  "feature",
  "unfeature",
  "reindex",
  "inventory_get",
  "inventory_add",
  "inventory_remove",
  "inventory_set",
  "inventory_makeable",
  "git_status",
  "git_log",
  "git_show",
  "git_file_at",
  "git_diff",
  "git_revert",
  "git_restore",
  "git_push",
  "git_fetch",
  "git_pull",
  "git_sync",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

/**
 * What `fields` may add to a *row*.
 *
 * A closed enum rather than free strings, so the JSON Schema documents the
 * choice and a typo is a schema error instead of a silently missing column.
 * `source` is absent because the recipe *index* does not carry it — a caller
 * who wants provenance wants `recipe_get`, which reads the record itself (the
 * one divergence from D3's field list, recorded in the doc).
 */
export const ROW_FIELDS = [
  "description",
  "ingredients",
  "prepTime",
  "cookTime",
] as const;

export type RowField = (typeof ROW_FIELDS)[number];

/**
 * The row an agent gets by default, plus whatever it asked for.
 *
 * Undefined keys are dropped rather than serialized as `undefined`: the result
 * crosses a JSON boundary, and a row littered with absent fields costs tokens
 * for nothing.
 */
export function compactRow(
  row: RecipeRow,
  fields: readonly RowField[] = [],
): Record<string, unknown> {
  const compact: Record<string, unknown> = {
    slug: row.slug,
    name: row.name,
    date: row.date,
  };
  if (row.tags !== undefined) compact.tags = row.tags;
  if (row.totalTime !== undefined) compact.totalTime = row.totalTime;
  if (row.image !== undefined) compact.image = row.image;
  for (const field of fields) {
    if (row[field] !== undefined) compact[field] = row[field];
  }
  return compact;
}

/**
 * `recipe_get`'s projection: the named keys of the record, or the whole thing.
 *
 * Free strings rather than an enum here, because `Recipe` has an index
 * signature — `source`, `videoUrl` and anything a future field adds are all
 * legitimate asks, and enumerating them would go stale.
 */
export function pickRecipe(
  recipe: Recipe,
  fields?: readonly string[],
): Recipe | Record<string, unknown> {
  if (!fields || fields.length === 0) return recipe;
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (recipe[field] !== undefined) picked[field] = recipe[field];
  }
  return picked;
}

/* --- result shaping ------------------------------------------------------ */

function ok(result: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    structuredContent: result,
  };
}

function fail(error: unknown): CallToolResult {
  const object = toErrorObject(error);
  return {
    content: [{ type: "text", text: JSON.stringify(object) }],
    structuredContent: object,
    isError: true,
  };
}

/** A read: the result, or the layer's error object. */
async function read(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return ok(await run());
  } catch (error) {
    return fail(error);
  }
}

/**
 * A write, with `afterWrite`'s hint folded into `warnings`.
 *
 * The CLI prints that hint on stderr; a tool has no stderr a client reads, so
 * it rides the result instead — merged with any warnings the write itself
 * produced (a group's dangling `--force` items), because a caller that checks
 * one array should not have to know there are two sources.
 *
 * `afterWrite` runs only after a write that actually happened: a failed call
 * changed nothing, and a `dryRun` import deliberately did not.
 */
async function write(
  backend: CuratorBackend,
  run: () => Promise<unknown>,
  { notify = true }: { notify?: boolean } = {},
): Promise<CallToolResult> {
  let result: unknown;
  try {
    result = await run();
  } catch (error) {
    return fail(error);
  }
  const hint = notify ? await backend.afterWrite?.() : undefined;
  if (!hint) return ok(result);
  const existing = (result as { warnings?: string[] } | null)?.warnings ?? [];
  return ok({ ...(result as object), warnings: [...existing, hint] });
}

/* --- shared schema fragments --------------------------------------------- */

const Limit = z.number().int().min(1).optional();
const Offset = z.number().int().min(0).optional();
const RowFields = z.array(z.enum(ROW_FIELDS)).optional();
const Slug = z.string().min(1);

/**
 * The two halves of a group item's XOR, as an extendable object (23c/D15).
 *
 * `subgroup` rather than `group`, because `group` is already the tool's *first*
 * argument — the group being edited — and one call carrying `group` twice with
 * two meanings would be a mistake waiting for a hurried agent.
 *
 * The refine lives on each tool rather than here so `.extend` can add the
 * surrounding fields first: a refined schema is no longer an object schema and
 * cannot be extended.
 */
const GroupItemRefSchema = z.strictObject({
  recipe: Slug.optional(),
  subgroup: Slug.optional(),
});

const exactlyOneRef = (data: { recipe?: string; subgroup?: string }) =>
  Boolean(data.recipe) !== Boolean(data.subgroup);

const REF_REFINEMENT = {
  message: "Name exactly one of `recipe` or `subgroup`",
  path: ["recipe"] as PropertyKey[],
};

/** The seam's ref, from the two optional keys the schema has already checked. */
function toRef(recipe?: string, subgroup?: string): GroupItemRef {
  return subgroup ? { group: subgroup } : { recipe: recipe as string };
}

const READ_ONLY = { readOnlyHint: true } as const;
const WRITES = { readOnlyHint: false } as const;
const IDEMPOTENT_WRITE = { readOnlyHint: false, idempotentHint: true } as const;
const DESTRUCTIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: true,
} as const;

const INSTRUCTIONS = `Manage and search a recipe website's content.

Recipe rows from recipe_search and recipe_list are compact — {slug, name, date, tags, totalTime, image?} — to keep results small; pass \`fields\` to add description, ingredients, prepTime or cookTime, and use recipe_get for a whole recipe. Slugs are the identity of everything: recipe slugs, group slugs, and a featured entry's own slug (which is not its target's).

Every result is JSON, in \`structuredContent\` and as text. A failure carries \`isError\` and an object shaped {error: {code, message, slug?, issues?, recipes?, groups?, terms?}}; the codes are not_found, slug_conflict, validation, unknown_recipe, unknown_group, unknown_term, group_cycle, import_failed, no_git_identity, not_a_repo, dirty_tree, git_conflict, bad_revision, unauthenticated, forbidden, usage and internal. A write may answer with a \`warnings\` array — a running editor that is now stale, or group items naming recipes that do not exist yet — which is information, not failure.

Writes commit to the content repository, one commit each. Deletes (recipe_delete, group_delete, unfeature) are not undoable from here.

The git tools read and rewind that repository. git_log, git_show, git_file_at and git_diff read history; \`type\` is recipe, group or featured. git_revert and git_restore make a new commit and rebuild every index — they need a clean working tree (dirty_tree otherwise) and neither is undoable from here. git_push sends the branch to its remote and changes nothing locally. git_fetch refreshes the remote refs and nothing else, so run it (or git_status with fetch: true) before trusting ahead/behind. git_pull merges the upstream in and rebuilds every index; a conflict is aborted and answered with git_conflict, for a person to resolve in the editor's Git page. If git_status says indexStale, run reindex.`;

/* --- the registry -------------------------------------------------------- */

export interface RecipeServerInfo {
  name?: string;
  version?: string;
  /**
   * Register only the tools annotated `readOnlyHint: true` (27b/D6) — what a
   * read-scoped API token gets over MCP-over-HTTP. Filtered by annotation, not
   * by which wrapper a tool's handler uses: `git_push` answers through `read`
   * (it writes no file, T50) and is still a write.
   */
  readOnly?: boolean;
}

export function createRecipeServer(
  backend: CuratorBackend,
  info: RecipeServerInfo = {},
): McpServer {
  const server = new McpServer(
    {
      name: info.name ?? "recipes",
      version: info.version ?? packageJson.version,
    },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  /*
   * Every registration goes through here so the handles can be kept: the SDK
   * answers `tools/list` from what is registered, so a read-only session drops
   * its writes with `remove()` after the fact rather than branching at each of
   * the call sites below.
   */
  const registered: RegisteredTool[] = [];
  const register = ((...args: unknown[]) => {
    const tool = (server.registerTool as (...a: unknown[]) => RegisteredTool)(
      ...args,
    );
    registered.push(tool);
    return tool;
  }) as typeof server.registerTool;

  /* --- recipes ----------------------------------------------------------- */

  register(
    "recipe_search",
    {
      title: "Search recipes",
      description:
        "Ranked free-text search: a recipe matches if it has any of the words " +
        "(prefix at a word start), best first — a word in the name counts most, then " +
        "tags, ingredients, description — and ties newest first. Supports the site's " +
        "query language: tag:, ingredient:, name:, description:, source: (a site's " +
        "name or host), group: (a group's slug or name, sub-groups included), " +
        "time:, before:, after:, and a leading - to negate a term; " +
        "typed terms narrow exactly.",
      inputSchema: z.strictObject({
        query: z.string().min(1),
        limit: Limit,
        offset: Offset,
        fields: RowFields,
      }),
      annotations: READ_ONLY,
    },
    async ({ query, limit, offset, fields }) =>
      read(async () => {
        const result = await backend.searchRecipes(query, { limit, offset });
        return {
          ...result,
          recipes: result.recipes.map((row) => compactRow(row, fields)),
        };
      }),
  );

  register(
    "recipe_list",
    {
      title: "List recipes",
      description:
        "Recipes newest first, optionally narrowed to one tag. Use recipe_search for text.",
      inputSchema: z.strictObject({
        tag: z.string().min(1).optional(),
        limit: Limit,
        offset: Offset,
        fields: RowFields,
      }),
      annotations: READ_ONLY,
    },
    async ({ tag, limit, offset, fields }) =>
      read(async () => {
        const result = await backend.listRecipes({ tag, limit, offset });
        return {
          ...result,
          recipes: result.recipes.map((row) => compactRow(row, fields)),
        };
      }),
  );

  register(
    "recipe_get",
    {
      title: "Get a recipe",
      description:
        "One recipe in full, with its path and site URL. Pass `fields` to return only " +
        'those keys of the record (for example ["name", "source"]).',
      inputSchema: z.strictObject({
        slug: Slug,
        fields: z.array(z.string().min(1)).optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug, fields }) =>
      read(async () => {
        const detail = await backend.getRecipe(slug);
        return { ...detail, recipe: pickRecipe(detail.recipe, fields) };
      }),
  );

  register(
    "page_inspect",
    {
      title: "Inspect a page before importing it",
      description:
        "Read a recipe page and write nothing. Returns the mapped import (`recipe`), " +
        "a create-ready `draft` (plain ingredient lines, the best image URL, the " +
        "source) to edit and pass to recipe_create, the raw JSON-LD Recipe node, the " +
        "page's SEO metadata, up to ten ranked `images` to choose from, the page's own " +
        "categories and keywords as `suggestedTags` (hints, never applied), and — for a " +
        "video host — yt-dlp's `video` metadata (full description, chapters, " +
        "thumbnails). `partial: true` means the page had no Recipe node: the draft is " +
        "only its title, description and image.",
      inputSchema: z.strictObject({ url: z.string().min(1) }),
      annotations: READ_ONLY,
    },
    async ({ url }) => read(() => backend.inspect(url)),
  );

  register(
    "recipe_import",
    {
      title: "Import a recipe from a URL",
      description:
        "Fetch a page, extract its recipe and write it, keeping the source as " +
        "provenance. `dryRun` returns what would be written — and a create-ready " +
        "`draft` — without writing it. `image` replaces the page's best image URL. " +
        "A page with no Recipe node is refused unless `allowPartial`.",
      inputSchema: z.strictObject({
        url: z.string().min(1),
        tags: z.array(z.string()).optional(),
        slug: z.string().optional(),
        name: z.string().optional(),
        image: z.string().min(1).optional(),
        dryRun: z.boolean().optional(),
        overwrite: z.boolean().optional(),
        allowPartial: z.boolean().optional(),
      }),
      annotations: WRITES,
    },
    async ({ url, ...options }) =>
      write(backend, () => backend.importRecipe(url, options), {
        notify: options.dryRun !== true,
      }),
  );

  register(
    "recipe_create",
    {
      title: "Create a recipe",
      description:
        "Write a new recipe. Ingredients and instructions accept prose strings as well " +
        "as objects. `overwrite` replaces an existing recipe at the same slug. " +
        "`dryRun` validates and returns the resolved slug, whether it is taken, the " +
        "record that would be stored and the image's filename — writing nothing.",
      inputSchema: z.strictObject({
        recipe: RecipeInputSchema,
        overwrite: z.boolean().optional(),
        dryRun: z.boolean().optional(),
      }),
      annotations: WRITES,
    },
    async ({ recipe, overwrite, dryRun }) =>
      write(
        backend,
        () => backend.createRecipe(recipe, { overwrite, dryRun }),
        {
          notify: dryRun !== true,
        },
      ),
  );

  register(
    "recipe_update",
    {
      title: "Update a recipe",
      description:
        "Patch a recipe: an omitted key is left alone, an explicit null clears it. " +
        "`patch.slug` renames (and moves the page). `dryRun` returns the record the " +
        "patch would produce without writing it.",
      inputSchema: z.strictObject({
        slug: Slug,
        patch: RecipePatchSchema,
        dryRun: z.boolean().optional(),
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ slug, patch, dryRun }) =>
      write(backend, () => backend.updateRecipe(slug, patch, { dryRun }), {
        notify: dryRun !== true,
      }),
  );

  register(
    "recipe_set_image",
    {
      title: "Set or clear a recipe's image",
      description:
        "Replace a recipe's image from a `url` (downloaded and checked: it must be an " +
        "image, under 15 MB) or a local `path` (read by this server's process), or " +
        "`clear` it — exactly one. One commit, `Update recipe image: <slug>`, so " +
        "git can undo it.",
      inputSchema: z
        .strictObject({
          slug: Slug,
          url: z.string().min(1).optional(),
          path: z.string().min(1).optional(),
          clear: z.literal(true).optional(),
        })
        .refine(
          ({ url, path, clear }) =>
            [url, path, clear].filter((value) => value !== undefined).length ===
            1,
          { message: "Pass exactly one of `url`, `path` or `clear`" },
        ),
      annotations: WRITES,
    },
    async ({ slug, url, path }) =>
      write(backend, async () => {
        if (url) return backend.setRecipeImage(slug, { url });
        if (path) {
          return backend.setRecipeImage(slug, {
            file: await readImageFile(path),
          });
        }
        return backend.setRecipeImage(slug, { clear: true });
      }),
  );

  register(
    "recipe_delete",
    {
      title: "Delete a recipe",
      description:
        "Remove a recipe and its uploads. Group items pointing at it are left dangling, " +
        "not rewritten.",
      inputSchema: z.strictObject({ slug: Slug }),
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ slug }) => write(backend, () => backend.deleteRecipe(slug)),
  );

  register(
    "tag_list",
    {
      title: "List tags",
      description:
        "Every tag in the corpus, sorted. Worth reading before inventing a new one.",
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
    },
    async () => read(async () => ({ tags: await backend.listTags() })),
  );

  /* --- groups ------------------------------------------------------------ */

  register(
    "group_list",
    {
      title: "List groups",
      description: "Meal plans and collections, newest first.",
      inputSchema: z.strictObject({ limit: Limit, offset: Offset }),
      annotations: READ_ONLY,
    },
    async ({ limit, offset }) =>
      read(() => backend.listGroups({ limit, offset })),
  );

  register(
    "group_get",
    {
      title: "Get a group",
      description:
        "One group with its items resolved: each carries the target's current name — and " +
        "`kind` when the item is a nested group — or `missing` when the slug names nothing.",
      inputSchema: z.strictObject({ slug: Slug }),
      annotations: READ_ONLY,
    },
    async ({ slug }) => read(() => backend.getGroup(slug)),
  );

  register(
    "group_create",
    {
      title: "Create a group",
      description:
        'A meal plan or a collection. Items may be `"slug"`, `"slug:label"` or ' +
        "{recipe, label?, note?} — or {group, label?, note?} for a nested group. " +
        "`tags` classifies the group in the site's one tag vocabulary, the same " +
        "one recipes use, so it appears on those tags' pages. " +
        "`force` downgrades unknown recipe and group slugs to warnings.",
      inputSchema: z.strictObject({
        group: GroupInputSchema,
        force: z.boolean().optional(),
      }),
      annotations: WRITES,
    },
    async ({ group, force }) =>
      write(backend, () => backend.createGroup(group, { force })),
  );

  register(
    "group_update",
    {
      title: "Update a group",
      description:
        "Everything about a group except its items: name, slug (a rename), kind, date, " +
        "description, image and tags. `tags` replaces the whole list; null clears it. " +
        "Use group_set_items for the items themselves.",
      inputSchema: z.strictObject({
        slug: Slug,
        patch: GroupPatchSchema,
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ slug, patch }) =>
      write(backend, () => backend.updateGroup(slug, patch)),
  );

  register(
    "group_set_items",
    {
      title: "Replace a group's items",
      description:
        'Set the whole item list, in order. Each item is `"slug"`, `"slug:label"` or ' +
        "{recipe | group, label?, note?} — a `{group}` item nests that group inside this " +
        "one. This replaces what is there; use group_add_item to append.",
      inputSchema: z.strictObject({
        group: Slug,
        items: z.array(GroupItemInputSchema),
        force: z.boolean().optional(),
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ group, items, force }) =>
      write(backend, () => backend.setGroupItems(group, items, { force })),
  );

  register(
    "group_add_item",
    {
      title: "Add a recipe or a group to a group",
      description:
        "Append one member — a recipe, or a `subgroup` (a group nested inside this " +
        'one) — with an optional label ("Mon · Dinner") and note. Name exactly one of ' +
        "`recipe` and `subgroup`. `force` allows a slug that names nothing yet; nothing " +
        "allows a cycle (group_cycle). Renaming or deleting a sub-group later leaves " +
        "this row pointing at the old slug, and the page says so.",
      inputSchema: GroupItemRefSchema.extend({
        group: Slug,
        label: z.string().optional(),
        note: z.string().optional(),
        force: z.boolean().optional(),
      }).refine(exactlyOneRef, REF_REFINEMENT),
      annotations: WRITES,
    },
    async ({ group, recipe, subgroup, ...options }) =>
      write(backend, () =>
        backend.addGroupItem(group, toRef(recipe, subgroup), options),
      ),
  );

  register(
    "group_remove_item",
    {
      title: "Remove a recipe or a group from a group",
      description:
        "Drop every item naming that member — `recipe` for a recipe row, `subgroup` " +
        "for a nested group. The member itself is untouched; only the row goes.",
      inputSchema: GroupItemRefSchema.extend({ group: Slug }).refine(
        exactlyOneRef,
        REF_REFINEMENT,
      ),
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ group, recipe, subgroup }) =>
      write(backend, () =>
        backend.removeGroupItem(group, toRef(recipe, subgroup)),
      ),
  );

  register(
    "group_delete",
    {
      title: "Delete a group",
      description:
        "Remove a group. Its recipes are untouched; a featured entry pointing at it is " +
        "left dangling.",
      inputSchema: z.strictObject({ slug: Slug }),
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ slug }) => write(backend, () => backend.deleteGroup(slug)),
  );

  /* --- featured ---------------------------------------------------------- */

  register(
    "featured_list",
    {
      title: "List featured entries",
      description:
        "The homepage strip, newest first. Each row's `slug` is the entry's own, and " +
        "`recipe`, `group` or `term` names what it points at.",
      inputSchema: z.strictObject({ limit: Limit, offset: Offset }),
      annotations: READ_ONLY,
    },
    async ({ limit, offset }) =>
      read(() => backend.listFeatured({ limit, offset })),
  );

  register(
    "feature",
    {
      title: "Feature a recipe, a group or a term",
      description:
        "Put one target on the homepage. Name exactly one of `recipe`, `group` or " +
        "`term`; the target must exist. A `term` is a term *record*'s slug — a tag " +
        "that only exists as a string on recipes has no record to borrow a label " +
        "from and is refused. A target that is already featured is refused with " +
        "slug_conflict naming the existing entry; pass `again: true` to feature it a " +
        "second time on purpose. Pass an explicit `slug` when featuring several things " +
        "at once, since the default slug has one-second resolution.",
      inputSchema: FeaturedInputSchema,
      annotations: WRITES,
    },
    async (args) => write(backend, () => backend.feature(args)),
  );

  register(
    "unfeature",
    {
      title: "Remove a featured entry",
      description:
        "Delete one entry from the homepage strip by its own slug (from featured_list), " +
        "not by the slug of what it points at. The target itself is untouched.",
      inputSchema: z.strictObject({ slug: Slug }),
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ slug }) => write(backend, () => backend.unfeature(slug)),
  );

  /* --- maintenance ------------------------------------------------------- */

  register(
    "reindex",
    {
      title: "Rebuild indexes",
      description:
        "Rebuild the derived indexes and aggregates for one content type, or all of " +
        "them. Reads nothing external and commits nothing; safe to repeat.",
      inputSchema: z.strictObject({
        contentType: z.string().min(1).optional(),
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ contentType }) =>
      write(backend, () => backend.reindex(contentType)),
  );

  /* --- inventory (25d) --------------------------------------------------- */

  register(
    "inventory_get",
    {
      title: "What's on hand",
      description:
        "The site's shared list of what is on hand — bottles, mixers, fruit, pantry " +
        "items — as people write them (`vodka`, `Gnista`, `lime`). Matching is on the " +
        "generic name, so a brand is worth adding only when a recipe names it.",
      inputSchema: z.strictObject({}),
      annotations: READ_ONLY,
    },
    async () => read(() => backend.getInventory()),
  );

  register(
    "inventory_add",
    {
      title: "Add to what's on hand",
      description:
        "Add items to the shared list, one commit. Items already there are skipped. " +
        "Write the generic name first (`aperitif (Gnista)` or just `Gnista`), the way " +
        "recipe lines are written.",
      inputSchema: z.strictObject({
        items: z.array(InventoryItemSchema).min(1).max(500),
      }),
      annotations: WRITES,
    },
    async ({ items }) =>
      write(backend, () => backend.patchInventory({ add: items }), {
        notify: false,
      }),
  );

  register(
    "inventory_remove",
    {
      title: "Remove from what's on hand",
      description:
        "Remove items from the shared list (matched case- and accent-insensitively), " +
        "one commit. Items not on the list are ignored.",
      inputSchema: z.strictObject({
        items: z.array(InventoryItemSchema).min(1).max(500),
      }),
      annotations: WRITES,
    },
    async ({ items }) =>
      write(backend, () => backend.patchInventory({ remove: items }), {
        notify: false,
      }),
  );

  register(
    "inventory_set",
    {
      title: "Replace what's on hand",
      description:
        "Replace the whole shared list with `items`, one commit. Everything not named " +
        "is dropped — prefer inventory_add and inventory_remove.",
      inputSchema: InventorySetSchema,
      annotations: DESTRUCTIVE_WRITE,
    },
    async (args) =>
      write(backend, () => backend.setInventory(args), { notify: false }),
  );

  register(
    "inventory_makeable",
    {
      title: "What can I make?",
      description:
        "Judge the shared list against recipes in `query`'s scope (the search " +
        "language; `tag:drink` by default): which can be made now, which are one or " +
        "two items short and what's missing, how many are further, and what to buy " +
        "next. A line can be met by making another recipe first (`makeFirst`). The " +
        "same rules the site's /make page uses.",
      inputSchema: InventoryMakeQuerySchema,
      annotations: READ_ONLY,
    },
    async (args) => read(() => backend.inventoryMakeable(args)),
  );

  /* --- git --------------------------------------------------------------- */

  register(
    "git_status",
    {
      title: "Git status",
      description:
        "Whether the content directory is a Git repository, and where it stands: " +
        "branch, upstream, ahead/behind (`diverged` when both), uncommitted changes, " +
        "remotes, the most recent commits, and `indexStale` — HEAD moved without a " +
        "full rebuild, so run reindex. ahead/behind are as of `fetchedAt`; pass " +
        "`fetch: true` to refresh them first. `isRepo: false` means this deployment " +
        "does not track its content with Git, and no other git tool will work.",
      inputSchema: GitStatusQuerySchema,
      annotations: READ_ONLY,
    },
    async ({ fetch }) =>
      read(() => backend.gitStatus(fetch ? { fetch: true } : {})),
  );

  register(
    "git_log",
    {
      title: "Git log",
      description:
        "Commits that touched the content, newest first, each with the files it " +
        "changed. Pass `type` (recipe, group or featured) to narrow it to one content " +
        "type, and `type` with `slug` to see one item's own history — which is the " +
        "read to make before reverting or restoring anything.",
      inputSchema: GitLogQuerySchema,
      annotations: READ_ONLY,
    },
    async (args) => read(() => backend.gitLog(args)),
  );

  register(
    "git_show",
    {
      title: "Show a commit",
      description:
        "One commit's full diff. Hashes come from git_log; 7 to 40 hex characters. " +
        "Long diffs are truncated at `maxChars` (50000 by default) and say so.",
      inputSchema: z.strictObject({
        hash: GitHashSchema,
        maxChars: z.number().int().min(1).optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ hash, maxChars }) =>
      read(() =>
        backend.gitShow(hash, maxChars === undefined ? {} : { maxChars }),
      ),
  );

  register(
    "git_file_at",
    {
      title: "Read an item at a revision",
      description:
        "One recipe's, group's or featured entry's data file as it was at a revision, " +
        "parsed. The read that answers “what would a restore give me back” — compare " +
        "it to recipe_get or group_get before committing to git_restore.",
      inputSchema: GitFileQuerySchema,
      annotations: READ_ONLY,
    },
    async (args) => read(() => backend.gitFileAt(args)),
  );

  register(
    "git_diff",
    {
      title: "Diff two revisions",
      description:
        "What changed between two revisions of the content. `to` defaults to HEAD, and " +
        "`path` narrows the diff to one file or directory inside the content directory.",
      inputSchema: GitDiffQuerySchema,
      annotations: READ_ONLY,
    },
    async (args) => read(() => backend.gitDiff(args)),
  );

  register(
    "git_revert",
    {
      title: "Revert a commit",
      description:
        "Undo one commit by making a new one that reverses it, then rebuild every " +
        "index. Use it to take back a write that should not have happened — reverting " +
        "a create removes the item. Refuses a merge commit, a dirty working tree, and " +
        "a patch that no longer applies (nothing is changed in that case).",
      inputSchema: GitRevertSchema,
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ hash }) => write(backend, () => backend.gitRevert(hash)),
  );

  register(
    "git_restore",
    {
      title: "Restore an item to a revision",
      description:
        "Make one item's files — its data file and its uploads — match an earlier " +
        "revision, in a new commit, then rebuild every index. Narrower and more " +
        "predictable than git_revert: it cannot conflict. Answers `commit: null` when " +
        "the item already matches that revision.",
      inputSchema: GitRestoreSchema,
      annotations: DESTRUCTIVE_WRITE,
    },
    async (args) => write(backend, () => backend.gitRestore(args)),
  );

  register(
    "git_push",
    {
      title: "Push the content branch",
      description:
        "Send the current branch's commits to its remote. Changes nothing locally. " +
        "Pass `remote` (and `setUpstream` the first time) when no upstream is " +
        "configured. A rejection means the remote has commits this branch does not; " +
        "pulling them is a person's job in the editor's Git page.",
      inputSchema: GitPushSchema,
      annotations: WRITES,
    },
    /*
     * Through `read`, not `write`: the seat commits nothing and writes no file,
     * so `afterWrite`'s stale-editor hint would be describing something that
     * did not happen (T50).
     */
    async (args) => read(() => backend.gitPush(args)),
  );

  register(
    "git_fetch",
    {
      title: "Fetch the remote",
      description:
        "Refresh the remote-tracking refs, then answer where this branch stands: " +
        "ahead/behind its upstream, `diverged` when both sides have commits, and " +
        "`fetchedAt`. Moves no content and no index, so it is always safe to run — " +
        "git_status's ahead/behind is only as fresh as the last fetch. Pass `remote` " +
        "to fetch one that is not the upstream's.",
      inputSchema: GitFetchSchema,
      /*
       * Read-only in the sense the hint means for a curator: the content, the
       * branch and the indexes are untouched — only `refs/remotes/*` move
       * (D6). That is also what keeps it in a read-scoped session.
       */
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async (args) => read(() => backend.gitFetch(args)),
  );

  register(
    "git_pull",
    {
      title: "Pull from the remote",
      description:
        "Fetch, then merge the upstream into the current branch (never rebase) and " +
        "rebuild every index. Answers {from, merged, fastForward, newCommits, head, " +
        "rebuilt}. Refuses a dirty tree. A conflict is aborted — the tree is left " +
        "exactly as it was — and answered with git_conflict naming the files; " +
        "resolving it is a person's job in the editor's Git page.",
      inputSchema: GitPullSchema,
      annotations: WRITES,
    },
    async (args) => write(backend, () => backend.gitPull(args)),
  );

  register(
    "git_sync",
    {
      title: "Sync with a mirror",
      description:
        "From the workstation: fetch the mirror's remote, merge its commits in " +
        "(never rebase), and push ours back (epic 28). Answers {remote, branch, " +
        "outcome, message?, pulled, pushed, steps, head, state}; outcome is " +
        "nothing, synced, conflict (aborted, tree unchanged — a person resolves " +
        "it in the Git page), mirror_dirty, raced, unreachable, blocked or error. " +
        "Refused on a mirror.",
      inputSchema: GitSyncSchema,
      annotations: WRITES,
    },
    async (args) => write(backend, () => backend.gitSync(args)),
  );

  if (info.readOnly) {
    for (const tool of registered) {
      if (tool.annotations?.readOnlyHint !== true) tool.remove();
    }
  }

  return server;
}

export default createRecipeServer;
