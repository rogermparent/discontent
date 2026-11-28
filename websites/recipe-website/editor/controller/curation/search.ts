/**
 * Search, without FlexSearch.
 *
 * **There is no server-side search database** (fact 3). `SEARCH_DB_NAME` names
 * a *browser* IndexedDB store; the corpus is shipped to the client and indexed
 * there. So the CLI evaluates the query itself, over the same index values the
 * browser would have received.
 *
 * That makes the free-text pass mandatory rather than optional.
 * `parseQuery` leaves positive bare words in `text` and puts only typed terms
 * and negations into `filter` — the browser hands `text` to FlexSearch and uses
 * `matchesFilter` to narrow what comes back. A CLI that ran only
 * `matchesFilter` would answer `search "chocolate"` with the entire corpus.
 *
 * **Ranked, and OR, since 27d (D12).** Until then every word had to match and
 * rows came back newest-first, so "lime gin" missed every drink that said
 * only one of them, and the curator skill searched one word at a time. Now a
 * row needs at least one word, and rows sort by a score — the browser's field
 * priority made explicit: name 4, tags 3, ingredients 2, description 1, the
 * best field per word, summed over the words — then newest first. Typed terms
 * (`tag:`, `source:`, negations) still narrow exactly as before.
 *
 * **`group:` since 30a.** Membership lives in the groups, not on the recipe
 * rows, so rows are decorated with it before filtering — the browser's rule,
 * from the same corpus `/search/groups` serves — and only when the query has
 * a `group:` term, so every other search reads no groups at all.
 *
 * **Hierarchy-aware `tag:` since 31b.** `tag:dessert` also finds the recipes
 * tagged with any term under `dessert` (`tagExpansion.ts`), from the same
 * vocabulary the browser expands with — read only when the query has a `tag:`
 * term.
 *
 * **Deep, for the curator, since 51c (D8).** `searchRecipeText` scores the
 * same way with each recipe's steps and notes as two more fields, read from
 * the recipe files and kept per HEAD — `recipe_search`'s `deep: true` and
 * `recipes search --deep`. The site's `/search` stays on the index.
 */
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { readHead } from "@discontent/cms/git/indexStamp";
import { readTaxonomyTerms } from "@discontent/cms/taxonomies/read";
import { flatSteps } from "recipe-website-common/components/Form/Instructions/stepChecks";
import {
  fieldMatches,
  filterTerms,
  fold,
  matchesFilter,
  parseQuery,
  type FilterNode,
} from "recipe-website-common/components/SearchForm/queryLanguage";
import { getGroupSearchCorpus } from "recipe-website-common/controller/data/readGroupSearchCorpus";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { recipeTagTaxonomy } from "recipe-website-common/controller/recipeTagTaxonomy";
import type {
  Recipe,
  RecipeEntryKey,
  RecipeEntryValue,
} from "recipe-website-common/controller/types";
import { cleanNotes } from "recipe-website-common/util/recipeNotes";
import { stepPlainText } from "recipe-website-common/util/stepPlainText";
import type { CurationContext } from "./context";
import { readAllRecipeRows, type RecipeRow } from "./recipes";
import { readTagResolver } from "./tagResolver";

export interface SearchResult {
  query: { raw: string; text: string; hasAdvancedSyntax: boolean };
  total: number;
  recipes: RecipeRow[];
}

/** A word's worth in each field: the browser's field order, as numbers. */
export const FIELD_WEIGHTS = {
  name: 4,
  tags: 3,
  ingredients: 2,
  description: 1,
} as const;

/**
 * How well a row answers the free text: for each word, the weight of the best
 * field it appears in (0 if none), summed.
 *
 * `fieldMatches` is the browser's own prefix-at-word-start matcher, exported
 * from `queryLanguage.ts` for exactly this (fact 3), so `search "choc"` finds
 * here what it finds while it is being typed there. A row scoring 0 matched no
 * word and is not a result.
 */
