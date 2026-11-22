/**
 * 50e: a page's links to the other recipes its recipe may use, found where
 * the page's HTML is — `importPage` and the form's import — and kept on the
 * reading as `linked` for the import to follow (`followLinked`) or not.
 * Its own module so the form's import loads it without the seat.
 */
import {
  findLinkedRecipes,
  linkedLineTexts,
} from "recipe-website-common/util/linkedRecipes";
import type { ApplyLlmResult } from "../llm/importWithLlm";
import { isTestAllowedUrl } from "../urlGuard";

/**
 * The reading with its page's linked-recipe links as `linked`
 * (`findLinkedRecipes`). A page with no recipe body, or several recipes,
 * has none.
 */
export function withLinkedLinks(
  applied: ApplyLlmResult,
  pageUrl: string,
  html: string,
): ApplyLlmResult {
  const recipe = applied.recipe;
  if (applied.recipes || !recipe || recipe.partial) return applied;
  if (!(recipe.ingredients ?? []).some((entry) => entry.type !== "heading")) {
    return applied;
  }
  try {
    const linked = findLinkedRecipes(html, pageUrl, {
      ...linkedLineTexts(recipe.ingredients),
      /* 46a: only a test's fixture host keeps its private links. */
      allowPrivateLinks: isTestAllowedUrl(pageUrl),
    });
    return linked.candidates.length || linked.skipped.length
      ? { ...applied, linked }
      : applied;
  } catch {
    /* A page the link reader cannot walk still imports. */
    return applied;
  }
}
