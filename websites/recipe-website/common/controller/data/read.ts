import { readContentFile } from "@discontent/cms/content/readContentFile";
import { readContentIndex } from "@discontent/cms/content/readContentIndex";
import { recipeContentConfig } from "../recipeContentConfig";
import { Recipe, RecipeEntryKey, RecipeEntryValue } from "../types";
import { recipeTagReads } from "./readRecipeTags";

export type MassagedRecipeEntry = {
  date: number;
  slug: string;
  name: string;
  /** Flattened, truncated recipe description — indexed and shown as a search snippet. */
  description?: string;
  ingredients?: string[];
  image?: string;
  tags?: string[];
  /**
   * Groups this recipe belongs to, as slug + name per membership.
   *
   * **Never written on the server, and never served** — `/search/all` maps this
   * type and no read fills it. It lives on the type because `SearchContext`
   * decorates the fetched corpus with it from `/search/groups` (22f), and every
   * client surface then carries `MassagedRecipeEntry` values that really do
   * have it. Group membership is in the *groups* index, and moves without the
   * recipe index moving at all, which is why it arrives as a second document
   * rather than as a field on this one.
   */
  groups?: string[];
  /** Minutes, for the search query language's `time:` filter. */
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
};

export interface ReadRecipeIndexResult {
  recipes: MassagedRecipeEntry[];
  more: boolean;
}

/**
 * The raw, uncached read of a recipe's data file. Throws ENOENT when there is
 * none.
 *
 * **Rendering code wants `recipeItems.read(slug)` instead** — cached, tagged
 * `item:recipes:<slug>`, and `null` rather than a throw for a missing recipe.
 * This one survives for the write path, which must not read through a cache:
 * `buildUpdateData` reads the current record to carry `image` and `video`
 * forward, and a stale read there would write the stale values back to disk.
 * It also takes `contentDirectory`, which a module-scope cached read cannot.
 *
 * The same split F10c used for `getAllTags`.
 */
export async function getRecipeBySlug({
  slug,
  contentDirectory,
}: {
  slug: string;
  contentDirectory?: string;
}): Promise<Recipe> {
  return readContentFile<Recipe, RecipeEntryValue, RecipeEntryKey>({
    config: recipeContentConfig,
    slug,
    contentDirectory,
  });
}

export async function getRecipes({
  limit,
  offset,
  contentDirectory,
}: {
  limit?: number;
  offset?: number;
  contentDirectory?: string;
} = {}): Promise<ReadRecipeIndexResult> {
  const result = await readContentIndex<
    RecipeEntryValue,
    RecipeEntryKey,
    MassagedRecipeEntry
  >({
    config: recipeContentConfig,
    limit,
    offset,
    reverse: true,
    contentDirectory,
    map: ({
      key: [date, slug],
      value: {
        name,
        description,
        ingredients,
        image,
        tags,
        prepTime,
        cookTime,
        totalTime,
      },
    }) => ({
      date,
      slug,
      name,
      description,
      ingredients,
      image,
      tags,
      prepTime,
      cookTime,
      totalTime,
    }),
  });

  const recipes = result.entries;

  return { recipes, more: result.more };
}

/**
 * One corpus read, shared by whichever of the two search-corpus routes ask for
 * it at the same moment.
 *
 * **This exists for correctness, not speed.** F4a split `/search/all` into two
 * routes, and the client fetches both at once on a cold load — so the server
 * went from one full-index read per page load to two *concurrent* ones. That
 * is not safe against the environment cache: `readContentIndex` awaits the
 * range read and only then calls `getCount()`, and during that await another
 * request can reach `openCachedEnvironment`, find the content directory's file
 * signature changed, and **close the environment the first read is still
 * using**. The first read then dies on `MDB_BAD_RSLOT`, and its route answers
 * 500. Measured: five in the first half-minute of the container suite, the two
 * routes failing alternately, once the split made the pair concurrent.
 *
 * Collapsing the pair to a single in-flight read removes the concurrency the
 * split introduced. The underlying race — a cached environment closed while
 * another reader holds it — is older than F4a and survives this; it is recorded
 * as **F24** in `packages/cms/docs/incremental-regeneration.md` §11.1.
 *
 * Two consequences worth naming. The callers share one result *object*, so
 * neither may mutate it — both only `map` over it. And a write landing between
 * the two requests is invisible to the second, which is already true of any two
 * reads and bounded here by the duration of one read; both documents are
 * rebuilt whole on any write regardless.
 */
let inFlightSearchCorpus: Promise<ReadRecipeIndexResult> | undefined;

export function getSearchCorpus(): Promise<ReadRecipeIndexResult> {
  if (inFlightSearchCorpus) return inFlightSearchCorpus;
  const read = getRecipes().finally(() => {
    // Guarded so a later read's promise is never cleared by an earlier one.
    if (inFlightSearchCorpus === read) inFlightSearchCorpus = undefined;
  });
  inFlightSearchCorpus = read;
  return read;
}

/**
 * The unique set of tags across the whole corpus, sorted alphabetically —
 * feeds the homepage's browse chips and the tag suggestions in the three
 * recipe forms.
 *
 * One O(1) key read of a value folded at write time, where this used to load
 * every recipe in the corpus and build a `Set` on **every render of every one
 * of those four surfaces**. It is also the last untagged reader on the
 * homepage: the strips moved onto the keyspace in F10a, and this closes it.
 *
 * `contentDirectory` is gone rather than ignored. The cached read binds the
 * directory at module scope — it has to, since it is also part of the cache
 * key — and every one of the four call sites already passed nothing. A
 * parameter that silently did not work would be worse than not having one;
 * anything needing a different directory should call `readAggregate` with it.
 *
 * `null` means the aggregate has never been folded — an unbuilt content
 * directory, or a fixture captured before recipes declared this. It reads as
 * no tags, which is what the corpus looked like to the previous
 * implementation too when the index was empty.
 */
export async function getAllTags(): Promise<string[]> {
  return (await recipeTagReads.read()) ?? [];
}