export function scoreFreeText(row: RecipeRow, text: string): number {
  let score = 0;
  for (const word of freeTextWords(text)) {
    const field = rowFieldFor(row, word);
    if (field) score += FIELD_WEIGHTS[field];
  }
  return score;
}

/** The free text's words, folded, as `scoreFreeText` reads them. */
export function freeTextWords(text: string): string[] {
  return fold(text).split(/\s+/).filter(Boolean);
}

/** The best of the index row's fields `word` appears in, or none. */
function rowFieldFor(
  row: RecipeRow,
  word: string,
): keyof typeof FIELD_WEIGHTS | undefined {
  if (fieldMatches(row.name, word)) return "name";
  if ((row.tags ?? []).some((tag) => fieldMatches(tag, word))) return "tags";
  if ((row.ingredients ?? []).some((line) => fieldMatches(line, word))) {
    return "ingredients";
  }
  if (row.description && fieldMatches(row.description, word)) {
    return "description";
  }
  return undefined;
}

/** Whether any leaf of the filter is a `field:` term, negated or not. */
export function hasFieldTerm(
  filter: FilterNode | undefined,
  field: "group" | "tag",
): boolean {
  return filterTerms(filter).some(
    ({ node }) => node.type === "text" && node.field === field,
  );
}

/**
 * Recipe slug → the strings a `group:` term may match: each membership
 * contributes the group's slug and its name, so `group:weeknight-favourites`
 * and `group:weeknight` both find it. `SearchContext`'s `groupsByRecipe`, on
 * the same corpus — transitive through sub-groups, as the browser's is.
 */
export async function readGroupsByRecipe(
  ctx: CurationContext,
): Promise<Map<string, string[]>> {
  const groups = await getGroupSearchCorpus({
    contentDirectory: ctx.contentDirectory,
  });
  const map = new Map<string, string[]>();
  for (const group of groups) {
    for (const slug of group.recipes) {
      const existing = map.get(slug);
      if (existing) existing.push(group.slug, group.name);
      else map.set(slug, [group.slug, group.name]);
    }
  }
  return map;
}

