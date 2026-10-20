/**
 * Ask's prompt (43q): the query language, the page targets with examples,
 * and the site's own vocabulary — 43f's facets, compactly — so the model
 * names tags that exist. Pure: `askPrompt` takes the vocabulary `ask.ts`
 * read, and its size picks the context (40a).
 *
 * **Compact on purpose.** A term is its slug, with its label only where the
 * label says something the slug doesn't (`main=Mains`), up to three aliases,
 * and its narrower terms in brackets two levels down. Each group lists its
 * biggest rows first and stops at `ASK_GROUP_ROWS`; the rest are still
 * grounded (`groundAnswer` reads the whole vocabulary), only not suggested.
 */
import {
  countFacets,
  facetGroups,
  type FacetRow,
} from "recipe-website-common/util/facets";
import { tagSlug } from "recipe-website-common/controller/tagSlug";
import { fold } from "recipe-website-common/components/SearchForm/queryLanguage";
import { contextStep, estimateTokens } from "../llm/client";
import type { AskGroup, AskVocabulary } from "./answer";

/** Top-level rows per group in the prompt (biggest first). */
export const ASK_GROUP_ROWS = 30;

/** Narrower rows per row, and how deep they go. */
export const ASK_CHILD_ROWS = 8;
export const ASK_CHILD_DEPTH = 2;

/** Tags no facet places, listed at most. */
export const ASK_OTHER_TAGS = 20;

/** Meal plans and collections listed, newest first. */
export const ASK_GROUPS = 15;

/** Room for the answer: a dozen fields at most. */
export const ASK_ANSWER_TOKENS = 256;

export const ASK_SYSTEM_PROMPT = `You turn a question about a recipe website into the page that answers it, as JSON. You never answer the question yourself, and you never invent a tag.

Pages ("page"):
- "make": What can I make, the recipes a cook can make from what they have. Use it for "what can I make", "drinks I can make with", "something to use up the chickpeas". Fields: "kind" ("drinks", "food" or "any"); "features", ingredient names every recipe must use, as a recipe line names them ("lime", "gin", "black beans"); "patterns", only when the question asks for a family of ingredients: a word prefix ending in * ("bean*" is every ingredient with a word starting "bean") or a /regular expression/ ("/may(o|onnaise)/"); "q", optional tag: terms that narrow the recipes.
- "search": a search, "q" in the query language below. Use it for "find", "show me", "recipes with" when the question is not about what they can make.
- "holiday": one holiday's menu. "slug" is a slug from the Holidays group; "kind" is optional.
- "tag": one tag's page. "slug" is a tag slug. Use it when the question only names a tag or a collection ("show me the cookies").
- "plan": a meal plan or collection. "slug" is one of PLANS.

Query language (for "q"):
- free words match a recipe's name, description, tags and ingredients: chocolate cake
- tag:<slug> is a tag and everything under it; -tag:<slug> leaves it out: tag:dessert -tag:cookies
- ingredient:<word> matches an ingredient line; quote several words: ingredient:"black beans"
- group:<slug> is in a meal plan or collection; time:<30 takes at most 30 minutes
- tag:drink means drinks and -tag:drink means food. Terms are ANDed; OR and ( ) group alternatives.

Rules:
- Use only tag slugs from VOCABULARY, holiday slugs from its Holidays group and plan slugs from PLANS. When the question names something the vocabulary lacks, use free words or ingredient: instead of a tag.
- Prefer "make" when the question is about making something from what the cook has, "holiday" when it names a holiday, "tag" when it only names a tag, and otherwise "search".
- Leave out the fields the page does not read.

Examples (their slugs only show the shape; use the vocabulary's):
Q: what drinks can I make with lime
A: {"page":"make","kind":"drinks","features":["lime"]}
Q: quick vegetarian dinners
A: {"page":"search","q":"tag:vegetarian tag:quick -tag:drink"}
Q: something sour with gin
A: {"page":"search","q":"tag:sour ingredient:gin"}
Q: what can I make with any kind of beans
A: {"page":"make","kind":"food","patterns":["bean*"]}
Q: christmas cocktails
A: {"page":"holiday","slug":"christmas","kind":"drinks"}
Q: show me the cookies
A: {"page":"tag","slug":"cookies"}
Q: what's on this week's meal plan
A: {"page":"plan","slug":"week-of-oct-12"}`;

