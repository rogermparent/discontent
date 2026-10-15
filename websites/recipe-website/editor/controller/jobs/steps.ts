/**
 * The import path's shared steps (epic 37, D3), so every seat logs a page
 * fetch and its parse the same way: `fetch` (host, status, bytes, the 403
 * retry) and `parse` (a Recipe node or not, what the mapper found).
 */
import { runGit } from "@discontent/cms/git/run";
import {
  fetchRecipePage,
  mapRecipePage,
  parseRecipePage,
  type FetchedPage,
  type ForbiddenRetry,
  type ImportedRecipe,
  type ParsedRecipePage,
} from "recipe-website-common/util/importRecipeData";
import type { JobLog, StepHandle } from "./log";

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 60);
  }
}

/**
 * `retry` with a note of the 403 retry on the step: `afterRetry` only, so
 * the retry's pacing (`beforeRetry`, or the delay) is exactly the caller's.
 */
export function noteRetry(
  step: StepHandle,
  retry: ForbiddenRetry | undefined,
): ForbiddenRetry {
  return {
    ...retry,
    afterRetry: (response) => {
      step.set({ retried403: true, retryStatus: response.status ?? 200 });
      retry?.afterRetry?.(response);
    },
  };
}

/** One page fetch as a `fetch` step: `fetchRecipePage`, logged. */
export function fetchPageStep(
  log: JobLog,
  url: string,
  retry?: ForbiddenRetry,
): Promise<FetchedPage> {
  return log.step("fetch", { host: hostOf(url) }, async (step) => {
    const page = await fetchRecipePage(url, noteRetry(step, retry));
    const finalHost = hostOf(page.finalUrl);
    step.set({
      status: page.status,
      bytes: Buffer.byteLength(page.html),
      ...(finalHost !== hostOf(url) ? { finalHost } : {}),
    });
    if (!page.ok) step.fail(`HTTP ${page.status}`);
    return page;
  });
}

/** What the mapper made of a recipe, as step data. */
export function recipeShape(
  recipe: Partial<ImportedRecipe> | undefined,
): Record<string, unknown> {
  if (!recipe) return { recipe: false };
  return {
    ingredients: (recipe.ingredients ?? []).filter(
      (entry) => entry.type !== "heading",
    ).length,
    steps: recipe.instructions?.length ?? 0,
    ...(recipe.partial ? { partial: true } : {}),
  };
}

/**
 * A fetched page's parse and map as a `parse` step: whether it has a Recipe
 * node (the schema), and what the mapper found — or that it is the SEO
 * `partial`. `base` resolves relative image URLs (where the page ended up).
 */
export function parsePage(
  log: JobLog,
  url: string,
  page: FetchedPage,
  base: string = url,
): Promise<{
  parsed: ParsedRecipePage;
  mapped: Partial<ImportedRecipe> | undefined;
}> {
  return log.step("parse", async (step) => {
    const parsed = parseRecipePage(page.html, base);
    const mapped = mapRecipePage(url, parsed, { ok: page.ok });
    step.set({
      schema: parsed.recipeNodes.length > 0,
      images: parsed.images.length,
      ...recipeShape(mapped),
    });
    return { parsed, mapped };
  });
}

/**
 * The content repository's HEAD, short, for a `write` step's data — best
 * effort (the commit just made, unless another writer got in between); no
 * repository, or no git, is no sha.
 */
export async function headSha(
  contentDirectory: string,
): Promise<string | undefined> {
  try {
    return (
      await runGit(contentDirectory, ["rev-parse", "--short", "HEAD"])
    ).trim();
  } catch {
    return undefined;
  }
}
