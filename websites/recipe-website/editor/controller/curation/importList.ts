/**
 * Roundup ("meta-list") import (epic 34, D11): read a list page, then import
 * the recipes it names, politely.
 *
 * Two seats beside epic 26's `inspect` → draft → create:
 *
 * - **`inspectList`** fetches one page and answers `{title, items}` — each
 *   item `{n, url, name, image?, existing?}`, `n` its 1-based position and
 *   `existing` the slug of a recipe whose `source.url` is that page. Read-only.
 * - **`importList`** fetches the list again and imports the picks one by one
 *   through the importer's own path (`importedToInput` → `createRecipe`), so
 *   each recipe is its own commit and no write lock is held across the run.
 *   `existing` items are skipped and reported. With `term`, the term record is
 *   created if missing and assigned to every imported and existing item —
 *   create and assign in one commit (F34), at the end of the call.
 *
 * ## Politeness (30-D5)
 *
 * Every request goes through the process's per-site queue (`sitePacing.ts`):
 * one at a time per site, at least 15 s after the last one ended, the list
 * page, recipe pages, images and 403 retries alike — across calls too. A
 * site that refuses twice is dropped for an hour; its picks stay in
 * `remaining`.
 *
 * One real import is two requests (the page and its image), so a call is
 * capped (`limit`, default `IMPORT_LIST_LIMIT`, at most
 * `IMPORT_LIST_MAX_LIMIT`): 1 + 3 × 2 requests is six 15 s gaps, about 90 s,
 * inside an MCP client's patience; the maximum, 1 + 6 × 2, is about 3 min,
 * well inside Node's 300 s headers timeout for `/api/import-list`. A dry run
 * skips the image, so its default cap is twice that. What the cap left comes
 * back as `remaining: [{n, url}]`, and the caller runs again with
 * `pick: remaining` to continue — the URLs are checked against the list as it
 * is then, so an edited roundup cannot shift a pick onto another recipe.
 *
 * The clock is a seam (`Pacing`) so tests assert the spacing without waiting
 * for it.
 *
 * ## The local model (36b)
 *
 * Each item goes through `applyLlm` (epic 36, D3) with the call's `llm` mode,
 * default `auto`: a recipe page with no Recipe node — refused as `partial`
 * before 36b — is read by the local model when one is configured, and
 * imported when the model's reading is trusted (D4). The model call is not a
 * request to the site, so it is not paced; it does make the call longer
 * (~4–45 s an item on qwen3:8b).
 */
import { getIndexDirectory } from "@discontent/cms/content/database";
import { environmentExists } from "@discontent/cms/lmdb/environmentCache";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { hostnameLabel } from "recipe-website-common/util/hostnameLabel";
import {
  isVideoUrl,
  type FetchedPage,
} from "recipe-website-common/util/importRecipeData";
import { jobContext, type JobContext, type JobRun } from "../jobs/context";
import { fetchPageStep, headSha, parsePage } from "../jobs/steps";
import {
  parseRoundupPage,
  sourceUrlKey,
  type ParsedRoundup,
  type RoundupSource,
} from "recipe-website-common/util/roundupPage";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import type { TagTerm } from "recipe-website-common/controller/types";
import { z } from "zod";
import { fetchImageFile } from "../imageImport";
import { countsTail, withBatchCommit } from "./batch";
import type { CurationContext } from "./context";
import {
  ImportError,
  NotFoundError,
  ValidationError,
  toErrorObject,
  type ErrorObject,
} from "./errors";
import { importedToInput } from "./importRecipe";
import {
  LLM_MODES,
  applyLlm,
  assertLlmMode,
  usedModel,
  type LlmImportInfo,
  type LlmMode,
} from "../llm/importWithLlm";
import {
  createRecipe,
  getRecipe,
  readAllRecipeRows,
  resolveCreateSlug,
} from "./recipes";
import { parseInput } from "./schema";
import {
  SiteDroppedError,
  SitePacer,
  realPacing,
  type Pacing,
} from "./sitePacing";
import {
  assignTerm,
  createTerm,
  getTerm,
  termAliasOwners,
  type TermAssignResult,
} from "./terms";

export { POLITE_GAP_MS, SiteState, type Pacing } from "./sitePacing";