export async function searchRecipes(
  ctx: CurationContext,
  raw: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<SearchResult> {
  const query = raw ?? "";
  const { text, filter, hasAdvancedSyntax } = parseQuery(query);
  const scored = await rankRows(ctx, { text, filter }, (row) => ({
    row,
    score: scoreFreeText(row, text),
  }));
  const matched = scored.map(({ row }) => row);
  return {
    query: { raw: query, text, hasAdvancedSyntax },
    total: matched.length,
    recipes: matched.slice(offset, offset + limit),
  };
}

/**
 * The rows a parsed query keeps, scored and sorted: the typed terms narrow
 * exactly (`group:` and `tag:` read their corpora only when the query has
 * one); with free text, `score` decides and a row scoring 0 is not a
 * result; without, every row the terms keep scores 0. Best first, then
 * newest — the order `readAllRecipeRows` already has. `searchRecipes` and
 * the deep search (51c) share it, so the two differ only in how they score.
 */
async function rankRows<T extends { row: RecipeRow; score: number }>(
  ctx: CurationContext,
  { text, filter }: { text: string; filter?: FilterNode },
  score: (row: RecipeRow) => T,
  rows?: RecipeRow[],
): Promise<T[]> {
  rows ??= await readAllRecipeRows(ctx);
  const hasText = fold(text).trim().length > 0;
  const groupsByRecipe = hasFieldTerm(filter, "group")
    ? await readGroupsByRecipe(ctx)
    : null;
  const resolver = hasFieldTerm(filter, "tag")
    ? await readTagResolver(ctx)
    : undefined;

  const scored: T[] = [];
  for (const row of rows) {
    /* Matched decorated, returned as read: the result rows keep their shape. */
    const candidate = groupsByRecipe
      ? { ...row, groups: groupsByRecipe.get(row.slug) }
      : row;
    if (filter && !matchesFilter(candidate, filter, resolver)) continue;
    if (!hasText) {
      scored.push({ ...score(row), score: 0 });
      continue;
    }
    const each = score(row);
    if (each.score > 0) scored.push(each);
  }
  scored.sort((a, b) => b.score - a.score || b.row.date - a.row.date);
  return scored;
}

/* ------------------------------------------------------------------ */
/* The deep search: steps and notes too (51c, D8)                      */
/* ------------------------------------------------------------------ */

/**
 * The deep search's two fields beyond the index row's (51c, D8): a word
 * found only in a step or a note counts what a description word does.
 */
export const DEEP_FIELD_WEIGHTS = {
  ...FIELD_WEIGHTS,
  steps: 1,
  notes: 1,
} as const;

/** A recipe's steps and notes as plain words, in reading order. */
export interface RecipeText {
  steps: string[];
  notes: string[];
}

/**
 * Where a deep result's first steps-or-notes word was found: the step's or
 * note's number (1-based, as the recipe page numbers them) and the words
 * around it — so a model reading the row sees *why* "frother" found it.
 */
export interface DeepHit {
  field: "steps" | "notes";
  number: number;
  text: string;
}

export type DeepSearchRow = RecipeRow & { found?: DeepHit };

export interface DeepSearchResult extends SearchResult {
  deep: true;
  recipes: DeepSearchRow[];
}

/** The characters a `found` snippet keeps before and after its match. */
export const DEEP_SNIPPET_BEFORE = 40;
export const DEEP_SNIPPET_AFTER = 80;

/** How many `recipe.json` reads run at once while the corpus is read. */
const READ_BATCH = 32;

/**
 * A recipe's steps (`flatSteps`: every group's, in order; then
 * `stepPlainText`) and notes (`cleanNotes`, then the same plain-words
 * pass), blank ones dropped.
 */
export function recipeText(
  recipe: Pick<Recipe, "instructions" | "notes">,
): RecipeText {
  return {
    steps: flatSteps(recipe.instructions ?? [])
      .map((step) => stepPlainText(step.text))
      .filter(Boolean),
    notes: cleanNotes(recipe.notes)
      .map((note) => stepPlainText(note))
      .filter(Boolean),
  };
}

/** One recipe's text, plain (for the snippet) and folded (for matching). */
interface CorpusEntry {
  plain: RecipeText;
  folded: RecipeText;
}

function corpusEntry(plain: RecipeText): CorpusEntry {
  return {
    plain,
    folded: { steps: plain.steps.map(fold), notes: plain.notes.map(fold) },
  };
}

/**
 * Where `needle` (folded) matches `hay` (folded) by `fieldMatches`'s rule
 * — a multi-word needle anywhere, any other at the start or at a word's
 * start — or -1. The position is what `fieldMatches` does not answer and
 * the snippet needs; the tests hold the two side by side.
 */
export function matchIndex(hay: string, needle: string): number {
  if (!needle) return -1;
  if (/\s/.test(needle)) return hay.indexOf(needle);
  if (hay.startsWith(needle)) return 0;
  /* A needle with punctuation is in no word (words are letters and digits). */
  if (!WORD_ONLY.test(needle)) return -1;
  /* Each place it occurs, until one starts a word: `indexOf` is what keeps a
   * warm search over a thousand recipes' steps fast (51c's measurement). */
  for (
    let at = hay.indexOf(needle, 1);
    at > 0;
    at = hay.indexOf(needle, at + 1)
  ) {
    if (!WORD_CHAR.test(hay[at - 1])) return at;
  }
  return -1;
}

const WORD_ONLY = /^[\p{L}\p{N}]+$/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * The words around a match. `fold` keeps a precomposed text's length
 * (`util/fold.ts`), so the folded offset is the plain one; where it is not
 * (decomposed text), the snippet starts at the text's start instead.
 */
export function snippetAt(plain: string, folded: string, at: number): string {
  const width = DEEP_SNIPPET_BEFORE + DEEP_SNIPPET_AFTER;
  if (plain.length <= width) return plain;
  const offset = plain.length === folded.length ? at : 0;
  /* The window, moved back from the text's end so none of it is wasted. */
  let end = Math.min(
    plain.length,
    Math.max(0, offset - DEEP_SNIPPET_BEFORE) + width,
  );
  let start = Math.max(0, end - width);
  /* Whole words: forward to a word start, back to a word end. */
  if (start > 0) {
    const space = plain.indexOf(" ", start - 1);
    if (space >= 0 && space < offset) start = space + 1;
  }
  if (end < plain.length) {
    const space = plain.lastIndexOf(" ", end);
    if (space > offset) end = space;
  }
  const body = plain.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${body}${end < plain.length ? "…" : ""}`;
}

/** The first step, then note, `word` appears in, or none. */
function textHit(entry: CorpusEntry, word: string): DeepHit | undefined {
  for (const field of ["steps", "notes"] as const) {
    const folded = entry.folded[field];
    for (let index = 0; index < folded.length; index += 1) {
      const at = matchIndex(folded[index], word);
      if (at < 0) continue;
      return {
        field,
        number: index + 1,
        text: snippetAt(entry.plain[field][index], folded[index], at),
      };
    }
  }
  return undefined;
}

function scoreEntry(
  row: RecipeRow,
  entry: CorpusEntry | undefined,
  words: readonly string[],
): { score: number; found?: DeepHit } {
  let score = 0;
  let found: DeepHit | undefined;
  for (const word of words) {
    const field = rowFieldFor(row, word);
    if (field) {
      score += DEEP_FIELD_WEIGHTS[field];
      continue;
    }
    const hit = entry ? textHit(entry, word) : undefined;
    if (!hit) continue;
    score += DEEP_FIELD_WEIGHTS[hit.field];
    found ??= hit;
  }
  return found ? { score, found } : { score };
}

/**
 * `scoreFreeText` with the steps and notes as two more fields at weight 1
 * (D8): each word scores the best field it appears in — name 4, tags 3,
 * ingredients 2, then description, steps and notes 1 — summed. `found` is
 * the first word whose best field was a step or a note.
 */
export function scoreDeepText(
  row: RecipeRow,
  text: RecipeText | undefined,
  query: string,
): { score: number; found?: DeepHit } {
  return scoreEntry(
    row,
    text ? corpusEntry(text) : undefined,
    freeTextWords(query),
  );
}

/**
 * The text corpus, kept for one content directory at one HEAD (51c):
 * every engine write commits, so a new HEAD is how a running editor or MCP
 * server learns a recipe's steps changed. One entry, not a map keyed by
 * directory — a process searches one content directory, and a second one
 * simply reads again. Outside a repository (no HEAD) nothing is kept:
 * there is nothing to tell a change by.
 */
let corpusCache:
  | {
      contentDirectory: string;
      head: string;
      corpus: Promise<Map<string, CorpusEntry>>;
    }
  | undefined;

/** Forget the kept corpus (the tests; the measurement's cold read). */
export function clearRecipeTextCache(): void {
  corpusCache = undefined;
}

/**
 * Every indexed recipe's steps and notes, read from its `recipe.json`
 * through the engine (`readContentFileOrNull`: no new filesystem call in
 * traced code, and the file `recipe_get` answers). The index decides which
 * recipes there are — a reader never builds one (F30) — and a file that is
 * gone or unreadable is a recipe with no text, not a failed search.
 */
async function readCorpus(
  ctx: CurationContext,
  slugs: readonly string[],
): Promise<Map<string, CorpusEntry>> {
  const corpus = new Map<string, CorpusEntry>();
  for (let start = 0; start < slugs.length; start += READ_BATCH) {
    const batch = slugs.slice(start, start + READ_BATCH);
    const recipes = await Promise.all(
      batch.map((slug) =>
        readContentFileOrNull<Recipe, RecipeEntryValue, RecipeEntryKey>({
          config: recipeContentConfig,
          slug,
          contentDirectory: ctx.contentDirectory,
        }).catch(() => null),
      ),
    );
    batch.forEach((slug, index) => {
      const recipe = recipes[index];
      if (recipe) corpus.set(slug, corpusEntry(recipeText(recipe)));
    });
  }
  return corpus;
}

/** The corpus for these slugs: the one kept at this HEAD, or a fresh read. */
async function recipeTextCorpus(
  ctx: CurationContext,
  slugs: readonly string[],
): Promise<Map<string, CorpusEntry>> {
  const head = await readHead(ctx.contentDirectory);
  if (!head) return readCorpus(ctx, slugs);
  const kept = corpusCache;
  if (kept?.contentDirectory === ctx.contentDirectory && kept.head === head) {
    return kept.corpus;
  }
  const entry = {
    contentDirectory: ctx.contentDirectory,
    head,
    corpus: readCorpus(ctx, slugs),
  };
  corpusCache = entry;
  /* A failed read is not kept: the next search reads again. */
  entry.corpus.catch(() => {
    if (corpusCache === entry) corpusCache = undefined;
  });
  return entry.corpus;
}

/**
 * The curator's search over steps and notes too (51c, D8): `searchRecipes`
 * with the same query language and filters, and two more free-text fields
 * read from the recipe files — so "frother" finds the latte whose step 2
 * says "froth the milk with a frother", which the index (name, tags,
 * ingredients, description) never carries. `/search` is unchanged: it is
 * built in the browser, and steps would make its corpus much bigger.
 *
 * A row that a step or note found carries `found`: where, and the words
 * around it. Without free text no file is read (the typed terms decide).
 */
export async function searchRecipeText(
  ctx: CurationContext,
  raw: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<DeepSearchResult> {
  const query = raw ?? "";
  const { text, filter, hasAdvancedSyntax } = parseQuery(query);
  const words = freeTextWords(text);
  const rows = await readAllRecipeRows(ctx);
  const corpus =
    words.length > 0
      ? await recipeTextCorpus(
          ctx,
          rows.map((row) => row.slug),
        )
      : undefined;
  const scored = await rankRows(
    ctx,
    { text, filter },
    (row) => ({ row, ...scoreEntry(row, corpus?.get(row.slug), words) }),
    rows,
  );
  const matched: DeepSearchRow[] = scored.map(({ row, found }) =>
    found ? { ...row, found } : row,
  );
  return {
    query: { raw: query, text, hasAdvancedSyntax },
    deep: true,
    total: matched.length,
    recipes: matched.slice(offset, offset + limit),
  };
}

/**
 * Every tag in the corpus, as labels.
 *
 * `readTaxonomyTerms` rather than `getAllTags()`: the latter reads through
 * `unstable_cache` and throws `incrementalCache missing` outside Next (fact 4),
 * and it also cannot take a content directory. It is the Node-safe half of the
 * same folded value the site's cached read wraps. `null` means the aggregate
 * has never been folded — an unbuilt content directory reads as no tags.
 *
 * Mapped to `label` so `/api/tags`, `recipes tags` and the MCP `tag_list` go on
 * answering with the strings a curator types, unchanged in shape by 24b. The
 * slugs and counts the fold also carries are `/tags`' business.
 */
export async function listTags(ctx: CurationContext): Promise<string[]> {
  const terms = await readTaxonomyTerms({
    config: recipeContentConfig,
    taxonomy: recipeTagTaxonomy,
    contentDirectory: ctx.contentDirectory,
  });
  return (terms ?? []).map((term) => term.label);
}
