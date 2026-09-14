import { readContentFile } from "@discontent/cms/content/readContentFile";
import { readAllIds } from "@discontent/cms/pagination/readAllIds";
import { groupContentConfig } from "../groupContentConfig";
import { groupsByDate, type GroupListEntry } from "../groupPaginationConfig";
import type {
  Group,
  GroupEntryKey,
  GroupEntryValue,
  GroupKind,
} from "../types";

/**
 * One group as the client search surfaces see it: enough to match on, enough to
 * draw a card with, and the member slugs the `group:` filter narrows recipes by.
 *
 * `recipes` carries slugs only. The client already holds every recipe's display
 * record (`/search/all`), so shipping names here would be the same strings
 * twice; and the slug is what a membership test compares against.
 */
export interface GroupSearchEntry {
  slug: string;
  date: number;
  name: string;
  kind: GroupKind;
  description?: string;
  /**
   * The group's own picture, when it has one (22h/D14) — the whole reason the
   * field is on the index as well as the data file. A `/search` card is
   * rendered on the client and can run no server walk, so this is the only
   * picture it can draw; a group without one shows the placeholder there, where
   * a server-rendered card would fall back to a member's photo.
   */
  image?: string;
  recipes: string[];
}

/**
 * Every group, for `/search/groups`.
 *
 * **Read from the data files, not the index** (fact 4). `GroupEntryValue`
 * carries `{name, kind, items}` and no `description` (D5), and the search
 * surfaces match on the description — so serving this from the index would mean
 * changing the index shape, which is exactly what this phase promised not to
 * do. Groups are counted in tens, the walk is a keys-only pass plus one small
 * JSON read each, and the result is a single document the client fetches once.
 *
 * CLI-safe by construction (T5/D8): `readAllIds` and `readContentFile` only, no
 * `unstable_cache` anywhere, and `contentDirectory` threaded rather than read
 * from the environment (T16).
 *
 * A slug in the keyspace whose data file has gone is skipped rather than
 * thrown: the index and the data directory are written separately, and a search
 * document is not the place to discover they disagree.
 */
export async function getGroupSearchCorpus({
  contentDirectory,
}: { contentDirectory?: string } = {}): Promise<GroupSearchEntry[]> {
  const slugs = await readAllIds<
    GroupEntryValue,
    GroupEntryKey,
    GroupListEntry
  >({
    config: groupContentConfig,
    paginationConfig: groupsByDate,
    contentDirectory,
  });

  /*
   * Two passes since 23c, because membership became transitive (D18).
   *
   * The first reads every group; the second expands each one's `recipes` by
   * following its sub-groups through the records the first pass already holds.
   * Reading twice would be the obvious alternative and is the wrong one: a
   * collection of plans would re-read each plan once per parent, and the whole
   * point of this document is that the walk happens once per build.
   */
  const records = new Map<string, Group>();
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        records.set(
          slug,
          await readContentFile<Group, GroupEntryValue, GroupEntryKey>({
            config: groupContentConfig,
            slug,
            contentDirectory,
          }),
        );
      } catch {
        /* A slug in the keyspace whose data file has gone: skipped, see above. */
      }
    }),
  );

  /*
   * Built from `slugs` rather than from the map, so the pre-sort order is the
   * keyspace's and not whichever read settled first — `sort` is stable, and two
   * groups sharing a date have to land in a fixed order.
   */
  const entries = slugs
    .map((slug) => [slug, records.get(slug)] as const)
    .filter((pair): pair is [string, Group] => pair[1] !== undefined)
    .map(
      ([slug, group]): GroupSearchEntry => ({
        slug,
        date: group.date,
        name: group.name,
        kind: group.kind,
        description: group.description,
        image: group.image,
        recipes: expandRecipes(slug, records),
      }),
    );

  /*
   * Newest first, matching every other group surface (`/groups`, the homepage
   * strip). `readAllIds` walks the sorted keyspace ascending, and the key is
   * `[date, slug]`, so this is a reversal rather than a sort in disguise — but
   * it is written as a sort because the corpus is tiny and the order is a
   * promise the rail and the palette both rely on.
   */
  return entries.sort((a, b) => b.date - a.date);
}

/**
 * How deep `group:` follows sub-groups — the curation layer's cap, restated
 * where the walk is (D17/D18).
 *
 * It can only be reached by a content directory written before the write-time
 * cycle check, or edited by hand. The visited set is what actually terminates
 * the walk; this bounds the pathological shapes it cannot.
 */
const MAX_GROUP_DEPTH = 32;

/**
 * Every recipe in a group, its sub-groups' recipes included (23c/D18).
 *
 * Transitive here where "Appears in" is direct (D16), and the asymmetry is the
 * point: a reader looking at a parent's page wants the whole plan narrowed to,
 * and `group:spring-menus` reading only the two rows the collection literally
 * holds would answer with a third of what the page shows.
 *
 * Deduped in walk order: a meal plan may list the same recipe twice, and two
 * sub-groups may share one. A membership list with a duplicate in it would
 * count that recipe twice into a filter that only asks whether it is in the
 * group at all.
 */
function expandRecipes(slug: string, records: Map<string, Group>): string[] {
  const recipes: string[] = [];
  const seenRecipes = new Set<string>();
  const visited = new Set<string>([slug]);

  const walk = (current: string, depth: number) => {
    if (depth > MAX_GROUP_DEPTH) return;
    for (const item of records.get(current)?.items ?? []) {
      if (item?.recipe) {
        if (seenRecipes.has(item.recipe)) continue;
        seenRecipes.add(item.recipe);
        recipes.push(item.recipe);
        continue;
      }
      if (!item?.group || visited.has(item.group)) continue;
      visited.add(item.group);
      walk(item.group, depth + 1);
    }
  };

  walk(slug, 0);
  return recipes;
}

export default getGroupSearchCorpus;
