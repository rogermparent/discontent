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
import {
  IMPORT_LIST_MAX_LIMIT,
  IMPORT_LIST_MAX_PICKS,
  ListPickSchema,
} from "../controller/curation/importList";
import {
  ImportRequestSchema,
  importTarget,
  type ImportTarget,
} from "../controller/curation/importRequest";
import { LLM_MODES } from "../controller/llm/mode";
import { PANTRY_STAPLES } from "recipe-website-common/util/makeable";
import {
  JOB_LIST_MAX_LIMIT,
  JOB_STATUS_FILTERS,
} from "../controller/jobs/listing";
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
  ScaleSchema,
  ShoppingAddSchema,
  ShoppingClearSchema,
  ShoppingSettingsPatchSchema,
  ShoppingTextSchema,
  TermCarrierTypeSchema,
  TermInputSchema,
  TermPatchSchema,
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
  /* Roundup ("meta-list") import (34f): 47 → 49. */
  "page_inspect_list",
  "recipe_import_list",
  "recipe_create",
  "recipe_update",
  "recipe_set_image",
  "recipe_delete",
  "tag_list",
  /* The vocabulary's records and carriers (31c): 38 → 46; 32c's image: 47. */
  "term_list",
  "term_get",
  "term_create",
  "term_update",
  "term_set_image",
  "term_assign",
  "term_rename",
  "term_merge",
  "term_delete",
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
  /* The shared shopping list (35c): 49 → 55. */
  "shopping_get",
  "shopping_add",
  "shopping_check",
  "shopping_remove",
  "shopping_clear",
  "shopping_settings_set",
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
  /* The job store (epic 37, 37c): 55 → 57, both reads. */
  "job_list",
  "job_get",
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

/** The `llm` option of the import tools (epic 36, D3/D4). */
const LLM_DESCRIPTION =
  "`llm` is the local model's part (when the server has one configured): `auto` " +
  "(default) has it read a page with no Recipe node (or a video's description), " +
  "`force` has it read every page with its lines replacing the schema's, `off` never. " +
  "A result it touched carries `llm: {model, found, grounded, total, …}` — how many " +
  "of its ingredient lines were found on the page; under half and its reading is " +
  "dropped (`discarded`), under 90% the result stays `partial`. Spot-check it " +
  "against the page. A model call takes ~5–45 s; `force` with no model is import_failed.";
const IDEMPOTENT_WRITE = { readOnlyHint: false, idempotentHint: true } as const;
const DESTRUCTIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: true,
} as const;

