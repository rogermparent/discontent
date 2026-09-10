/**
 * What a content repository must not track: every path the engine derives.
 *
 * A content directory holds sources *and* the artifacts built from them — the
 * LMDB content index, every pagination keyspace, every folded aggregate, the
 * dirty-page artifact, and resized images. All of them rebuild from what is
 * tracked, and committing any of them makes every save a huge binary diff.
 * So each site writes a `.gitignore` naming them.
 *
 * Until this module, every writer of that list re-typed it by hand, and **all
 * three had drifted** — the production one was missing `/pages/index`, the
 * recipe harness had that but neither of the `pages` derived directories, and
 * the portfolio harness named only two index directories and nothing else.
 * §13's trap has fired four times on exactly this. The engine already knows the
 * answer from `ContentTypeConfig`, so the list stops being copied and starts
 * being derived.
 */
import { dirname } from "path";
import type { AnyContentTypeConfig } from "./types";

/** Resized images: build output of `@discontent/next-static-image`. */
const TRANSFORMED_IMAGES = "/transformed-images";

/**
 * The dirty-page artifact (§13). A dotfile specifically so `commitChanges`'
 * `git add "./*"` fallback cannot sweep it into a content commit — an ignore
 * rule is the honest belt to that suspenders.
 */
const PAGINATION_CHANGES = "/.pagination-changes.json";

/**
 * The three derived directories one content type owns.
 *
 * Computed from `indexDirectory`, not from `contentType`: `getPaginationDirectory`
 * and `getAggregateDirectory` both place their environments at
 * `dirname(indexDirectory)/{pagination,aggregates}/<name>/`, so deriving from
 * the same field is what makes this list *true* rather than merely consistent
 * with today's naming, where the two happen to agree.
 *
 * All three are emitted **unconditionally**, whether or not the type declares a
 * pagination index or an aggregate. That carries forward the reasoning F10b
 * wrote into the recipe writer: naming a path before anything creates it costs
 * nothing, and the alternative is the failure this whole module exists to kill.
 *
 * Directory-level rather than per-index — `/recipes/pagination`, not
 * `/recipes/pagination/by-date`. A content type that declares its second index
 * then needs no ignore change, ever.
 */
function derivedDirectoriesOf(config: AnyContentTypeConfig): string[] {
  const base = dirname(config.indexDirectory);
  return [
    `/${config.indexDirectory}`,
    `/${base}/pagination`,
    `/${base}/aggregates`,
  ];
}

/**
 * The body of a content repository's `.gitignore`, for the content types a
 * site declares.
 *
 * Ends with a newline and begins without one, so the result is a well-formed
 * file rather than something a caller has to pad.
 *
 * @example
 * ```ts
 * await writeFile(
 *   join(contentDirectory, ".gitignore"),
 *   derivedContentPaths(recipeContentTypes),
 * );
 * ```
 */
export function derivedContentPaths(
  configs: readonly AnyContentTypeConfig[],
): string {
  const paths = [
    TRANSFORMED_IMAGES,
    ...configs.flatMap(derivedDirectoriesOf),
    PAGINATION_CHANGES,
  ];
  // Two configs sharing a directory prefix would otherwise name it twice. No
  // site does that today; a duplicate ignore line is harmless but reads as a
  // bug in a generated file.
  const unique = paths.filter((path, index) => paths.indexOf(path) === index);
  return `${unique.join("\n")}\n`;
}

export default derivedContentPaths;