/** A term as the prompt names it: `slug`, or `slug=Label`, and its aliases. */
function termText(row: Pick<FacetRow, "slug" | "label" | "aliases">): string {
  const sameWords =
    tagSlug(row.label) === row.slug || fold(row.label) === row.slug;
  const aliases = (row.aliases ?? []).slice(0, 3);
  return [
    sameWords ? row.slug : `${row.slug}=${row.label}`,
    aliases.length > 0 ? ` (also ${aliases.join(", ")})` : "",
  ].join("");
}

function rowText(row: FacetRow, depth: number): string {
  const children =
    depth < ASK_CHILD_DEPTH
      ? row.children
          .slice(0, ASK_CHILD_ROWS)
          .map((child) => rowText(child, depth + 1))
      : [];
  return children.length > 0
    ? `${termText(row)} [${children.join(", ")}]`
    : termText(row);
}

/**
 * The vocabulary block: one line per facet group (43f's order), then the
 * tags no facet places. Counted over every recipe, so the biggest rows lead.
 */
export function vocabularyText(vocabulary: AskVocabulary): string {
  const { model, recipes } = vocabulary;
  const counts = countFacets(model, recipes);
  const lines: string[] = [];
  for (const group of facetGroups(model, counts, { sort: "count" })) {
    const shelf =
      group.kind === "drinks"
        ? "Drinks"
        : group.kind === "food"
          ? "Food"
          : "Any";
    const root = group.root ? ` (tag:${group.root})` : "";
    const rows = group.rows
      .slice(0, ASK_GROUP_ROWS)
      .map((row) => rowText(row, 0));
    lines.push(`${shelf}, ${group.label}${root}: ${rows.join(", ")}`);
  }
  const other = counts.other.slice(0, ASK_OTHER_TAGS);
  if (other.length > 0) {
    lines.push(`Other tags: ${other.map((tag) => tag.slug).join(", ")}`);
  }
  return lines.join("\n");
}

/** `YYYY-MM-DD` in the server's own time zone (the editor's, the cook's). */
function dayKey(date: number | Date): string {
  const day = new Date(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The plans block: the newest meal plans and collections. */
export function plansText(groups: readonly AskGroup[]): string {
  const newest = [...groups]
    .sort((a, b) => b.date - a.date)
    .slice(0, ASK_GROUPS);
  if (newest.length === 0) return "(none)";
  return newest
    .map(
      (group) =>
        `${group.slug}=${group.name} (${group.kind === "meal-plan" ? "meal plan" : "collection"}, ${dayKey(group.date)})`,
    )
    .join("\n");
}

export interface AskPrompt {
  system: string;
  user: string;
  /** The prompt's tokens, over-counted (`estimateTokens`). */
  tokens: number;
  /** The context asked of Ollama: the smallest step that holds it (40a). */
  numCtx: number;
}

/** The whole prompt for `question`, and the context it needs. */
export function askPrompt(
  question: string,
  vocabulary: AskVocabulary,
  today: Date = new Date(),
): AskPrompt {
  const user = [
    `Today is ${dayKey(today)}.`,
    "",
    "VOCABULARY",
    vocabularyText(vocabulary),
    "",
    "PLANS",
    plansText(vocabulary.groups),
    "",
    `QUESTION: ${question.replace(/\s+/g, " ").trim()}`,
  ].join("\n");
  const tokens = estimateTokens(ASK_SYSTEM_PROMPT) + estimateTokens(user);
  return {
    system: ASK_SYSTEM_PROMPT,
    user,
    tokens,
    numCtx: contextStep(tokens + ASK_ANSWER_TOKENS),
  };
}