const INSTRUCTIONS = `Manage and search a recipe website's content.

Recipe rows from recipe_search and recipe_list are compact — {slug, name, date, tags, totalTime, image?} — to keep results small; pass \`fields\` to add description, ingredients, prepTime or cookTime, and use recipe_get for a whole recipe. Slugs are the identity of everything: recipe slugs, group slugs, and a featured entry's own slug (which is not its target's).

Every result is JSON, in \`structuredContent\` and as text. A failure carries \`isError\` and an object shaped {error: {code, message, slug?, issues?, recipes?, groups?, terms?, warnings?, job?}} (warnings: what a failed import had found worth saying, such as the local model running on the CPU; job: the import's job, whose steps job_get shows); the codes are not_found, slug_conflict, validation, unknown_recipe, unknown_group, unknown_term, group_cycle, term_cycle, term_in_use, import_failed, no_git_identity, not_a_repo, dirty_tree, git_conflict, bad_revision, busy, cancelled, unauthenticated, forbidden, usage and internal. busy means another write held the content repository's write lock (the message names it) and nothing was written: wait a few seconds and make the same call again. cancelled means a person stopped the import (from the editor's Jobs page or the CLI): do not retry it unasked. A write may answer with a \`warnings\` array — a running editor that is now stale, or group items naming recipes that do not exist yet — which is information, not failure.

Tags are one vocabulary shared by recipes and groups. A term is a tag that may also have a record — a label, description, picture, a parent (so tag:<parent> also finds everything under it), pinned recipes that lead its page, and aliases (other names that tag:<alias> and /tags/<alias> send to it; recipes keep their own tags). Use terms for a cluster by kind or a curated collection (term_create, then term_assign), and groups for meal plans: ordered, dated lists with a label per item. term_assign, term_rename, term_merge and term_delete write each recipe or group they touch, and land as one commit per call — a failure part-way commits what was written as "… (partial)" and answers the error.

Writes commit to the content repository, one commit per call. Deletes (recipe_delete, group_delete, term_delete, term_merge, unfeature) are not undoable from here.

The git tools read and rewind that repository. git_log, git_show, git_file_at and git_diff read history; \`type\` is recipe, group, featured or term. git_revert and git_restore make a new commit and rebuild every index — they need a clean working tree (dirty_tree otherwise) and neither is undoable from here. git_push sends the branch to its remote and changes nothing locally. git_fetch refreshes the remote refs and nothing else, so run it (or git_status with fetch: true) before trusting ahead/behind. git_pull merges the upstream in and rebuilds every index; a conflict is aborted and answered with git_conflict, for a person to resolve in the editor's Git page. If git_status says indexStale, run reindex.

Imports, inspects and roundup calls run as jobs: each result carries \`job\`, an id. job_get shows a job's steps — the fetch, yt-dlp, each model call with its tokens, rate and GPU share, queue waits — and job_list the recent ones. A slow import is often waiting in the queue for the GPU behind another import: job_list with status live says so.`;

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

/**
 * `recipe_import`'s `photos` (38e): local paths, read by this process as
 * `recipe_set_image`'s `path` is, and handed to the backend as files — a
 * local backend stores them in its job store, a remote one uploads them.
 */
