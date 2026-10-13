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
 * Requests to one site are sequential and at least 15 s apart, measured from
 * the end of one to the start of the next; the list page, each recipe page,
 * each image and each 403 retry all count, and "one site" is `siteKey` (so a
 * `cdn.` host paces with its site). A 403 is retried once, as the browser
 * would ask (`fetchRetrying403`'s header swap); a second refusal drops the
 * site for the rest of the call and leaves its picks in `remaining`. Nothing
 * is fetched in parallel.
 *
 * One real import is two requests (the page and its image), so a call is
 * capped (`limit`, default `IMPORT_LIST_LIMIT`) to keep it inside an MCP
 * client's timeout: 1 + 3 × 2 requests is six 15 s gaps, about 90 s. A dry
 * run skips the image, so its default cap is twice that. What the cap left
 * comes back as `remaining`, and the caller runs again with
 * `pick: remaining` to continue.
 *
 * The clock is a seam (`Pacing`) so tests assert the spacing without waiting
 * for it; a loopback host (a local fixture server) is not paced unless the
 * pacing asks for it.
 */
import { hostnameLabel } from "recipe-website-common/util/hostnameLabel";
import {
  fetchRecipePage,
  isVideoUrl,
  mapRecipePage,
  parseRecipePage,
  type FetchedPage,
  type ForbiddenRetry,
} from "recipe-website-common/util/importRecipeData";
import {
  parseRoundupPage,
  siteKey,
  sourceUrlKey,
  type ParsedRoundup,
  type RoundupSource,
} from "recipe-website-common/util/roundupPage";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
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
  createRecipe,
  getRecipe,
  readAllRecipeRows,
  resolveCreateSlug,
} from "./recipes";
import { parseInput } from "./schema";
import {
  assignTerm,
  createTerm,
  getTerm,
  type TermAssignResult,
} from "./terms";

/** 30-D5: the least time between two requests to one site. */
export const POLITE_GAP_MS = 15_000;

/** Items one real `importList` call attempts, by default: ~90 s of pacing. */
export const IMPORT_LIST_LIMIT = 3;

/** A dry run fetches only pages, so the same ~90 s covers twice as many. */
export const IMPORT_LIST_DRY_RUN_LIMIT = 6;

/** The most `limit` may ask for in one call. */
export const IMPORT_LIST_MAX_LIMIT = 50;

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
  url: string;
  finalUrl: string;
  status: number;
  title?: string;
  /** `itemlist` (schema.org JSON-LD) or `links` (the article body's). */
  source?: RoundupSource;
  items: RoundupItem[];
  /** Why `items` is empty, when it is. */
  reason?: string;
}

/**
 * `source.url` key → recipe slug, for the recipes from `urls`' hosts.
 *
 * The recipe index carries each recipe's source *host* (27d) but not its URL,
 * so only the recipes from the hosts in question are read whole.
 */
async function existingBySource(
  ctx: CurationContext,
  urls: string[],
): Promise<Map<string, string>> {
  const hosts = new Set(
    urls.map(hostnameLabel).filter((host): host is string => Boolean(host)),
  );
  const found = new Map<string, string>();
  if (hosts.size === 0) return found;
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
  return found;
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

function listResult(
  url: string,
  page: FetchedPage,
  parsed: ParsedRoundup,
  items: RoundupItem[],
): InspectListResult {
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
  };
}

/**
 * Read a roundup page and list its recipes, marking the ones the corpus
 * already has. One request (two after a 403), on the same per-site clock as
 * `importList`; nothing written. Throws `ImportError` only when the page
 * cannot be fetched at all.
 */
export async function inspectList(
  ctx: CurationContext,
  rawUrl: string,
  { pacing = realPacing }: ImportListDeps = {},
): Promise<InspectListResult> {
  const url = checkUrl(rawUrl);
  const page = await fetchListPage(new SitePacer(pacing), url);
  const parsed = parseRoundupPage(page.html, page.finalUrl || url);
  const existing = await existingBySource(
    ctx,
    parsed.items.map((item) => item.url),
  );
  return listResult(url, page, parsed, toItems(parsed, existing));
}

/* ------------------------------------------------------------------ */
/* Pacing                                                              */
/* ------------------------------------------------------------------ */

