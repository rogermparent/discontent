/**
 * An import follows the recipes its page links to (50e). Roger, 2026-11-21:
 * "Ideally importing recipes should also follow and import attached recipes
 * like this" — Pear Panna Cotta Cake needs a batch of poached pears, and its
 * page links Zoë's poached pears on the purée line.
 *
 * The page's links are found when it is read (`findLinkedRecipes`, in
 * `importPage`: the card's ingredient lines, steps and notes, and a cued
 * link in the body). `followLinked` takes each of them, in order, once:
 *
 * 1. **Already here** — a recipe imported from that link (`recipeBySource`,
 *    the duplicate check's own matching): linked to, not fetched.
 * 2. **Otherwise read** through `importPage` — the site's queue and polite
 *    gap (30-D5), the SSRF-guarded fetch (46a), the same `llm` mode, read as
 *    one recipe. A page that holds no recipe (no ingredient lines, or only
 *    its title) is dropped: the link was not a recipe.
 * 3. **Imported** as its own recipe in the same job, its own commit, with
 *    the parent's tags only where its own page says so (De5) — or, in a dry
 *    run, shown with the slug a create would use.
 *
 * One level deep: a linked recipe's own links are never followed. Then the
 * parent's lines are matched (`matchLinkedLines`: the link on the line, or
 * its name) and rewritten to 38d's sub-recipe form (`linkLine`), each
 * rewrite in `lines` — the CLI and MCP result, a `linked` step in the job
 * log, and the form's marks (`linkedLines` on the recipe, to approve). A
 * linked recipe no line makes is a note: "Uses: [Poached Pears](/recipe/
 * poached-pears)".
 */
import type { ImportedRecipe } from "recipe-website-common/util/importRecipeData";
import type {
  LinkedCandidate,
  LinkedSkip,
  LinkedWhere,
} from "recipe-website-common/util/linkedRecipes";
import {
  linkLine,
  matchLinkedLines,
  type LinkedHow,
  type LinkedLineMark,
  type LinkedTarget,
} from "recipe-website-common/util/linkedLines";
import { recipeLinkSlugs } from "recipe-website-common/controller/buildIndexValue";
import { fold } from "recipe-website-common/util/fold";
import { jobContext, type JobRun } from "../jobs/context";
import { fetchImageFile } from "../imageImport";
import type { LlmMode } from "../llm/importWithLlm";
import type { CurationContext } from "./context";
import { toErrorObject, type ErrorObject } from "./errors";
import {
  createRecipe,
  getRecipe,
  resolveCreateSlug,
  slugIsTaken,
} from "./recipes";
import { pacedRequest } from "./sitePacing";

export { LINKED_MODES, type LinkedMode } from "./linkedMode";

/** One linked recipe, and what became of it. */
export interface LinkedRecipeItem {
  url: string;
  /** The link's words on the page. */
  text: string;
  where: LinkedWhere;
  /**
   * `existing`: already imported from that link; `imported` now (or
   * `would-import` in a dry run); `not-a-recipe`: its page holds none;
   * `failed`: it could not be read or written — `reason` says why.
   */
  status: "existing" | "imported" | "would-import" | "not-a-recipe" | "failed";
  slug?: string;
  name?: string;
  reason?: string;
  error?: ErrorObject["error"];
  /** The parent's lines that now link it (0-based). */
  lines?: number[];
  /** Those lines linked it before this import or scan (nothing rewritten). */
  already?: true;
  /** The parent's tags it was written with (De5). */
  tags?: string[];
}

/** One rewritten line of the parent. */
export interface LinkedLineChange {
  /** Its index in the parent's ingredients (0-based). */
  line: number;
  /** As read, and as rewritten — plain text. */
  from: string;
  to: string;
  slug: string;
  name: string;
  /** The page's link on the line, or the line naming what it makes. */
  how: LinkedHow;
  /** The shopping list opens it into the linked recipe's lines (38d). */
  expands: boolean;
}

/** What following the links did (the import result's `linked`). */
export interface LinkedReport {
  recipes: LinkedRecipeItem[];
  lines: LinkedLineChange[];
  /** "Uses: …" notes added for linked recipes no line makes. */
  notes?: string[];
  /** Links that looked like recipes and were left alone, and why. */
  skipped?: LinkedSkip[];
}

export interface FollowInput {
  /** The parent as read: its lines are matched and rewritten. */
  recipe: Partial<ImportedRecipe>;
  candidates: readonly LinkedCandidate[];
  skipped?: readonly LinkedSkip[];
  /** The parent's page, for the commit note ("linked from …"). */
  source?: string;
  /** Read each linked page as the parent was (default `auto`). */
  mode?: LlmMode;
  dryRun?: boolean;
  /** The tags the parent is written with: carried only where they fit (De5). */
  tags?: readonly string[];
}