async function importPhotoPaths(
  backend: CuratorBackend,
  target: Extract<ImportTarget, { kind: "photos" }>,
) {
  const files: File[] = [];
  for (const photo of target.photos) files.push(await readImageFile(photo));
  return backend.importPhotos(files, {
    ...target.options,
    ...(target.source ? { source: target.source } : {}),
  });
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
        "only its title, description and image. A video holding several recipes adds " +
        "`recipes: [{n, name, chapter?, slug, draft, llm, partial?}]` — `recipe` and " +
        "`draft` are then the first one's — and recipe_import takes `pick` / `all`. " +
        LLM_DESCRIPTION,
      inputSchema: z.strictObject({
        url: z.string().min(1),
        llm: z.enum(LLM_MODES).optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ url, ...options }) => read(() => backend.inspect(url, options)),
  );

  register(
    "recipe_import",
    {
      title: "Import a recipe from a URL, pasted text or photos",
      description:
        "Fetch a page, extract its recipe and write it, keeping the source as " +
        "provenance. `dryRun` returns what would be written — and a create-ready " +
        "`draft` — without writing it. `image` replaces the page's best image URL. " +
        "A page with no Recipe node is refused unless `allowPartial`. " +
        LLM_DESCRIPTION +
        " Pasted text instead of `url`: `text` (a YouTube description, an email, a " +
        "note) is read by the local model, which keeps the ingredients and steps and " +
        "skips links, sponsors and timestamps; `source` (optional) is the URL it came " +
        "from, cited and never fetched — a video URL also becomes the recipe's video. " +
        "Exactly one of `url` or `text`; `llm` goes only with `url`. With no model " +
        "configured, or no recipe found in the text, it is import_failed; under 90% " +
        "grounded it is `partial` like a page. " +
        "Several recipes in one video or paste (a video that makes three side dishes): the " +
        "answer is `{batch: true, found: [{n, name, ingredients, steps, grounded, total, " +
        "chapter?}], recipes: [{n, name, status, slug?, chapter?, draft?, error?, " +
        "warnings?}]}`, each recipe read and trusted on its own, each its own commit, and a " +
        'line naming another recipe of the batch ("see recipe below") linked to it; a video ' +
        "recipe's source starts at its chapter (`&t=…s`). Say which with `all: true` or " +
        '`pick: ["Green Bean Casserole"]` — names from `found`, matched without case; ' +
        "positions work too but can shift between readings — a create with neither is " +
        "refused with code usage naming them, and a dryRun shows them all. A recipe " +
        "already imported from the same source is `existing` and skipped, so `all` again " +
        "after a partial run imports only what is missing. `asOne: true` reads the text " +
        "as one recipe instead (a dish the model splits into its parts). One recipe " +
        "needs neither. " +
        "Photos instead of `url` or `text`: `photos` (1–4 local image paths, read by this " +
        "server's process — a recipe card, a cookbook page, the pages in order) are " +
        "transcribed by the vision model, then read as pasted text is (a dryRun answers the " +
        "`transcription`); `photoAsImage: true` also makes the first photo the recipe's " +
        "image (off by default). With no vision model configured it is usage. JPEG, PNG, " +
        "WebP, AVIF, TIFF, GIF; HEIC is refused.",
      inputSchema: ImportRequestSchema,
      annotations: WRITES,
    },
    async (request) => {
      const target = importTarget(request);
      return write(
        backend,
        () =>
          target.kind === "photos"
            ? importPhotoPaths(backend, target)
            : target.kind === "text"
              ? backend.importText(target.text, {
                  ...target.options,
                  ...(target.source ? { source: target.source } : {}),
                })
              : backend.importRecipe(target.url, target.options),
        { notify: request.dryRun !== true },
      );
    },
  );

  register(
    "page_inspect_list",
    {
      title: "Inspect a roundup page",
      description:
        'Read a roundup ("meta-list") page — "40+ Thanksgiving Pies", "Top Christmas ' +
        'Cookies" — and write nothing. Returns `{url, finalUrl, status, title?, source?, ' +
        "items, reason?}`: each item is `{n, url, name, image?, existing?}`, where `n` is its " +
        "1-based position (what recipe_import_list's `pick` names) and `existing` is the slug " +
        "of a recipe already imported from that page. `source` says where the list came from: " +
        "the page's schema.org ItemList, or the recipe links in its article body. A page that " +
        "lists nothing answers `items: []` and a `reason`. One request to the site, queued " +
        "politely: it may wait up to 15 s behind another request to the same site. " +
        "import_failed only when the page cannot be fetched at all (or its site was " +
        "dropped after refusing twice).",
      inputSchema: z.strictObject({ url: z.string().min(1) }),
      annotations: READ_ONLY,
    },
    async ({ url }) => read(() => backend.inspectList(url)),
  );

  register(
    "recipe_import_list",
    {
      title: "Import recipes from a roundup page",
      description:
        "Import the picked items of a roundup page, each through recipe_import's path as its " +
        "own commit, keeping its source. `pick` lists 1-based positions from " +
        "page_inspect_list (or items' URLs, or `remaining` entries as returned), or pass " +
        "`all: true`. Items whose page the corpus already has are skipped and reported as " +
        "`existing`. Polite and slow: requests to one site are 15 s apart, across calls — the " +
        "list page, each recipe page and each image count — and a site that refuses twice " +
        "(403) is dropped for an hour. So a call imports at most `limit` items (default 3, " +
        "about 90 s; 6 for a dry run, which fetches no images; 6 at most) and answers the " +
        "rest as `remaining: [{n, url}]`: call again with `pick: remaining` until it is " +
        "empty, unless `dropped` is set. A pick whose URL has left the list is `skipped`. " +
        "An image that cannot be fetched leaves the recipe without one and a warning. " +
        "`term` makes the list a collection: the term (an alias names its owner) is created " +
        "if missing — labelled `termLabel`, the tag's existing label, or the list's title — " +
        "and assigned to every imported and existing item, one commit at the end. Tags are " +
        "not set — use recipe_update with each result's `suggestedTags` as hints. `dryRun` " +
        "fetches the pages and writes nothing. Each result is `{n, url, name, status, slug?, " +
        "image?, suggestedTags?, error?, warnings?}`, status imported, existing, " +
        "would-import, failed or skipped; one item failing never fails the call. Errors, " +
        "before anything is fetched: validation (no pick, a pick past the end, a termLabel " +
        "that is another term's alias), no_git_identity (no committer for a real run); " +
        "after: import_failed (the list page cannot be fetched). A write refused mid-call " +
        "(dirty_tree) fails that item. `llm` as for recipe_import, on each item: under " +
        "`auto` a page with no Recipe node is imported when a local model reads it " +
        "trustworthily, and each such result carries `llm`.",
      inputSchema: z.strictObject({
        url: z.string().min(1),
        pick: z.array(ListPickSchema).max(IMPORT_LIST_MAX_PICKS).optional(),
        all: z.boolean().optional(),
        term: z.string().min(1).optional(),
        termLabel: z.string().min(1).optional(),
        dryRun: z.boolean().optional(),
        limit: z.number().int().min(1).max(IMPORT_LIST_MAX_LIMIT).optional(),
        llm: z.enum(LLM_MODES).optional(),
      }),
      annotations: WRITES,
    },
    async ({ url, ...options }) =>
      write(backend, () => backend.importList(url, options), {
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
        "`patch.slug` renames (and moves the page); every group item and featured " +
        "entry naming the old slug is rewritten in the same commit. `dryRun` returns " +
        "the record the patch would produce without writing it.",
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
        "Every tag in the corpus, sorted. Worth reading before inventing a new one. " +
        "Pass `terms: true` to also get `terms` — term_list's rows, with each " +
        "term's slug, count, parent and whether it has a record.",
      /*
       * Extended additively (31c, 24-D7): `{}` answers exactly `{tags}` as it
       * always has, and the hierarchy is opt-in.
       */
      inputSchema: z.strictObject({ terms: z.boolean().optional() }),
      annotations: READ_ONLY,
    },
    async ({ terms }) =>
      read(async () => {
        const tags = await backend.listTags();
        if (!terms) return { tags };
        return { tags, terms: (await backend.listTerms()).terms };
      }),
  );

  /* --- terms (31c) -------------------------------------------------------- */

  register(
    "term_list",
    {
      title: "List terms",
      description:
        "The tag vocabulary sorted by slug: every term a recipe or group carries plus " +
        "every term record, as {slug, label, count, parent?, aliases?, record}. `count` is the " +
        "term's own carriers; `record` says whether it has a record (a description, " +
        "picture, parent or pinned front, and it can be featured). `records: true` " +
        "lists only those.",
      inputSchema: z.strictObject({
        records: z.boolean().optional(),
        limit: Limit,
        offset: Offset,
      }),
      annotations: READ_ONLY,
    },
    async (args) => read(() => backend.listTerms(args)),
  );

  register(
    "term_get",
    {
      title: "Get a term",
      description:
        "One term: its `record` (or null when it only exists as a tag), `aliases`, " +
        "`breadcrumb` (root first), `children` with counts, `counts.own` and " +
        "`counts.withDescendants` (what tag:<slug> finds), and the recipe and group " +
        "slugs that carry it.",
      inputSchema: z.strictObject({ slug: Slug }),
      annotations: READ_ONLY,
    },
    async ({ slug }) => read(() => backend.getTerm(slug)),
  );

  register(
    "term_create",
    {
      title: "Create a term",
      description:
        "Write a term record: a `label` (the slug defaults to the label's), and " +
        "optionally a `description`, a `parent` (another record's slug — it becomes " +
        "part of tag:<parent>), `pinned` recipe slugs that lead its page (each must " +
        "already carry the tag), `aliases` (other names: tag:<alias> and " +
        "/tags/<alias> reach this term; an alias naming another term or another " +
        "term's alias is a validation error) and an `imageImportUrl`. Then " +
        "term_assign tags the recipes. A parent that would put the term under " +
        "itself is term_cycle.",
      inputSchema: z.strictObject({ term: TermInputSchema }),
      annotations: WRITES,
    },
    async ({ term }) => write(backend, () => backend.createTerm(term)),
  );

  register(
    "term_update",
    {
      title: "Update a term",
      description:
        "Patch a term record: label, description, parent, pinned, aliases, image, " +
        "date. An omitted key is left alone, null clears it (null `parent` makes it " +
        "a root). `pinned` and `aliases` replace the whole list; aliases are " +
        "search-only, so no recipe's tags change. The slug cannot change here — that is " +
        "term_rename, which also rewrites the carriers.",
      inputSchema: z.strictObject({ slug: Slug, patch: TermPatchSchema }),
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ slug, patch }) =>
      write(backend, () => backend.updateTerm(slug, patch)),
  );

  register(
    "term_set_image",
    {
      title: "Set or clear a term's picture",
      description:
        "recipe_set_image for a term record: replace its picture from a `url` " +
        "(downloaded and checked: it must be an image, under 15 MB) or a local " +
        "`path` (read by this server's process), or `clear` it — exactly one. The " +
        "term needs a record (term_create). One commit, `Update term image: " +
        "<slug>`, so git can undo it.",
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
        if (url) return backend.setTermImage(slug, { url });
        if (path) {
          return backend.setTermImage(slug, {
            file: await readImageFile(path),
          });
        }
        return backend.setTermImage(slug, { clear: true });
      }),
  );

  register(
    "term_assign",
    {
      title: "Tag or untag recipes or groups",
      description:
        "Add the term to the recipes in `add` and take it off those in `remove` " +
        '(groups instead with `type: "group"`), one write per carrier and one ' +
        "commit for the call (`Assign term: <slug> (+N recipes)`). Answers " +
        "{slug, tag, updated, unchanged, missing, warnings?}: `tag` is the string " +
        "written. An `add` naming a recipe (or group) that does not exist is refused " +
        "with unknown_recipe (unknown_group) before anything is written — import " +
        "first, then assign; `force: true` lets it through as `missing` with a " +
        "warning instead. A `remove` of one that is not there is reported under " +
        "`missing`. No record is needed — a new tag comes into being this way.",
      inputSchema: z.strictObject({
        slug: Slug,
        add: z.array(Slug).optional(),
        remove: z.array(Slug).optional(),
        type: TermCarrierTypeSchema.optional(),
        force: z.boolean().optional(),
      }),
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ slug, ...assignment }) =>
      write(backend, () => backend.assignTerm(slug, assignment)),
  );

  register(
    "term_rename",
    {
      title: "Rename a term",
      description:
        "Move a term to a new slug: `to` is the new slug or label (slugged), and " +
        "`label` sets the record's label if `to` is a bare slug. The record moves — " +
        "children and featured entries follow it — and every recipe and group " +
        "carrying the tag is rewritten — one commit for the lot. The old slug becomes " +
        "one of the record's aliases (`aliases` in the result), so tag:<slug> and " +
        "/tags/<slug> still reach the term. A `to` that already exists is " +
        "slug_conflict: use term_merge.",
      inputSchema: z.strictObject({
        slug: Slug,
        to: z.string().trim().min(1),
        label: z.string().trim().min(1).optional(),
      }),
      annotations: WRITES,
    },
    async ({ slug, ...rename }) =>
      write(backend, () => backend.renameTerm(slug, rename)),
  );

  register(
    "term_merge",
    {
      title: "Merge a term into another",
      description:
        "Fold `slug` into `into`: every carrier is re-tagged, and the record moves to " +
        "`into` (when it has none) or is deleted after its children, features and " +
        "pinned recipes move over — a feature is unfeatured instead when `into` is " +
        "already featured. `slug` becomes one of `into`'s aliases (when either has a " +
        "record), so tag:<slug> still finds it. One commit for the lot. Not undoable " +
        "from here.",
      inputSchema: z.strictObject({ slug: Slug, into: Slug }),
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ slug, into }) =>
      write(backend, () => backend.mergeTerm(slug, { into })),
  );

  register(
    "term_delete",
    {
      title: "Delete a term",
      description:
        "Delete a term record. Refused with term_in_use while recipes or groups carry " +
        "the tag, unless `unassign: true`, which removes it from each of them first. " +
        "Its children move up to its parent, and so do its featured entries — or they " +
        "are unfeatured when it has no parent or the parent is already featured " +
        "(`featured` and `unfeatured` in the result). One commit for the lot. Not " +
        "undoable from here.",
      inputSchema: z.strictObject({
        slug: Slug,
        unassign: z.boolean().optional(),
      }),
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ slug, unassign }) =>
      write(backend, () => backend.deleteTerm(slug, { unassign })),
  );

  /* --- groups ------------------------------------------------------------ */

  register(
    "group_list",
    {
      title: "List groups",
      description:
        "Meal plans (and collections written before collections became terms), newest first.",
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
        "A meal plan — an ordered list with a label per item, such as a week of " +
        "dinners. `kind` is `meal-plan` (a collection is now a term: term_create " +
        'and term_assign). Items may be `"slug"`, `"slug:label"`, `"slug:label@2"` or ' +
        "{recipe, label?, note?, scale?} — or {group, label?, note?} for a nested group. " +
        '`scale` (recipe items only) is a positive multiplier like "2", "1/2" or "1.5". ' +
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
        "A rename rewrites every parent group's item and featured entry naming it, in " +
        "the same commit. Use group_set_items for the items themselves.",
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
        'Set the whole item list, in order. Each item is `"slug"`, `"slug:label"`, ' +
        '`"slug:label@2"` or {recipe | group, label?, note?, scale?} — a `{group}` item ' +
        "nests that group inside this one. `scale` (recipe items only) is a positive " +
        'multiplier like "2", "1/2" or "1.5": the group page badges the row and links to ' +
        "the recipe scaled. This replaces what is there; use group_add_item to append.",
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
        'one) — with an optional label ("Mon · Dinner") and note. A recipe row may ' +
        'take a `scale`, a positive multiplier like "2", "1/2" or "1.5" (a double batch ' +
        "for the week): the group page badges it and links to the recipe scaled. Name " +
        "exactly one of `recipe` and `subgroup`. `force` allows a slug that names nothing yet; nothing " +
        "allows a cycle (group_cycle). Renaming or deleting a sub-group later leaves " +
        "this row pointing at the old slug, and the page says so.",
      inputSchema: GroupItemRefSchema.extend({
        group: Slug,
        label: z.string().optional(),
        note: z.string().optional(),
        scale: ScaleSchema().optional(),
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
        "Remove a group. Its recipes are untouched and items naming it in other groups " +
        "stay, shown as missing; its featured entries are unfeatured (`unfeatured` in " +
        "the result). Not undoable from here.",
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
        "second time on purpose. The entry's own slug defaults to a fresh ULID, so " +
        "features made in a burst never collide; pass `slug` only to choose one.",
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
        "The site's shared list of what is on hand — pantry items, produce, " +
        "bottles, mixers — as people write them (`chicken thighs`, `vodka`, " +
        "`Gnista`, `lime`). Matching is on the generic name, so a brand is worth " +
        "adding only when a recipe names it.",
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
        "language; every recipe by default — `tag:drink` for drinks, `-tag:drink` " +
        "for food): which can be made now, which are one or two items short and " +
        "what's missing, how many are further, and what to buy next. Salt, black " +
        "pepper, water and ice count as on hand, and so do the pantry staples " +
        `(${PANTRY_STAPLES.join(", ")}) unless \`staples: false\` — as the site's ` +
        '"Assume pantry staples" switch, on by default. A line can be met by making ' +
        "another recipe first (`makeFirst`), or by a close item (`close`: " +
        "{needs, have}, e.g. onion for a shallot), which counts as had. The same " +
        "rules the site's /make page uses.",
      inputSchema: InventoryMakeQuerySchema,
      annotations: READ_ONLY,
    },
    async (args) => read(() => backend.inventoryMakeable(args)),
  );

  /* --- shopping list (35c) ---------------------------------------------- */

  register(
    "shopping_get",
    {
      title: "The shopping list",
      description:
        "The site's shared shopping list as it reads: `text` (what a person copies — " +
        "store and aisle headings, one line per row like `2 cups flour`, ticked rows " +
        "left out) and `view` — `stores[].sections[].rows[]`, each row " +
        "{key, ids, label, name, quantity?, raw?, aisle?, store?, checked, partial, " +
        "need, optional, sources?}, plus the `onHand` and `checked` folds and " +
        "`counts`. Rows merge one ingredient across recipes, amounts scaled and " +
        "added, as the list's settings switch on. A row's `ids` (item ids, not its `key`) are what " +
        "shopping_check and shopping_remove take. `store` (a store id such as `market-basket`) narrows " +
        "to what is left at that store.",
      inputSchema: z.strictObject({ store: z.string().min(1).optional() }),
      annotations: READ_ONLY,
    },
    async ({ store }) =>
      read(async () => {
        const { view, text, settings } = await backend.getShopping({ store });
        return { text, view, settings };
      }),
  );

  register(
    "shopping_add",
    {
      title: "Add to the shopping list",
      description:
        "Put lines on the shared shopping list, one commit. Name exactly one of " +
        "`recipe` (a recipe slug: its ingredient lines), `group` (a meal plan's " +
        "slug: every recipe in it, nested plans included, each at its row's " +
        "scale) or `items` (lines typed by hand, like `paper towels` or `2 " +
        'lemons`). `scale` multiplies a recipe or a whole plan (`"2"`, ' +
        '`"1/2"`). Adding the same recipe twice adds it twice. A plan\'s missing ' +
        "recipes and sub-groups are skipped and named in `missing` and `warnings`.",
      inputSchema: ShoppingAddSchema,
      annotations: WRITES,
    },
    async (args) =>
      write(backend, () => backend.addToShopping(args), { notify: false }),
  );

  register(
    "shopping_check",
    {
      title: "Tick items on the shopping list",
      description:
        "Tick items as bought, one commit. `ids` are item ids — a row's `ids` " +
        "from shopping_get (all of them, to tick a merged row), not its `key`; " +
        '`names` tick every item of that ingredient (`["eggs"]` ' +
        'for "I bought eggs"). `uncheck: true` unticks instead. Names that match ' +
        "nothing come back in `unmatched`, ids not on the list in `unknown`.",
      inputSchema: z
        .strictObject({
          ids: z.array(z.string().min(1)).max(2000).optional(),
          names: z.array(ShoppingTextSchema).max(200).optional(),
          uncheck: z.boolean().optional(),
        })
        .refine(
          (data) => (data.ids?.length ?? 0) + (data.names?.length ?? 0) > 0,
          { message: "Name at least one id or name", path: ["ids"] },
        ),
      annotations: WRITES,
    },
    async ({ ids, names, uncheck }) =>
      write(
        backend,
        () =>
          backend.patchShopping(
            uncheck
              ? { uncheck: ids ?? [], uncheckNames: names ?? [] }
              : { check: ids ?? [], names: names ?? [] },
          ),
        { notify: false },
      ),
  );

  register(
    "shopping_remove",
    {
      title: "Remove items from the shopping list",
      description:
        "Take items off the shared shopping list, one commit: item `ids` (a row's `ids` from " +
        "shopping_get), or every item a `recipe` (slug) or a meal plan (`group` " +
        "slug) put there — exactly one of the three.",
      inputSchema: z
        .strictObject({
          ids: z.array(z.string().min(1)).min(1).max(2000).optional(),
          recipe: z.string().min(1).optional(),
          group: z.string().min(1).optional(),
        })
        .refine(
          (data) =>
            [data.ids, data.recipe, data.group].filter(
              (value) => value !== undefined,
            ).length === 1,
          {
            message: "Name exactly one of `ids`, `recipe` or `group`",
            path: ["ids"],
          },
        ),
      annotations: WRITES,
    },
    async ({ ids, recipe, group }) =>
      write(
        backend,
        () =>
          backend.patchShopping(
            ids
              ? { remove: ids }
              : {
                  removeSource: recipe !== undefined ? { recipe } : { group },
                },
          ),
        { notify: false },
      ),
  );

  register(
    "shopping_clear",
    {
      title: "Clear the shopping list",
      description:
        'Remove every ticked item (`scope: "checked"`, the default) or the whole ' +
        'list (`"all"`), one commit.',
      inputSchema: ShoppingClearSchema,
      annotations: DESTRUCTIVE_WRITE,
    },
    async (args) =>
      write(backend, () => backend.clearShopping(args), { notify: false }),
  );

  register(
    "shopping_settings_set",
    {
      title: "Change the shopping list's settings",
      description:
        "Merge a change into the list's settings, one commit: `features` " +
        "(merge, quantities, aisles, stores, onHand, sources — each on or off), " +
        "`aisleOrder`, `stores` ([{id, name}], whole), `defaultStore`, " +
        "`storeByAisle` ({aisle: store id}), `aisleOverrides` and " +
        "`storeOverrides` ({ingredient name: aisle or store id}); `null` removes " +
        "a key.",
      inputSchema: ShoppingSettingsPatchSchema,
      annotations: IDEMPOTENT_WRITE,
    },
    async (args) =>
      write(backend, () => backend.updateShoppingSettings(args), {
        notify: false,
      }),
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
        "full rebuild, so run reindex. `pendingIndex` lists paths that are " +
        "committed but not yet re-staged in git's index (another process held its " +
        "lock); they are not uncommitted changes and catch up on the next write. " +
        "ahead/behind are as of `fetchedAt`; pass " +
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
        "changed. Pass `type` (recipe, group, featured or term) to narrow it to one content " +
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

  /* --- jobs (epic 37, 37c) ---------------------------------------------- */

  register(
    "job_list",
    {
      title: "List import jobs",
      description:
        "Every import, inspect and roundup call runs as a job with a step log; this " +
        "lists them newest first as {jobs: [{id, kind, label, status, tier, queuedAt, " +
        "startedAt?, endedAt?, durationMs?, error?, waiting?, retryOf?}], total, more}. " +
        "`status` filters by queued, running, done, failed, cancelled, interrupted, or " +
        "`live` (queued and running); `kind` by import-url, import-text, inspect, " +
        "inspect-list, import-list, import-photo, form-url, form-text, form-photo or " +
        "form-batch. A `waiting` " +
        "job is in the queue for the GPU, yt-dlp or a site.",
      inputSchema: z.strictObject({
        status: z.enum(JOB_STATUS_FILTERS).optional(),
        kind: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(JOB_LIST_MAX_LIMIT).optional(),
      }),
      annotations: READ_ONLY,
    },
    async (args) => read(() => backend.listJobs(args)),
  );

  register(
    "job_get",
    {
      title: "Get an import job and its steps",
      description:
        "One job — the `job` id every import, inspect and roundup result (and a failed " +
        "one's error) carries, or its last eight characters — as {job, meta, lines, " +
        "next, live}: `meta` is its record (status, times, the spec summarised, result " +
        "or error with its warnings); `lines` its step log — fetch, yt-dlp, each model " +
        "call with its tokens, rate and GPU share, queue waits, writes — as {t, step, " +
        "phase: start|end|note, n, parent, ms, ok, msg, error, data}. Pass `from` (the " +
        "`next` of an earlier call) to read only what was written since; `live` is " +
        "true while it runs.",
      inputSchema: z.strictObject({
        id: z.string().min(4),
        from: z.number().int().min(0).optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ id, from }) =>
      read(() => backend.getJob(id, from === undefined ? {} : { from })),
  );

  if (info.readOnly) {
    for (const tool of registered) {
      if (tool.annotations?.readOnlyHint !== true) tool.remove();
    }
  }

  return server;
}

export default createRecipeServer;