/** The clock `importList` paces on: the real one, or a test's. */
export interface Pacing {
  now(): number;
  sleep(ms: number): Promise<void>;
  /** Least milliseconds between two requests to one site; default 15 000. */
  gapMs?: number;
  /**
   * Pace loopback hosts too. Off by default: a fixture server on 127.0.0.1 is
   * not a site to be polite to, and the CLI's process tests use one. The
   * vitest suite turns it on to watch the spacing.
   */
  paceLoopback?: boolean;
  /**
   * When each site's last request ended, kept across calls. Default: this
   * process's (`siteClock`), so `inspectList` then `importList`, or an
   * `importList` re-run on `remaining`, is spaced like requests within a call.
   */
  memory?: Map<string, number>;
}

/**
 * The process's per-site clock. The stdio MCP server and the editor are
 * long-lived, so back-to-back calls from the skill share it; a CLI run is a
 * fresh process and starts empty (the skill's fallback note says to leave
 * 15 s between runs).
 */
const siteClock = new Map<string, number>();

export const realPacing: Pacing = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

function isLoopback(url: string): boolean {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || /^127\./.test(host);
}

/** Thrown to stop work on a site the call has dropped. */
class SiteDroppedError extends ImportError {}

/**
 * One call's per-site clock and its dropped sites.
 *
 * `request` waits out the gap since the site's last request *ended*, runs the
 * request, and hands it a `beforeRetry` that ends this request and waits
 * again — `fetchRetrying403` awaits it in place of its own delay, so a 403
 * retry is spaced and counted like any other request.
 */
class SitePacer {
  private readonly lastEnd: Map<string, number>;
  /** Per call: a dropped site is retried by the next call, not this one. */
  readonly dropped = new Map<string, string>();
  requests = 0;

  constructor(private readonly pacing: Pacing) {
    this.lastEnd = pacing.memory ?? siteClock;
  }

  site(url: string): string {
    return siteKey(url) ?? url;
  }

  isDropped(url: string): boolean {
    return this.dropped.has(this.site(url));
  }

  drop(url: string, reason: string): void {
    const site = this.site(url);
    if (!this.dropped.has(site)) this.dropped.set(site, reason);
  }

  private gap(url: string): number {
    if (!this.pacing.paceLoopback && isLoopback(url)) return 0;
    return this.pacing.gapMs ?? POLITE_GAP_MS;
  }

  private async wait(url: string): Promise<void> {
    const site = this.site(url);
    const reason = this.dropped.get(site);
    if (reason) {
      throw new SiteDroppedError(`${site} is dropped for this call: ${reason}`);
    }
    const last = this.lastEnd.get(site);
    if (last === undefined) return;
    const wait = last + this.gap(url) - this.pacing.now();
    if (wait > 0) await this.pacing.sleep(wait);
  }

  private end(url: string): void {
    this.lastEnd.set(this.site(url), this.pacing.now());
  }

  async request<T>(
    url: string,
    run: (retry: ForbiddenRetry) => Promise<T>,
  ): Promise<{ value: T; forbidden: boolean }> {
    await this.wait(url);
    this.requests += 1;
    let forbidden = false;
    try {
      /* `enabled` is left to `RECIPE_FETCH_403_DELAY_MS` (`off` = never retry). */
      const value = await run({
        beforeRetry: async () => {
          forbidden = true;
          this.end(url);
          await this.wait(url);
          this.requests += 1;
        },
      });
      return { value, forbidden };
    } catch (error) {
      if (forbidden) {
        this.drop(url, `refused (HTTP 403), and the retry failed, at ${url}`);
      }
      throw error;
    } finally {
      this.end(url);
    }
  }
}

/** The roundup page itself: paced, and refused outright after a second 403. */
async function fetchListPage(
  pacer: SitePacer,
  url: string,
): Promise<FetchedPage> {
  let page: FetchedPage;
  try {
    ({ value: page } = await pacer.request(url, (retry) =>
      fetchRecipePage(url, retry),
    ));
  } catch (error) {
    throw new ImportError(`Could not fetch ${url}: ${describe(error)}`);
  }
  if (page.status === 403) {
    throw new ImportError(
      `${url} answered 403 twice — leave its site alone for a while.`,
    );
  }
  return page;
}