/** Items one real `importList` call attempts, by default: ~90 s of pacing. */
export const IMPORT_LIST_LIMIT = 3;

/** A dry run fetches only pages, so the same ~90 s covers twice as many. */
export const IMPORT_LIST_DRY_RUN_LIMIT = 6;

/**
 * The most `limit` may ask for: 1 + 6 × 2 requests, about 3 min of pacing —
 * under Node's 300 s headers timeout, which a `--remote` CLI call or any
 * other HTTP client of `/api/import-list` waits within.
 */
export const IMPORT_LIST_MAX_LIMIT = 6;

/** The most picks one call may name (a range typo should not be a loop). */
export const IMPORT_LIST_MAX_PICKS = 1000;

/* ------------------------------------------------------------------ */
/* inspectList                                                         */
/* ------------------------------------------------------------------ */

export interface RoundupItem {
  /** 1-based, as listed: what `pick` names. */
  n: number;
  url: string;
  name: string;
  image?: string;
  /** The slug of a recipe already imported from this page. */
  existing?: string;
}

export interface InspectListResult {
  /** The job that ran it (epic 37): `recipes jobs show <job>` has its steps. */
  job?: string;
  url: string;
  finalUrl: string;
  status: number;
  title?: string;
  /** `itemlist` (schema.org JSON-LD) or `links` (the article body's). */
  source?: RoundupSource;
  items: RoundupItem[];
  /** Why `items` is empty, when it is. */
  reason?: string;
  /** The recipe index is missing, so nothing is marked `existing` (35p). */
  warnings?: string[];
}

/** What a caller (a test) may swap: the clock; and the job (epic 37). */
export interface ImportListDeps {
  pacing?: Pacing;
  job?: JobRun;
}

/**
 * Said when the recipe index is not built (35p): every item would read as
 * new, so a `--term` run or an `--all` would re-import what the corpus has.
 */
export const MISSING_INDEX_WARNING =
  "The recipes index is missing, so `existing` is empty — every item reads as new. Reindex first (recipes reindex).";

/**
 * `source.url` key → recipe slug, for the recipes from `urls`' hosts, and a
 * warning when there is no recipe index to ask.
 *
 * The recipe index carries each recipe's source *host* (27d) but not its URL,
 * so only the recipes from the hosts in question are read whole. An unbuilt
 * index reads as empty (F30) — `readContentIndex` checks
 * `environmentExists` and answers nothing — which is indistinguishable from
 * "none of these are here" unless it is said (epic 34's 34e: a scratch clone
 * without a reindex marked nothing `existing`).
 */
async function existingBySource(
  ctx: CurationContext,
  urls: string[],
): Promise<{ found: Map<string, string>; warnings: string[] }> {
  const found = new Map<string, string>();
  if (
    !environmentExists(
      getIndexDirectory(recipeContentConfig, ctx.contentDirectory),
    )
  ) {
    return { found, warnings: [MISSING_INDEX_WARNING] };
  }
  const hosts = new Set(
    urls.map(hostnameLabel).filter((host): host is string => Boolean(host)),
  );
  if (hosts.size === 0) return { found, warnings: [] };
  const rows = (await readAllRecipeRows(ctx)).filter(
    (row) => row.sourceHost && hosts.has(row.sourceHost),
  );
  const details = await Promise.all(
    rows.map((row) => getRecipe(ctx, row.slug).catch(() => undefined)),
  );
  for (const detail of details) {
    const sourceUrl = detail?.recipe.source?.url;
    const key = sourceUrl ? sourceUrlKey(sourceUrl) : undefined;
    if (key && !found.has(key)) found.set(key, detail!.slug);
  }
  return { found, warnings: [] };
}

function toItems(
  parsed: ParsedRoundup,
  existing: Map<string, string>,
): RoundupItem[] {
  return parsed.items.map((item, index) => {
    const slug = existing.get(sourceUrlKey(item.url) ?? "");
    return {
      n: index + 1,
      url: item.url,
      name: item.name,
      ...(item.image ? { image: item.image } : {}),
      ...(slug ? { existing: slug } : {}),
    };
  });
}

