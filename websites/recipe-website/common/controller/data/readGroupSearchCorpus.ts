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

  const entries = await Promise.all(
    slugs.map(async (slug): Promise<GroupSearchEntry | undefined> => {
      let group: Group;
      try {
        group = await readContentFile<Group, GroupEntryValue, GroupEntryKey>({
          config: groupContentConfig,
          slug,
          contentDirectory,
        });
      } catch {
        return undefined;
      }

      // Deduped, order kept: a meal plan may list the same recipe twice, and a
      // membership list with a duplicate in it would count that recipe twice
      // into a filter that only asks whether it is in the group at all.
      const recipes: string[] = [];
      const seen = new Set<string>();
      for (const item of group.items ?? []) {
        if (!item?.recipe || seen.has(item.recipe)) continue;
        seen.add(item.recipe);
        recipes.push(item.recipe);
      }

      return {
        slug,
        date: group.date,
        name: group.name,
        kind: group.kind,
        description: group.description,
        recipes,
      };
    }),
  );

  /*
   * Newest first, matching every other group surface (`/groups`, the homepage
   * strip). `readAllIds` walks the sorted keyspace ascending, and the key is
   * `[date, slug]`, so this is a reversal rather than a sort in disguise — but
   * it is written as a sort because the corpus is tiny and the order is a
   * promise the rail and the palette both rely on.
   */
  return entries
    .filter((entry): entry is GroupSearchEntry => entry !== undefined)
    .sort((a, b) => b.date - a.date);
}

export default getGroupSearchCorpus;