/* ------------------------------------------------------------------ */
/* importList                                                          */
/* ------------------------------------------------------------------ */

export const ImportListOptionsSchema = z
  .strictObject({
    /** 1-based positions from `inspectList`. */
    pick: z.array(z.number().int().min(1)).min(1).optional(),
    all: z.boolean().optional(),
    /** Make the list a collection: this term, created if missing, on every item. */
    term: z.string().trim().min(1).optional(),
    /** The created term's label; default the list's title. */
    termLabel: z.string().trim().min(1).optional(),
    dryRun: z.boolean().optional(),
    limit: z.number().int().min(1).max(IMPORT_LIST_MAX_LIMIT).optional(),
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
  | "failed";

export interface ImportListItemResult {
  n: number;
  url: string;
  /** The list's name for it; `slug` is what the recipe is stored under. */
  name: string;
  status: ImportListItemStatus;
  slug?: string;
  /** The image a real import downloads (a dry run does not fetch it). */
  image?: string;
  /** The page's own categories — hints for tagging, never applied. */
  suggestedTags?: string[];
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
}

export interface ImportListResult {
  url: string;
  title?: string;
  source?: RoundupSource;
  dryRun?: true;
  /** Items on the list. */
  total: number;
  /** The positions this call was asked for, in order. */
  picked: number[];
  /** One entry per pick attempted or skipped as `existing`, in pick order. */
  results: ImportListItemResult[];
  /** Picks not attempted — the cap, or a dropped site. Run again with these. */
  remaining: number[];
  /** Sites dropped after a second 403, with why. Don't re-run at once. */
  dropped?: { site: string; reason: string }[];
  term?: ImportListTermResult;
  /** Requests this call made, the list page and 403 retries included. */
  requests: number;
  /** Why the list had no items, when it had none. */
  reason?: string;
}

/** What a caller (a test) may swap: the clock. */
export interface ImportListDeps {
  pacing?: Pacing;
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

/** The term's record (if any) — `getTerm` without the 404. */
async function termRecord(ctx: CurationContext, slug: string) {
  try {
    return (await getTerm(ctx, slug)).record;
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/**
 * Import one list item: its page, mapped by the importer; then (unless a dry
 * run) `createRecipe` with the image fetched on the same clock.
 */
async function importItem(
  ctx: CurationContext,
  pacer: SitePacer,
  item: RoundupItem,
  dryRun: boolean,
): Promise<ImportListItemResult> {
  const base = { n: item.n, url: item.url, name: item.name };
  if (isVideoUrl(item.url)) {
    throw new ImportError(
      `${item.url} is a video page — import it on its own with recipe_import.`,
    );
  }

  const { value: page } = await pacer.request(item.url, (retry) =>
    fetchRecipePage(item.url, retry),
  );
  if (page.status === 403) {
    pacer.drop(item.url, `refused twice (HTTP 403) at ${item.url}`);
    throw new ImportError(`${item.url} answered 403 twice.`);
  }
  const imported = mapRecipePage(
    item.url,
    parseRecipePage(page.html, item.url),
    { ok: page.ok },
  );
  if (!imported) {
    throw new ImportError(
      page.ok
        ? `No recipe found at ${item.url}.`
        : `${item.url} answered HTTP ${page.status}.`,
    );
  }
  if (imported.partial) {
    throw new ImportError(
      `No schema.org Recipe at ${item.url} — only its title, description and image. ` +
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
  const hints = imported.suggestedTags?.length
    ? { suggestedTags: imported.suggestedTags }
    : {};

  if (dryRun) {
    return {
      ...base,
      status: "would-import",
      slug,
      ...(input.imageImportUrl ? { image: input.imageImportUrl } : {}),
      ...hints,
    };
  }

  const result = await createRecipe(ctx, input, {
    fetchImage: async (imageUrl) =>
      (
        await pacer.request(imageUrl, (retry) =>
          fetchImageFile(imageUrl, { retry }),
        )
      ).value,
  });
  return {
    ...base,
    status: "imported",
    slug: result.slug,
    ...(input.imageImportUrl ? { image: input.imageImportUrl } : {}),
    ...hints,
    ...(result.warnings?.length ? { warnings: result.warnings } : {}),
  };
}

/** Create the term if missing and assign it — one commit (F34). */
async function applyTerm(
  ctx: CurationContext,
  slug: string,
  label: string,
  carriers: string[],
): Promise<ImportListTermResult> {
  const record = await termRecord(ctx, slug);
  const created = !record;
  let assigned: TermAssignResult | undefined;
  await withBatchCommit(
    ctx,
    () =>
      `${created ? "Create" : "Assign"} term: ${slug}` +
      countsTail([[assigned?.updated.length ?? 0, "recipe", "+"]]),
    async (batchCtx) => {
      if (created) await createTerm(batchCtx, { label, slug });
      assigned = await assignTerm(batchCtx, slug, { add: carriers });
    },
  );
  return {
    slug,
    label: record?.label ?? label,
    created,
    tag: assigned!.tag,
    updated: assigned!.updated,
    unchanged: assigned!.unchanged,
    missing: assigned!.missing,
  };
}

/**
 * Import the picked items of a roundup, politely and one commit each.
 *
 * Failures of one item are reported in its result and the call goes on; the
 * call itself throws only for bad input (`validation`) or a list page that
 * cannot be fetched (`import_failed`).
 */
export async function importList(
  ctx: CurationContext,
  rawUrl: string,
  rawOptions: unknown,
  { pacing = realPacing }: ImportListDeps = {},
): Promise<ImportListResult> {
  const options = parseInput(ImportListOptionsSchema, rawOptions);
  const url = checkUrl(rawUrl);
  const dryRun = options.dryRun === true;
  const term = options.term ? tagSlug(options.term) : undefined;
  if (options.term && !term) {
    throw new ValidationError(
      `"${options.term}" does not slugify to anything.`,
    );
  }
  const limit =
    options.limit ?? (dryRun ? IMPORT_LIST_DRY_RUN_LIMIT : IMPORT_LIST_LIMIT);
  const pacer = new SitePacer(pacing);
  const page = await fetchListPage(pacer, url);
  const parsed = parseRoundupPage(page.html, page.finalUrl || url);
  const existing = await existingBySource(
    ctx,
    parsed.items.map((item) => item.url),
  );
  const items = toItems(parsed, existing);

  const picked = options.all
    ? items.map((item) => item.n)
    : [...new Set(options.pick ?? [])];
  const outOfRange = picked.filter((n) => n > items.length);
  if (outOfRange.length > 0) {
    throw new ValidationError(
      items.length === 0
        ? `The page lists no recipes${parsed.reason ? `: ${parsed.reason}` : "."}`
        : `No item ${outOfRange.join(", ")} — the list has ${items.length}.`,
    );
  }

  const results: ImportListItemResult[] = [];
  const remaining: number[] = [];
  let attempted = 0;
  for (const n of picked) {
    const item = items[n - 1];
    if (item.existing) {
      results.push({
        n,
        url: item.url,
        name: item.name,
        status: "existing",
        slug: item.existing,
      });
      continue;
    }
    if (attempted >= limit || pacer.isDropped(item.url)) {
      remaining.push(n);
      continue;
    }
    attempted += 1;
    try {
      results.push(await importItem(ctx, pacer, item, dryRun));
    } catch (error) {
      if (error instanceof SiteDroppedError) {
        /* Its image's site was dropped before the page's: not attempted. */
        attempted -= 1;
        remaining.push(n);
        continue;
      }
      results.push({
        n,
        url: item.url,
        name: item.name,
        status: "failed",
        error: errorOf(error),
      });
    }
  }

  let termResult: ImportListTermResult | undefined;
  if (term) {
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
    const label = options.termLabel ?? parsed.title ?? term;
    if (dryRun) {
      const record = await termRecord(ctx, term);
      termResult = {
        slug: term,
        label: record?.label ?? label,
        created: !record,
        assign: carriers,
      };
    } else if (carriers.length > 0) {
      try {
        termResult = await applyTerm(ctx, term, label, carriers);
      } catch (error) {
        termResult = { slug: term, created: false, error: errorOf(error) };
      }
    } else {
      termResult = { slug: term, created: false, updated: [] };
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
  };
}
