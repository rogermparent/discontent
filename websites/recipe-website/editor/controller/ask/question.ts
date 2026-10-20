/**
 * Does a typed input read as a question (43q)? Then ⌘K offers Ask first. A
 * search stays a search: query syntax (`tag:`, `-word`, `( )`) never reads as
 * a question, nor do one or two words, whatever they are ("show cookies").
 * Anything else can still be asked with Tab.
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

/** Words a question or a request starts with. */
const OPENERS = new Set([
  "what",
  "whats",
  "what's",
  "which",
  "how",
  "can",
  "could",
  "should",
  "would",
  "will",
  "is",
  "are",
  "do",
  "does",
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

/** Words a long input needs before it reads as a sentence on its own. */
const SENTENCE_WORDS = 6;

export function readsLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (SYNTAX.test(trimmed)) return false;
  const words = trimmed
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 3) return false;
  if (trimmed.endsWith("?")) return true;
  if (OPENERS.has(words[0].replace(/[^a-z']/g, ""))) return true;
  return words.length >= SENTENCE_WORDS;
}