function checkUrl(rawUrl: string): string {
  const url = rawUrl.split("#")[0].trim();
  if (!URL.canParse(url) || !/^https?:$/.test(new URL(url).protocol)) {
    throw new ValidationError(`"${rawUrl}" is not an http(s) URL`);
  }
  return url;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The roundup page itself: queued, and refused outright after a second 403. */
async function fetchListPage(
  pacer: SitePacer,
  url: string,
  job: JobContext,
): Promise<FetchedPage> {
  let page: FetchedPage;
  try {
    page = await pacer.request(
      url,
      (retry) => fetchPageStep(url, retry, job),
      (fetched) => fetched.finalUrl,
    );
  } catch (error) {
    if (error instanceof SiteDroppedError || job.signal?.aborted) throw error;
    throw new ImportError(`Could not fetch ${url}: ${describe(error)}`);
  }
  if (page.status === 403) {
    pacer.drop(url, `refused (HTTP 403) at ${url}`);
    throw new ImportError(
      `${url} answered 403 twice — its site is dropped for an hour.`,
    );
  }
  return page;
}

/** The roundup's list as a `parse` step: how it was found, how many. */
function parseListStep(
  page: FetchedPage,
  url: string,
  { log }: JobContext,
): Promise<ParsedRoundup> {
  return log.step("parse", { list: true }, (step) => {
    const parsed = parseRoundupPage(page.html, page.finalUrl || url);
    step.set({
      items: parsed.items.length,
      ...(parsed.source ? { source: parsed.source } : {}),
      ...(parsed.reason ? { reason: parsed.reason } : {}),
    });
    return parsed;
  });
}

/**
 * Read a roundup page and list its recipes, marking the ones the corpus
 * already has. One request (two after a 403), in the site's queue — so it can
 * wait up to 15 s behind another request to the same site; nothing written.
 * Throws `ImportError` only when the page cannot be fetched at all.
 */
export async function inspectList(
  ctx: CurationContext,
  rawUrl: string,
  { pacing = realPacing(), job: run }: ImportListDeps = {},
): Promise<InspectListResult> {
  const job = jobContext(run);
  const url = checkUrl(rawUrl);
  const page = await fetchListPage(new SitePacer(pacing, job), url, job);
  const parsed = await parseListStep(page, url, job);
  const existing = await existingBySource(
    ctx,
    parsed.items.map((item) => item.url),
  );
  const items = toItems(parsed, existing.found);
  const reason =
    parsed.reason ??
    (page.ok ? undefined : `The page answered HTTP ${page.status}.`);
  return {
    url,
    finalUrl: page.finalUrl,
    status: page.status,
    ...(parsed.title ? { title: parsed.title } : {}),
    ...(parsed.source ? { source: parsed.source } : {}),
    items,
    ...(items.length === 0 && reason ? { reason } : {}),
    ...(existing.warnings.length ? { warnings: existing.warnings } : {}),
  };
}

/* ------------------------------------------------------------------ */
/* importList                                                          */
/* ------------------------------------------------------------------ */

/**
 * A pick: a position from `inspectList`, a URL from it, or a `remaining`
 * entry `{n, url}` handed back as it came. The two with a URL are checked
 * against the list as fetched now.
 */
export const ListPickSchema = z.union([
  z.number().int().min(1),
  z.string().min(1),
  z.strictObject({ n: z.number().int().min(1), url: z.string().min(1) }),
]);

export type ListPick = z.infer<typeof ListPickSchema>;

export const ImportListOptionsSchema = z
  .strictObject({
    pick: z.array(ListPickSchema).min(1).max(IMPORT_LIST_MAX_PICKS).optional(),
    all: z.boolean().optional(),
    /** Make the list a collection: this term, created if missing, on every item. */
    term: z.string().trim().min(1).optional(),
    /** The created term's label; default an existing tag's label, else the list's title. */
    termLabel: z.string().trim().min(1).optional(),
    dryRun: z.boolean().optional(),
    limit: z.number().int().min(1).max(IMPORT_LIST_MAX_LIMIT).optional(),
    /** The local model on each item: `auto` (default), `force`, `off` (36b). */
    llm: z.enum(LLM_MODES).optional(),
  })
  .refine((data) => Boolean(data.pick?.length) !== Boolean(data.all), {
    message: "Pass `pick` (positions from inspect-list) or `all` — one of them",
    path: ["pick"],
  })
  .refine((data) => !data.termLabel || data.term, {
    message: "`termLabel` labels the `term` — pass `term` too",
    path: ["termLabel"],
  });

export type ImportListOptions = z.infer<typeof ImportListOptionsSchema>;

export type ImportListItemStatus =
  | "imported"
  | "existing"
  | "would-import"
  | "failed"
  | "skipped";

export interface ImportListItemResult {
  /** The item's position on the list as fetched now; 0 when it is gone. */
  n: number;
  url: string;
  /** The list's name for it; `slug` is what the recipe is stored under. */
  name: string;
  /** `skipped`: a URL pick no longer on the list (see `warnings`). */
  status: ImportListItemStatus;
  slug?: string;
  /** The image a real import downloads (a dry run does not fetch it). */
  image?: string;
  /** The page's own categories — hints for tagging, never applied. */
  suggestedTags?: string[];
  /** The local model's part (36b), whenever it was asked. */
  llm?: LlmImportInfo;
  error?: ErrorObject["error"];
  warnings?: string[];
}

export interface ImportListTermResult {
  slug: string;
  label?: string;
  /** This call created the record (in a dry run: would create it). */
  created: boolean;
  tag?: string;
  updated?: string[];
  unchanged?: string[];
  missing?: string[];
  /** A dry run: the recipes a real run would assign the term to. */
  assign?: string[];
  error?: ErrorObject["error"];
  warnings?: string[];
}

export interface RemainingPick {
  n: number;
  url: string;
}

export interface ImportListResult {
  /** The job that ran it (epic 37): `recipes jobs show <job>` has its steps. */
  job?: string;
  url: string;
  title?: string;
  source?: RoundupSource;
  dryRun?: true;
  /** Items on the list. */
  total: number;
  /** The positions this call resolved its picks to, in order. */
  picked: number[];
  /** One entry per pick, in pick order — but `remaining` ones. */
  results: ImportListItemResult[];
  /** Picks not attempted — the cap, or a dropped site. Pass back as `pick`. */
  remaining: RemainingPick[];
  /** Sites dropped after a second 403, with why. Don't re-run at once. */
  dropped?: { site: string; reason: string }[];
  term?: ImportListTermResult;
  /** Requests this call made, the list page and 403 retries included. */
  requests: number;
  /** Why the list had no items, when it had none. */
  reason?: string;
  /** The recipe index is missing, so nothing was `existing` (35p). */
  warnings?: string[];
}

function errorOf(error: unknown): ErrorObject["error"] {
  return toErrorObject(error).error;
}

async function slugTaken(ctx: CurationContext, slug: string): Promise<boolean> {
  try {
    await getRecipe(ctx, slug);
    return true;
  } catch (error) {
    if (error instanceof NotFoundError) return false;
    throw error;
  }
}

/* --- the term, decided before the first fetch ---------------------------- */

interface TermPlan {
  slug: string;
  record: TagTerm | null;
  /** Known before the fetch: the record's, the caller's, or the tag's own. */
  label?: string;
  warnings: string[];
}

/**
 * Resolve `term` the way `tag:` does — an alias names its owner — and settle
 * what can be settled before anything is fetched: whether the record exists,
 * and a label that is not another term's alias.
 */
async function planTerm(
  ctx: CurationContext,
  raw: string,
  termLabel: string | undefined,
): Promise<TermPlan> {
  let slug = tagSlug(raw);
  if (!slug)
    throw new ValidationError(`"${raw}" does not slugify to anything.`);
  const warnings: string[] = [];
  const owners = await termAliasOwners(ctx, slug);
  if (owners.slug) {
    warnings.push(
      `"${slug}" is an alias of "${owners.slug}": using that term.`,
    );
    slug = owners.slug;
  }
  let detail;
  try {
    detail = await getTerm(ctx, slug);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  const record = detail?.record ?? null;
  if (record) return { slug, record, label: record.label, warnings };
  /* No record: the caller's label, else the tag's own (it may be carried). */
  const label = termLabel ?? detail?.label;
  if (termLabel) {
    const { label: owner } = await termAliasOwners(ctx, slug, termLabel);
    if (owner) {
      throw new ValidationError(
        `"${termLabel}" is an alias of the term "${owner}" — pick another termLabel.`,
        [{ path: "termLabel", message: `an alias of "${owner}"` }],
      );
    }
  }
  return { slug, record: null, ...(label ? { label } : {}), warnings };
}

/** The label to create with, once the list's title is known. */
async function finishLabel(
  ctx: CurationContext,
  plan: TermPlan,
  title: string | undefined,
): Promise<string> {
  if (plan.label) return plan.label;
  if (title) {
    const { label: owner } = await termAliasOwners(ctx, plan.slug, title);
    if (!owner) return title;
    plan.warnings.push(
      `The list's title "${title}" is an alias of "${owner}"; labelled "${plan.slug}" instead.`,
    );
  }
  return plan.slug;
}

/** Create the term if missing and assign it — one commit (F34). */
async function applyTerm(
  ctx: CurationContext,
  plan: TermPlan,
  label: string,
  carriers: string[],
): Promise<ImportListTermResult> {
  let created = false;
  let assigned: TermAssignResult | undefined;
  const warnings = [...plan.warnings];
  try {
    await withBatchCommit(
      ctx,
      () =>
        `${created ? "Create" : "Assign"} term: ${plan.slug}` +
        countsTail([[assigned?.updated.length ?? 0, "recipe", "+"]]),
      async (batchCtx) => {
        if (!plan.record) {
          const made = await createTerm(batchCtx, { label, slug: plan.slug });
          created = true;
          warnings.push(...(made.warnings ?? []));
        }
        assigned = await assignTerm(batchCtx, plan.slug, { add: carriers });
      },
    );
  } catch (error) {
    /* A partial: whatever was written is committed "(partial)" (F34). */
    return {
      slug: plan.slug,
      label,
      created,
      error: errorOf(error),
      ...(warnings.length ? { warnings } : {}),
    };
  }
  return {
    slug: plan.slug,
    label,
    created,
    tag: assigned!.tag,
    updated: assigned!.updated,
    unchanged: assigned!.unchanged,
    missing: assigned!.missing,
    ...(warnings.length ? { warnings } : {}),
  };
}

/* --- one item ------------------------------------------------------------- */

/**
 * Import one list item: its page, mapped by the importer; then (unless a dry
 * run) its image, then `createRecipe` with it. An image that cannot be had —
 * its site dropped, a refused or broken download — does not fail the item:
 * the recipe is created without it and says so, for `recipe_set_image` later.
 */
async function importItem(
  ctx: CurationContext,
  pacer: SitePacer,
  item: RoundupItem,
  dryRun: boolean,
  mode: LlmMode | undefined,
  job: JobContext,
): Promise<ImportListItemResult> {
  const { log } = job;
  const base = { n: item.n, url: item.url, name: item.name };
  if (isVideoUrl(item.url)) {
    throw new ImportError(
      `${item.url} is a video page — import it on its own with recipe_import.`,
    );
  }

  const page = await pacer.request(
    item.url,
    (retry) => fetchPageStep(item.url, retry, job),
    (fetched) => fetched.finalUrl,
  );
  if (page.status === 403) {
    pacer.drop(item.url, `refused (HTTP 403) at ${item.url}`);
    throw new ImportError(`${item.url} answered 403 twice.`);
  }
  /* Relative image URLs resolve against where the page ended up. */
  const { parsed, mapped } = await parsePage(item.url, page, {
    base: page.finalUrl || item.url,
    job,
  });
  const {
    recipe: imported,
    llm,
    warnings: llmWarnings,
  } = await applyLlm({
    url: item.url,
    source: { html: page.html, ok: page.ok, meta: parsed.meta },
    mapped,
    mode,
    job,
  });
  const said = llmWarnings.length ? ` (${llmWarnings.join("; ")})` : "";
  if (!imported) {
    throw new ImportError(
      page.ok
        ? `No recipe found at ${item.url}${said}.`
        : `${item.url} answered HTTP ${page.status}.`,
    );
  }
  if (imported.partial) {
    throw new ImportError(
      (usedModel(llm)
        ? `The local model's reading of ${item.url} is partial${said}. `
        : `No schema.org Recipe at ${item.url} — only its title, description and image${said}. `) +
        "Inspect it and create it by hand, or skip it.",
    );
  }
  const input = importedToInput(imported);
  const slug = resolveCreateSlug(input);
  /* Before the image download, so a taken slug costs no request. */
  if (await slugTaken(ctx, slug)) {
    throw new ValidationError(
      `A recipe already has the slug "${slug}" (from another source) — import this one on its own with a slug.`,
    );
  }
  const hints = {
    ...(imported.suggestedTags?.length
      ? { suggestedTags: imported.suggestedTags }
      : {}),
    ...(llm ? { llm } : {}),
  };

  if (dryRun) {
    return {
      ...base,
      status: "would-import",
      slug,
      ...(input.imageImportUrl ? { image: input.imageImportUrl } : {}),
      ...hints,
      ...(llmWarnings.length ? { warnings: llmWarnings } : {}),
    };
  }

  const warnings: string[] = [...llmWarnings];
  const imageUrl = input.imageImportUrl ?? undefined;
  let file: File | undefined;
  if (imageUrl) {
    try {
      file = await pacer.request(imageUrl, (retry) =>
        fetchImageFile(imageUrl, { retry, job }),
      );
    } catch (error) {
      log.warn("image", `skipped — ${describe(error)}`, { skipped: true });
      warnings.push(
        `Imported without its image (${describe(error)}) — set one later with recipe_set_image.`,
      );
    }
  }
  const result = await log.step("write", { slug }, async (step) => {
    const written = await createRecipe(
      ctx,
      file ? input : { ...input, imageImportUrl: undefined },
      {
        ...(file ? { fetchImage: async () => file } : {}),
        ...(usedModel(llm) ? { commitNote: "local model" } : {}),
      },
    );
    step.set({
      slug: written.slug,
      ...(log.live ? { commit: await headSha(ctx.contentDirectory) } : {}),
    });
    return written;
  });
  warnings.push(...(result.warnings ?? []));
  return {
    ...base,
    status: "imported",
    slug: result.slug,
    ...(file && imageUrl ? { image: imageUrl } : {}),
    ...hints,
    ...(warnings.length ? { warnings } : {}),
  };
}

/* --- picks ---------------------------------------------------------------- */

type Resolved =
  | { item: RoundupItem; warning?: string }
  | { gone: ImportListItemResult };

/** Each pick as an item of the list as fetched now, or why it is not one. */
function resolvePicks(
  picks: ListPick[],
  items: RoundupItem[],
  reason: string | undefined,
): Resolved[] {
  const byKey = new Map(
    items.map((item) => [sourceUrlKey(item.url) ?? item.url, item]),
  );
  const outOfRange = picks.filter(
    (pick): pick is number => typeof pick === "number" && pick > items.length,
  );
  if (outOfRange.length > 0) {
    throw new ValidationError(
      items.length === 0
        ? `The page lists no recipes${reason ? `: ${reason}` : "."}`
        : `No item ${outOfRange.join(", ")} — the list has ${items.length}.`,
    );
  }
  return picks.map((pick): Resolved => {
    if (typeof pick === "number") return { item: items[pick - 1] };
    const url = typeof pick === "string" ? pick : pick.url;
    const key = (URL.canParse(url) && sourceUrlKey(url)) || url;
    const at = typeof pick === "string" ? undefined : items[pick.n - 1];
    if (at && (sourceUrlKey(at.url) ?? at.url) === key) return { item: at };
    const found = byKey.get(key);
    if (found) {
      return typeof pick === "string"
        ? { item: found }
        : {
            item: found,
            warning: `The list changed: ${url} was item ${pick.n}, is now ${found.n}.`,
          };
    }
    return {
      gone: {
        n: 0,
        url,
        name: url,
        status: "skipped",
        warnings: [
          `${url} is no longer on the list${typeof pick === "string" ? "" : ` (it was item ${pick.n})`} — skipped.`,
        ],
      },
    };
  });
}

/* --- the seat ------------------------------------------------------------- */

/**
 * Import the picked items of a roundup, politely and one commit each.
 *
 * Failures of one item are reported in its result and the call goes on; the
 * call itself throws only for bad input (`validation`, checked before any
 * fetch — the term included) or a list page that cannot be fetched
 * (`import_failed`).
 */
export async function importList(
  ctx: CurationContext,
  rawUrl: string,
  rawOptions: unknown,
  { pacing = realPacing(), job: run }: ImportListDeps = {},
): Promise<ImportListResult> {
  const job = jobContext(run);
  const options = parseInput(ImportListOptionsSchema, rawOptions);
  const url = checkUrl(rawUrl);
  assertLlmMode(options.llm);
  const dryRun = options.dryRun === true;
  const plan = options.term
    ? await planTerm(ctx, options.term, options.termLabel)
    : undefined;
  const limit =
    options.limit ?? (dryRun ? IMPORT_LIST_DRY_RUN_LIMIT : IMPORT_LIST_LIMIT);
  const pacer = new SitePacer(pacing, job);

  const page = await fetchListPage(pacer, url, job);
  const parsed = await parseListStep(page, url, job);
  const existing = await existingBySource(
    ctx,
    parsed.items.map((item) => item.url),
  );
  const items = toItems(parsed, existing.found);
  const resolved = resolvePicks(
    options.all ? items.map((item) => item.n) : (options.pick ?? []),
    items,
    parsed.reason,
  );

  const results: ImportListItemResult[] = [];
  const remaining: RemainingPick[] = [];
  const picked: number[] = [];
  const seen = new Set<number>();
  let attempted = 0;
  for (const entry of resolved) {
    if ("gone" in entry) {
      results.push(entry.gone);
      continue;
    }
    const { item, warning } = entry;
    if (seen.has(item.n)) continue;
    seen.add(item.n);
    picked.push(item.n);
    const notes = warning ? { warnings: [warning] } : {};
    const base = { n: item.n, url: item.url, name: item.name };
    if (item.existing) {
      results.push({
        ...base,
        status: "existing",
        slug: item.existing,
        ...notes,
      });
      continue;
    }
    if (attempted >= limit || pacer.droppedReason(item.url)) {
      remaining.push({ n: item.n, url: item.url });
      continue;
    }
    attempted += 1;
    try {
      const result = await importItem(
        ctx,
        pacer,
        item,
        dryRun,
        options.llm,
        job,
      );
      results.push(
        warning
          ? { ...result, warnings: [warning, ...(result.warnings ?? [])] }
          : result,
      );
    } catch (error) {
      /* A cancel ends the call, not just this item. */
      if (job.signal?.aborted) throw error;
      if (error instanceof SiteDroppedError) {
        /* Dropped while this call waited in the queue: nothing fetched. */
        attempted -= 1;
        remaining.push({ n: item.n, url: item.url });
        continue;
      }
      results.push({
        ...base,
        status: "failed",
        error: errorOf(error),
        ...notes,
      });
    }
  }

  let termResult: ImportListTermResult | undefined;
  if (plan) {
    const carriers = [
      ...new Set(
        results
          .filter((result) =>
            dryRun
              ? result.status === "would-import" || result.status === "existing"
              : result.status === "imported" || result.status === "existing",
          )
          .map((result) => result.slug!),
      ),
    ];
    const label = await finishLabel(ctx, plan, parsed.title);
    if (dryRun) {
      termResult = {
        slug: plan.slug,
        label,
        created: !plan.record,
        assign: carriers,
        ...(plan.warnings.length ? { warnings: plan.warnings } : {}),
      };
    } else if (carriers.length > 0) {
      termResult = await applyTerm(ctx, plan, label, carriers);
    } else {
      termResult = {
        slug: plan.slug,
        label,
        created: false,
        updated: [],
        ...(plan.warnings.length ? { warnings: plan.warnings } : {}),
      };
    }
  }

  return {
    url,
    ...(parsed.title ? { title: parsed.title } : {}),
    ...(parsed.source ? { source: parsed.source } : {}),
    ...(dryRun ? { dryRun: true as const } : {}),
    total: items.length,
    picked,
    results,
    remaining,
    ...(pacer.dropped.size > 0
      ? {
          dropped: [...pacer.dropped].map(([site, reason]) => ({
            site,
            reason,
          })),
        }
      : {}),
    ...(termResult ? { term: termResult } : {}),
    requests: pacer.requests,
    ...(items.length === 0 && parsed.reason ? { reason: parsed.reason } : {}),
    ...(existing.warnings.length ? { warnings: existing.warnings } : {}),
  };
}
