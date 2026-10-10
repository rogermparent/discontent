import { readSearchTerms } from "recipe-website-common/controller/data/readTermPage";

/**
 * The term half of the search corpus (epic 31, 31b): every term — carried by a
 * recipe or a group, or only defined by a record — with its parent and count.
 *
 * What the browser's tag rail, autocomplete, ⌘K and `BrowseChips` list, and
 * what `SearchContext` expands `tag:` with, so `tag:dessert` reaches the
 * recipes tagged with anything under `dessert`. Its own document for the
 * reason `/search/groups` is one: a term write moves no recipe record, and the
 * recipe corpus is what gates the FlexSearch populate.
 */
export async function GET() {
  return Response.json(await readSearchTerms());
}
