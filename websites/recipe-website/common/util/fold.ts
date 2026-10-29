/**
 * Fold text for matching: lowercase and diacritic-stripped, mirroring what
 * FlexSearch's default encoder does to the corpus — so `tag:creme` matches
 * `Crème` for the same reason a plain "creme" search finds it.
 *
 * For precomposed (NFC) text — what content files carry — this is
 * length-preserving (é → e + ◌́ → e, one char in, one char out), which
 * `highlightText` relies on to slice at a prefix offset. It checks that anyway.
 *
 * Its own module since 46h (it was `queryLanguage.ts`'s, which re-exports
 * it): `ingredientNames.ts` folds with it, and the query language now reads
 * ingredient names, so the two would otherwise import each other.
 */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
