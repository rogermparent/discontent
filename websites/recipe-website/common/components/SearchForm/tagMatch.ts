import type { SearchTerm } from "../../controller/data/readTermPage";
import { fold, type TagWordMatch } from "./queryLanguage";

/**
 * Does a name start with what has been typed? Folded on both sides, so `cre`
 * reaches "Crème". The rule the `tag:` completion list offers by
 * (`tagCompletionOptions`), and the rule a picked tag uses to decide whether it
 * replaces the word being typed — one function, so the two cannot drift.
 */
export function startsWithFolded(name: string, foldedPrefix: string): boolean {
  return fold(name).startsWith(foldedPrefix);
}

/** The term a tag string names, by its label or its slug. */
function termFor(
  tag: string,
  terms: readonly SearchTerm[],
): SearchTerm | undefined {
  const folded = fold(tag);
  return terms.find(
    (term) => fold(term.label) === folded || fold(term.slug) === folded,
  );
}

/**
 * How a picked tag is matched against the word being typed (`insertTagTerm`).
 *
 * The tag answers to its own spelling and to its term's label, slug and
 * aliases (32i) — `bisc` is heading for "cookies" when "biscuits" is one of
 * its aliases, exactly as the completion list would offer it. `isTag` knows
 * every name in the vocabulary, so a finished `tag:dessert` is never mistaken
 * for a half-typed `tag:dessert-bars`.
 */
export function tagWordMatch(
  tag: string,
  terms: readonly SearchTerm[],
): TagWordMatch {
  const term = termFor(tag, terms);
  const names = term
    ? [tag, term.label, term.slug, ...(term.aliases ?? [])]
    : [tag];
  return {
    matches: (prefix) => {
      const folded = fold(prefix);
      return names.some((name) => startsWithFolded(name, folded));
    },
    isTag: (value) => {
      const folded = fold(value);
      return terms.some(
        (candidate) =>
          fold(candidate.label) === folded ||
          fold(candidate.slug) === folded ||
          (candidate.aliases ?? []).some((alias) => fold(alias) === folded),
      );
    },
  };
}
