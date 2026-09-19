import type { ContentTypeConfig } from "@discontent/cms/content/types";
import { createTermContentType } from "@discontent/cms/taxonomies/termContentType";
import { featuredRecipeContentConfig } from "./featuredRecipeContentConfig";
import type { TagTerm, TagTermEntryKey, TagTermIndexValue } from "./types";

/**
 * The `tag` vocabulary's **term records** — the site's adoption of 24a's engine
 * kind (24c/D2).
 *
 * Everything structural comes from `createTermContentType`: the content type
 * name `tag-terms`, `taxonomies/tag/{data,index}`, `term.json`, the
 * `[date, slug]` key, the self-referencing parent edge that borrows
 * `parentLabel`, and the `tree` aggregate. What this module adds is the one
 * edge the engine cannot know about — that a *feature* may point at a term.
 *
 * **Why the taxonomy modules do not import this** (T17). `recipeContentConfig`
 * and `groupContentConfig` read `taxonomies: [recipeTagTaxonomy]` / `[groupTagTaxonomy]`
 * as a **direct value at module evaluation**, not through a thunk. So a chain
 * `recipeTagTaxonomy → tagTermContentConfig → featuredRecipeContentConfig →
 * recipeContentConfig → recipeTagTaxonomy` would read a `const` in its temporal
 * dead zone the first time anything imported a taxonomy module before a content
 * config — a `ReferenceError` at import, from a file that looks untouched.
 * `TaxonomyConfig.terms` therefore stays declared and **unread**, and every
 * site reader names this config directly instead. `test/tagTerms.test.ts`
 * carries the import-order tripwire that keeps it that way for 24d.
 *
 * The import of `featuredRecipeContentConfig` below is safe for the opposite
 * reason: it is used only inside a thunk, which is the same cycle recipes and
 * groups already have with featured (T2).
 *
 * No `version:` literal, deliberately (T19). A content config carries none —
 * the versions `specVersions` pins live on the pagination and aggregate modules
 * — and adding a fake one to satisfy the grep would pin a number nothing reads.
 */
const base = createTermContentType({
  taxonomy: "tag",
  directory: "taxonomies/tag",
  /*
   * `uploads/tag-term/<slug>/uploads/<file>` — the singular shape recipes and
   * groups use, with the content type's own stem. `getTermUploadPath` in
   * `filesystemDirectories.ts` is the read side of exactly this string.
   */
  uploadsDirectory: "uploads/tag-term",
});

export const tagTermContentConfig: ContentTypeConfig<
  TagTerm,
  TagTermIndexValue,
  TagTermEntryKey
> = {
  ...base,
  /*
   * The engine's self-referencing half — "when this term moves, rewrite its
   * children" — plus the site's own: a featured entry borrows `label` and
   * `image` off the term, so renaming or re-picturing a term has to reproject
   * the featured index the same way renaming a recipe does.
   *
   * Spread rather than replaced, so the engine can add an outbound edge later
   * without this file silently dropping it.
   */
  referencedBy: [
    ...(base.referencedBy ?? []),
    { config: () => featuredRecipeContentConfig, indexField: "term" },
  ],
};

export default tagTermContentConfig;
