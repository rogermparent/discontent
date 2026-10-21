/**
 * Does a typed input read as a question (43q)? ⌘K asks this twice:
 *
 * - `askOffers` — the Ask row shows, without the highlight, so Enter still
 *   opens the top recipe and Tab moves the highlight onto Ask;
 * - `readsLikeQuestion` — the Ask row leads and takes the highlight, so
 *   Enter asks. Only a closing "?" or a question word in front (what, how,
 *   can, should…) earns that: "any bean salad", "make ahead breakfast",
 *   "use up buttermilk" and a long recipe name are searches first (Dq12).
 *
 * A search stays a search either way: query syntax (`tag:`, `-word`, `( )`)
 * never reads as a question, nor do one or two words ("show cookies").
 */
import { FILTER_FIELDS } from "recipe-website-common/components/SearchForm/queryLanguage";

/**
 * Query syntax: a field (`tag:`), a negation (`-tag`, `-lime`) or a
 * parenthesis. Not the operator words — "lime and gin" is a question's
 * "and", though the search language would read it as AND.
 */
const SYNTAX = new RegExp(
  `(?:^|\\s)-\\S|\\b(?:${FILTER_FIELDS.join("|")}):|[()]`,
  "i",
);

/** Words a question starts with: wh- words and modals — Enter asks. */
const QUESTION_WORDS = new Set([
  "what",
  "whats",
  "what's",
  "which",
  "how",
  "can",
  "could",
  "should",
  "is",
  "are",
  "do",
  "does",
  "will",
  "would",
  "who",
  "where",
  "when",
  "why",
]);

/**
 * Words a request starts with: the row is offered, the highlight stays on
 * the search's top recipe (many recipe names and searches start this way).
 */
const REQUEST_WORDS = new Set([
  "any",
  "anything",
  "something",
  "show",
  "find",
  "give",
  "suggest",
  "recommend",
  "i",
  "i'm",
  "im",
  "i've",
  "we",
  "we're",
  "we've",
  "make",
  "plan",
  "help",
  "need",
  "want",
  "got",
  "use",
  "using",
]);

/** Words a long input needs before Ask is offered for it on length alone. */
const SENTENCE_WORDS = 6;

/** The input's words, lower-cased, or `undefined` for a search's shape. */
function questionWords(text: string): string[] | undefined {
  const trimmed = text.trim();
  if (!trimmed || SYNTAX.test(trimmed)) return undefined;
  const words = trimmed
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/\s+/)
    .filter(Boolean);
  return words.length < 3 ? undefined : words;
}

function opener(words: string[]): string {
  return words[0].replace(/[^a-z']/g, "");
}

/** The Ask row leads and takes the highlight: Enter asks. */
export function readsLikeQuestion(text: string): boolean {
  const words = questionWords(text);
  if (!words) return false;
  return text.trim().endsWith("?") || QUESTION_WORDS.has(opener(words));
}

/** The Ask row shows (perhaps without the highlight): Tab reaches it. */
export function askOffers(text: string): boolean {
  const words = questionWords(text);
  if (!words) return false;
  return (
    readsLikeQuestion(text) ||
    REQUEST_WORDS.has(opener(words)) ||
    words.length >= SENTENCE_WORDS
  );
}
