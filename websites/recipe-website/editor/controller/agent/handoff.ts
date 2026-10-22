/**
 * ⌘K's hand-off to the curator (epic 44, 44d): does a typed input read like
 * a fetch request — "find …", "grab …", "get me …", "import …", "fetch
 * …", "look up …", "add … recipes"? Then the palette offers a row "Ask the
 * curator: “…”" that opens `/curator` with the ask filled in, never
 * started (Ed6). Ask (43q) keeps questions: this row never takes the
 * highlight, so its Enter rules (`question.ts`) stand as they are.
 *
 * A search stays a search: query syntax (`tag:`, `-word`, `( )`) is never
 * a request, nor is the verb alone ("import", "find").
 *
 * Dependency-free: the palette's browser code loads it.
 */

/** Query syntax, as `question.ts` reads it: a field, a negation, a parenthesis. */
const SYNTAX = /(?:^|\s)-\S|\b[a-z]+:(?!\/\/)|[()]/i;

/** Openers that ask for something fetched, with at least one word after. */
const OPENERS = /^(?:find|grab|get\s+me|import|fetch|look\s+up)\s+\S/i;

/** "add … recipes": a request to bring recipes in. */
const ADD_RECIPES = /^add\s+(?:\S+\s+)*?recipes?\b/i;

/** Whether `text` reads like a request for the curator. */
export function curatorOffers(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || SYNTAX.test(trimmed)) return false;
  return OPENERS.test(trimmed) || ADD_RECIPES.test(trimmed);
}

/** Where the row goes: `/curator` with the ask filled in (not started). */
export function curatorHref(text: string): string {
  const prompt = text.trim();
  return prompt ? `/curator?prompt=${encodeURIComponent(prompt)}` : "/curator";
}
