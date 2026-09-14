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
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CuratorBackend } from "../cli/backend/types";
import { toErrorObject } from "../controller/curation/errors";
import type { RecipeRow } from "../controller/curation/recipes";
import {
  FeaturedInputSchema,
  GroupInputSchema,
  GroupItemInputSchema,
  GroupPatchSchema,
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
  "recipe_import",
  "recipe_create",
  "recipe_update",
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

Every result is JSON, in \`structuredContent\` and as text. A failure carries \`isError\` and an object shaped {error: {code, message, slug?, issues?, recipes?, groups?}}; the codes are not_found, slug_conflict, validation, unknown_recipe, unknown_group, group_cycle, import_failed, no_git_identity, unauthenticated, usage and internal. A write may answer with a \`warnings\` array — a running editor that is now stale, or group items naming recipes that do not exist yet — which is information, not failure.

Writes commit to the content repository, one commit each. Deletes (recipe_delete, group_delete, unfeature) are not undoable from here.`;

/* --- the registry -------------------------------------------------------- */

export interface RecipeServerInfo {
  name?: string;
  version?: string;
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

  /* --- recipes ----------------------------------------------------------- */

  server.registerTool(
    "recipe_search",
    {
      title: "Search recipes",
      description:
        "Free-text search over the corpus, newest first. Supports the site's query " +
        "language: tag:, ingredient:, name:, description:, group:, time:, before:, " +
        "after:, and a leading - to negate a term.",
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
    "recipe_import",
    {
      title: "Import a recipe from a URL",
      description:
        "Fetch a page, extract its recipe and write it, keeping the source as " +
        "provenance. `dryRun` returns what would be written without writing it.",
      inputSchema: z.strictObject({
        url: z.string().min(1),
        tags: z.array(z.string()).optional(),
        slug: z.string().optional(),
        name: z.string().optional(),
        dryRun: z.boolean().optional(),
        overwrite: z.boolean().optional(),
      }),
      annotations: WRITES,
    },
    async ({ url, ...options }) =>
      write(backend, () => backend.importRecipe(url, options), {
        notify: options.dryRun !== true,
      }),
  );

  server.registerTool(
    "recipe_create",
    {
      title: "Create a recipe",
      description:
        "Write a new recipe. Ingredients and instructions accept prose strings as well " +
        "as objects. `overwrite` replaces an existing recipe at the same slug.",
      inputSchema: z.strictObject({
        recipe: RecipeInputSchema,
        overwrite: z.boolean().optional(),
      }),
      annotations: WRITES,
    },
    async ({ recipe, overwrite }) =>
      write(backend, () => backend.createRecipe(recipe, { overwrite })),
  );

  server.registerTool(
    "recipe_update",
    {
      title: "Update a recipe",
      description:
        "Patch a recipe: an omitted key is left alone, an explicit null clears it. " +
        "`patch.slug` renames (and moves the page).",
      inputSchema: z.strictObject({
        slug: Slug,
        patch: RecipePatchSchema,
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ slug, patch }) =>
      write(backend, () => backend.updateRecipe(slug, patch)),
  );

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
    "group_create",
    {
      title: "Create a group",
      description:
        'A meal plan or a collection. Items may be `"slug"`, `"slug:label"` or ' +
        "{recipe, label?, note?} — or {group, label?, note?} for a nested group. " +
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

  server.registerTool(
    "group_update",
    {
      title: "Update a group",
      description:
        "Everything about a group except its items: name, slug (a rename), kind, date, " +
        "description and image. Use group_set_items for the items themselves.",
      inputSchema: z.strictObject({
        slug: Slug,
        patch: GroupPatchSchema,
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ slug, patch }) =>
      write(backend, () => backend.updateGroup(slug, patch)),
  );

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
    "featured_list",
    {
      title: "List featured entries",
      description:
        "The homepage strip, newest first. Each row's `slug` is the entry's own, and " +
        "`recipe` or `group` names what it points at.",
      inputSchema: z.strictObject({ limit: Limit, offset: Offset }),
      annotations: READ_ONLY,
    },
    async ({ limit, offset }) =>
      read(() => backend.listFeatured({ limit, offset })),
  );

  server.registerTool(
    "feature",
    {
      title: "Feature a recipe or a group",
      description:
        "Put one target on the homepage. Name exactly one of `recipe` or `group`; the " +
        "target must exist. Pass an explicit `slug` when featuring several things at " +
        "once, since the default slug has one-second resolution.",
      inputSchema: FeaturedInputSchema,
      annotations: WRITES,
    },
    async (args) => write(backend, () => backend.feature(args)),
  );

  server.registerTool(
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

  server.registerTool(
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

  return server;
}

export default createRecipeServer;
