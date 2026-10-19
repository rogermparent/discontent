import { recipeTagReads } from "./readRecipeTagIndex";
import { tagTermReads } from "./readTagTerms";
import { tagSlug } from "../tagSlug";
import {
  holidayAliasTarget,
  holidayChildren,
  holidayEntries,
  holidayKeys,
  holidayMenuData,
  type HolidayEntry,
  type HolidayMenuData,
} from "../holidaysPage";

/**
 * The holiday pages' reads (42e): the tree, each holiday's record (for its
 * label, description, picture and pins) and one cached by-term row per key
 * of the holidays' subtrees — `/drinks`' and the term page's pattern (34a),
 * so a write that moves a holiday's rows (a recipe tagged or untagged, a
 * term assigned, renamed or merged) expires these pages through the same
 * tags as `/tags/<holiday>`, and a record edit through `item:tag-terms:<slug>`
 * and the tree. Nothing here reads a whole by-term map, and nothing creates
 * an index (F30): these are the engine's cached readers.
 *
 * Recipes only: a plan filed under a holiday shows on its term page.
 */

/** `/holidays`: every holiday that has a recipe, or `null` with no root. */
export async function readHolidayAlmanac(): Promise<HolidayEntry[] | null> {
  const tree = await tagTermReads.tree.read();
  const children = holidayChildren(tree);
  const keys = holidayKeys(tree);
  const [rows, records] = await Promise.all([
    Promise.all(keys.map((key) => recipeTagReads.byTerm.readKey(key))),
    Promise.all(children.map((slug) => tagTermReads.items.read(slug))),
  ]);
  const byKey = new Map(keys.map((key, i) => [key, rows[i]]));
  const bySlug = new Map(children.map((slug, i) => [slug, records[i]]));
  return holidayEntries({
    tree,
    records: (slug) => bySlug.get(slug),
    recipeRows: (key) => byKey.get(key),
  });
}

/**
 * `/holidays/<slug>`: the menu, the almanac beside it (for "Then …, in N
 * days"), or the holiday an alias names — `null` when the slug is neither a
 * holiday nor one's alias.
 */
export async function readHolidayMenu(
  slug: string,
): Promise<
  | { menu: HolidayMenuData; almanac: HolidayEntry[] }
  | { alias: { slug: string; label: string } }
  | null
> {
  const tree = await tagTermReads.tree.read();
  if (!holidayChildren(tree).includes(slug)) {
    const alias = holidayAliasTarget(tree, slug);
    return alias ? { alias } : null;
  }
  const [almanac, record] = await Promise.all([
    readHolidayAlmanac(),
    tagTermReads.items.read(slug),
  ]);
  /* The almanac read every key of this holiday's subtree already. */
  const keys = holidayKeys(tree);
  const rows = await Promise.all(
    keys.map((key) => recipeTagReads.byTerm.readKey(key)),
  );
  const byKey = new Map(keys.map((key, i) => [key, rows[i]]));
  const menu = holidayMenuData({
    slug,
    tree,
    record,
    recipeRows: (key) => byKey.get(key),
  });
  return menu ? { menu, almanac: almanac ?? [] } : null;
}

/**
 * Every holiday page the export emits: each holiday, and each alias of one
 * that is not a term of its own (a page that sends the reader on). Never
 * empty — `output: "export"` rejects a dynamic route with no params — so a
 * site with no holidays emits one placeholder that answers 404, the
 * `generateTagStaticParams` guard.
 */
export async function readHolidaySlugs({
  aliases = false,
}: { aliases?: boolean } = {}): Promise<string[]> {
  const tree = await tagTermReads.tree.read();
  const children = holidayChildren(tree);
  const extra = aliases
    ? children
        .flatMap((slug) => tree?.[slug]?.aliases ?? [])
        .map((alias) => tagSlug(alias))
        .filter((alias) => holidayAliasTarget(tree, alias) !== undefined)
    : [];
  const slugs = [...new Set([...children, ...extra])];
  return slugs.length > 0 ? slugs : ["_"];
}
