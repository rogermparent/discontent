import slugify from "@sindresorhus/slugify";

/**
 * Term identity, in two steps that are deliberately separate.
 *
 * `normalizeTerm` decides what two spellings of a term count as the *same*
 * term; `termSlug` decides what a term looks like in a URL. They are separate
 * because only the first is lossy in a way a label can survive: `"Half & Half"`
 * normalizes to `"half & half"` — still printable — and slugs to
 * `"half-half"`, which is not invertible. So the fold stores the normalised
 * label beside the slug rather than reconstructing one from it.
 */

/**
 * Trim, collapse internal whitespace runs, lowercase. `""` for a term that is
 * empty afterwards, so callers can drop it.
 *
 * The same three rules as the component library's `normalizeTag`, implemented
 * here rather than imported: `@discontent/component-library` is not an engine
 * dependency and must not become one over three lines. The rules are pinned by
 * `test/taxonomies.test.ts`; if they ever diverge from the site's, the site's
 * corpus is what moves.
 */
export function normalizeTerm(term: string): string {
  return term.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The URL segment for a term — identical to the recipe site's `tagSlug`, which
 * is why adopting the taxonomy kind moves no existing `/tags/<slug>` URL.
 *
 * Lossy and not inverted: a term page's display label travels with its stored
 * entry.
 */
export function termSlug(term: string): string {
  return slugify(term);
}
