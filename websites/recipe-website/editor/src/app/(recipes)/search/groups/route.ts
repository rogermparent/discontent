import { getGroupSearchCorpus } from "recipe-website-common/controller/data/readGroupSearchCorpus";

/**
 * The group half of the search corpus (22f): what the browse rail, the group
 * strip on `/search`, the ⌘K Groups rows and the `group:` filter all read.
 *
 * Its own route rather than a field on `/search/all`, for the reason F4a split
 * the ingredients off: the two documents move independently. A group write
 * leaves every recipe record untouched, and the recipe corpus is the one that
 * gates the expensive FlexSearch populate — folding groups into it would make
 * relabelling a meal plan reindex the whole corpus.
 *
 * No in-flight collapse (unlike `getSearchCorpus`): one route fetches this, so
 * there is no concurrent pair to serialise.
 */
export async function GET() {
  return Response.json(await getGroupSearchCorpus());
}