/** A tag's words as a page's categories are compared: folded, singular. */
function tagWords(text: string): string {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) =>
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss")
        ? word.slice(0, -1)
        : word,
    )
    .join(" ");
}

/**
 * The parent's tags a linked recipe takes (De5): only those its own page
 * says — its categories, cuisine and keywords (`suggestedTags`) or its name
 * hold the tag's words. "dessert" goes to Zoë's poached pears (her page
 * says Dessert); "project" or "christmas" does not, unless the page says
 * so. Nothing is copied blind.
 */
export function fittingTags(
  tags: readonly string[] | undefined,
  linked: Pick<Partial<ImportedRecipe>, "name" | "suggestedTags">,
): string[] {
  if (!tags?.length) return [];
  const said = [linked.name ?? "", ...(linked.suggestedTags ?? [])]
    .map(tagWords)
    .map((text) => ` ${text} `);
  return tags.filter((tag) => {
    const words = tagWords(tag.replace(/[-_]/g, " "));
    return words && said.some((text) => text.includes(` ${words} `));
  });
}

/** "zoebakes.com/2019/10/13/pear-panna-cotta-cake": a page as a commit names it. */
function shortPage(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

/** A recipe body: ingredient lines (a linked recipe must have some). */
function hasLines(recipe: Partial<ImportedRecipe> | undefined): boolean {
  return (recipe?.ingredients ?? []).some((entry) => entry.type !== "heading");
}

/** A stored line as a person reads it: numbers unmarked, links kept. */
function plain(line: string): string {
  return line
    .replace(/<Multiplyable\s+baseNumber="([^"]*)"\s*\/>/g, "$1")
    .replace(/\\\*/g, "*")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Follow the parent's linked recipes (see the module comment): what became
 * of each, and the parent with its lines rewritten (and `linkedLines`) and
 * any "Uses:" notes added.
 */
export async function followLinked(
  ctx: CurationContext,
  {
    recipe,
    candidates,
    skipped = [],
    source,
    mode,
    dryRun = false,
    tags,
  }: FollowInput,
  run?: JobRun,
): Promise<{ recipe: Partial<ImportedRecipe>; report: LinkedReport }> {
  const job = jobContext(run);
  const { log } = job;
  const { recipeBySource } = await import("./importList");
  const { importPage, importedToInput } = await import("./importRecipe");
  const items: LinkedRecipeItem[] = [];
  const targets: (LinkedTarget & { item: LinkedRecipeItem })[] = [];
  type Followed = { item: LinkedRecipeItem; target?: LinkedTarget };
  const from = shortPage(source ?? recipe.source?.url);

  for (const candidate of candidates) {
    const base = {
      url: candidate.url,
      text: candidate.text,
      where: candidate.where,
    };
    const line = candidate.line !== undefined ? { line: candidate.line } : {};
    const followed: Followed = await log.step(
      "linked",
      { url: candidate.url, where: candidate.where },
      async (step): Promise<Followed> => {
        const existing = await recipeBySource(ctx, candidate.url);
        if (existing) {
          step.set({ status: "existing", slug: existing.slug });
          const name = existing.recipe.name ?? existing.slug;
          return {
            item: { ...base, status: "existing", slug: existing.slug, name },
            target: {
              slug: existing.slug,
              name,
              ...line,
              ingredients: (existing.recipe.ingredients ?? []).map(
                (entry) => entry.ingredient,
              ),
            },
          };
        }
        let page;
        try {
          page = await importPage(
            candidate.url,
            { llm: mode, asOne: true },
            job,
          );
        } catch (error) {
          if (job.signal?.aborted) throw error;
          const why = error instanceof Error ? error.message : String(error);
          step.fail(why);
          return { item: { ...base, status: "failed", reason: why } };
        }
        const linked = page.recipe;
        if (!linked || linked.partial || !hasLines(linked)) {
          step.set({ status: "not-a-recipe" });
          return {
            item: {
              ...base,
              status: "not-a-recipe",
              reason: linked?.partial
                ? "its page has no recipe data — only a title and a picture"
                : "no ingredient lines were found on its page",
            },
          };
        }
        const carried = fittingTags(tags, linked);
        try {
          const input = importedToInput(linked, { tags: carried });
          const slug = resolveCreateSlug(input);
          if (await slugIsTaken(ctx, slug)) {
            const why = `a recipe from another source already has the slug "${slug}" — import ${candidate.url} on its own with --slug`;
            step.fail(why);
            return {
              item: {
                ...base,
                status: "failed",
                name: input.name,
                reason: why,
              },
            };
          }
          const ingredients = (linked.ingredients ?? []).map(
            (entry) => entry.ingredient,
          );
          const target = { name: input.name, ...line, ingredients };
          const tagged = carried.length ? { tags: carried } : {};
          if (dryRun) {
            step.set({ status: "would-import", slug });
            return {
              item: {
                ...base,
                status: "would-import",
                slug,
                name: input.name,
                ...tagged,
              },
              target: { ...target, slug },
            };
          }
          const written = await createRecipe(ctx, input, {
            fetchImage: (imageUrl) =>
              pacedRequest(
                imageUrl,
                (retry) => fetchImageFile(imageUrl, { retry, job }),
                undefined,
                job,
                { image: true },
              ),
            commitNote: from ? `linked from ${from}` : "linked recipe",
          });
          step.set({ status: "imported", slug: written.slug });
          return {
            item: {
              ...base,
              status: "imported",
              slug: written.slug,
              name: input.name,
              ...tagged,
            },
            target: { ...target, slug: written.slug },
          };
        } catch (error) {
          if (job.signal?.aborted) throw error;
          const { error: shaped } = toErrorObject(error);
          step.fail(shaped.message);
          return {
            item: {
              ...base,
              status: "failed",
              reason: shaped.message,
              error: shaped,
            },
          };
        }
      },
    );
    items.push(followed.item);
    if (followed.target)
      targets.push({ ...followed.target, item: followed.item });
  }

  /* The lines each linked recipe makes, rewritten to link it. */
  const ingredients = [...(recipe.ingredients ?? [])];
  const matches = matchLinkedLines(ingredients, targets);
  const lines: LinkedLineChange[] = [];
  const marks: LinkedLineMark[] = [];
  for (const match of matches) {
    const target = targets.find((entry) => entry.slug === match.slug)!;
    const entry = ingredients[match.line];
    const linked = linkLine(entry.ingredient, match.slug);
    if (!linked) continue;
    ingredients[match.line] = { ...entry, ingredient: linked.ingredient };
    lines.push({
      line: match.line,
      from: plain(entry.ingredient),
      to: plain(linked.ingredient),
      slug: match.slug,
      name: target.name,
      how: match.how,
      expands: linked.expands,
    });
    marks.push({
      line: match.line,
      before: entry.ingredient,
      after: linked.ingredient,
      slug: match.slug,
      name: target.name,
      how: match.how,
    });
    target.item.lines = [...(target.item.lines ?? []), match.line];
  }

  /* A linked recipe no line makes: a note says the recipe uses it. */
  const notes = [...(recipe.notes ?? [])];
  const added: string[] = [];
  for (const target of targets) {
    if (target.item.lines?.length) continue;
    /* A line links it already (a scan of a recipe linked by hand). */
    if (
      ingredients.some((entry) =>
        recipeLinkSlugs(entry.ingredient).includes(target.slug),
      )
    ) {
      target.item.lines = ingredients.flatMap((entry, index) =>
        recipeLinkSlugs(entry.ingredient).includes(target.slug) ? [index] : [],
      );
      target.item.already = true;
      continue;
    }
    const link = `/recipe/${encodeURIComponent(target.slug)}`;
    if (notes.some((note) => note.includes(`](${link})`))) continue;
    const note = `Uses: [${target.name.replace(/([[\]\\])/g, "\\$1")}](${link})`;
    notes.push(note);
    added.push(note);
  }

  if (lines.length || added.length) {
    log.info(
      "linked",
      `${lines.length} line${lines.length === 1 ? "" : "s"} linked${added.length ? `, ${added.length} "Uses:" note${added.length === 1 ? "" : "s"}` : ""}`,
      {
        lines: lines.map((change) => ({
          line: change.line + 1,
          from: change.from,
          to: change.to,
          how: change.how,
        })),
        ...(added.length ? { notes: added } : {}),
      },
    );
  }

  return {
    recipe: {
      ...recipe,
      ingredients,
      ...(added.length ? { notes } : {}),
      ...(marks.length ? { linkedLines: marks } : {}),
    },
    report: {
      recipes: items,
      lines,
      ...(added.length ? { notes: added } : {}),
      ...(skipped.length ? { skipped: [...skipped] } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* `recipes linked --scan`: the recipes already here                   */
/* ------------------------------------------------------------------ */

export interface LinkedScanOptions {
  /** Only these recipes (default: every recipe with a source page). */
  slugs?: string[];
  /** At most this many recipes read, in slug order. */
  limit?: number;
  dryRun?: boolean;
  /** How each linked page is read (default `auto`). */
  llm?: LlmMode;
}

/** One recipe the scan read. */
export interface LinkedScanRecipe {
  slug: string;
  name: string;
  source?: string;
  /**
   * `linked`: lines rewritten or a note added (`would-link` in a dry run);
   * `unchanged`: its page links recipes, and nothing here needs changing;
   * `none`: its page links no recipe; `skipped`: no page to read (no
   * source, a video); `failed`: the page could not be read.
   */
  status: "linked" | "would-link" | "unchanged" | "none" | "skipped" | "failed";
  reason?: string;
  linked?: LinkedReport;
}

export interface LinkedScanResult {
  /** The job that ran it: `recipes jobs show <job>` has its steps. */
  job?: string;
  dryRun?: true;
  /** Recipes read (skipped ones aside). */
  scanned: number;
  recipes: LinkedScanRecipe[];
}

/**
 * The same follow as an import's, for recipes already here (50e): each
 * recipe's stored source page read again — on its site's queue, politely,
 * one page at a time — its linked recipes found against the **stored**
 * lines, imported or linked, and the lines that make them rewritten (one
 * commit per recipe). A dry run reads the pages and writes nothing.
 */
export async function scanLinked(
  ctx: CurationContext,
  { slugs, limit, dryRun = false, llm }: LinkedScanOptions = {},
  run?: JobRun,
): Promise<LinkedScanResult> {
  const job = jobContext(run);
  const { log } = job;
  const { readAllRecipeRows, updateRecipe } = await import("./recipes");
  const { fetchPageStep } = await import("../jobs/steps");
  const { findLinkedRecipes, linkedLineTexts } =
    await import("recipe-website-common/util/linkedRecipes");
  const { isVideoUrl } =
    await import("recipe-website-common/util/importRecipeData");
  const { isTestAllowedUrl } = await import("../urlGuard");
  const wanted = slugs?.length
    ? slugs
    : (await readAllRecipeRows(ctx)).map((row) => row.slug).sort();
  const recipes: LinkedScanRecipe[] = [];
  let scanned = 0;
  for (const slug of wanted) {
    if (limit !== undefined && scanned >= limit) break;
    if (job.signal?.aborted) throw job.signal.reason;
    const detail = await getRecipe(ctx, slug);
    const stored = detail.recipe;
    const name = stored.name ?? slug;
    const source = stored.source?.url;
    const base = { slug, name, ...(source ? { source } : {}) };
    if (!source || !/^https?:\/\//i.test(source) || isVideoUrl(source)) {
      recipes.push({
        ...base,
        status: "skipped",
        reason: source ? "its source is a video" : "it has no source page",
      });
      continue;
    }
    scanned += 1;
    const pageUrl = source.split("#")[0];
    let html: string;
    try {
      const page = await pacedRequest(
        pageUrl,
        (retry) => fetchPageStep(pageUrl, retry, job),
        undefined,
        job,
      );
      if (!page.ok) throw new Error(`HTTP ${page.status}`);
      html = page.html;
    } catch (error) {
      if (job.signal?.aborted) throw error;
      recipes.push({
        ...base,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const found = findLinkedRecipes(html, pageUrl, {
      ...linkedLineTexts(stored.ingredients),
      allowPrivateLinks: isTestAllowedUrl(pageUrl),
    });
    if (found.candidates.length === 0) {
      recipes.push({
        ...base,
        status: "none",
        ...(found.skipped.length
          ? { linked: { recipes: [], lines: [], skipped: found.skipped } }
          : {}),
      });
      continue;
    }
    const followed = await followLinked(
      ctx,
      {
        recipe: stored,
        candidates: found.candidates,
        skipped: found.skipped,
        source: pageUrl,
        ...(llm ? { mode: llm } : {}),
        dryRun,
        ...(stored.tags ? { tags: stored.tags } : {}),
      },
      job,
    );
    const { report } = followed;
    const changed = report.lines.length > 0 || (report.notes?.length ?? 0) > 0;
    if (changed && !dryRun) {
      await log.step("write", { slug }, async () =>
        updateRecipe(ctx, slug, {
          ingredients: followed.recipe.ingredients,
          ...(report.notes?.length ? { notes: followed.recipe.notes } : {}),
        }),
      );
    }
    recipes.push({
      ...base,
      status: changed ? (dryRun ? "would-link" : "linked") : "unchanged",
      linked: report,
    });
  }
  return { ...(dryRun ? { dryRun: true as const } : {}), scanned, recipes };
}
