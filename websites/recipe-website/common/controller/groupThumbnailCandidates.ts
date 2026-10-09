import type { GroupItem } from "./types";

/**
 * How far into a group the walk looks for a photo.
 *
 * Six, not all of them: a meal plan may list dozens of recipes, and a card is
 * not worth a dozen reads. On the server the reads are cached and usually
 * already warm — the same recipes are on the page below — so the bound is about
 * the cold case, and six is the first row of the recipe grid either way.
 */
export const MEMBERS_WALKED = 6;

/**
 * How many levels of sub-group the walk descends through (23c/D18).
 *
 * Four, with `MEMBERS_WALKED` still capping the candidates: the two bounds
 * multiply, so the worst case is a fixed handful of reads however a curator has
 * nested things. The visited set is the other half — it is what makes a cycle
 * *on disk* (hand-edited, or written before the write-time check existed)
 * terminate rather than hang a render (T35).
 */
export const GROUPS_DEEP = 4;

/** What the walk found to draw: a member recipe, or a sub-group's own picture. */
export type ThumbnailCandidate =
  | { kind: "recipe"; slug: string }
  | { kind: "group"; slug: string; image: string };

/** The two fields of a group record the walk reads. */
export interface ThumbnailGroup {
  image?: string;
  items?: GroupItem[];
}

/**
 * The members worth reading a picture from, depth-first in the group's order
 * (23c/D18).
 *
 * Shared by the two places a group borrows a member's photo (30c): the server
 * `GroupThumbnail`, which reads groups through the cached item reads, and the
 * search corpus, which already holds every record in a map. One walk, so a
 * card on `/groups` and the same group on ⌘K or `/search` pick the same photo.
 *
 * Depth-first rather than level-by-level because the order *is* the answer: the
 * first row of a collection whose first entry is a meal plan should show that
 * meal plan's picture, not the collection's third recipe. A sub-group with its
 * own image is a candidate as it stands; one without is descended into, which
 * is what lets a collection of plans of recipes still find a photo.
 *
 * Recipes are deduped (a plan may cook one twice) and groups are visited once
 * (two plans may share a child, and a hand-written file may loop). `slug` is
 * the group being walked, seeded into the visited set so a plan that lists
 * itself stops at once.
 */
export async function collectThumbnailCandidates(
  slug: string,
  items: GroupItem[],
  readGroup: (
    slug: string,
  ) =>
    | ThumbnailGroup
    | null
    | undefined
    | Promise<ThumbnailGroup | null | undefined>,
): Promise<ThumbnailCandidate[]> {
  const candidates: ThumbnailCandidate[] = [];
  const seenRecipes = new Set<string>();
  const visitedGroups = new Set<string>([slug]);

  const walk = async (list: GroupItem[], depth: number): Promise<void> => {
    for (const item of list) {
      if (candidates.length >= MEMBERS_WALKED) return;

      if (item?.recipe) {
        if (seenRecipes.has(item.recipe)) continue;
        seenRecipes.add(item.recipe);
        candidates.push({ kind: "recipe", slug: item.recipe });
        continue;
      }

      if (!item?.group || visitedGroups.has(item.group)) continue;
      visitedGroups.add(item.group);
      if (depth >= GROUPS_DEEP) continue;

      const child = await readGroup(item.group);
      if (!child) continue;
      if (child.image) {
        candidates.push({
          kind: "group",
          slug: item.group,
          image: child.image,
        });
        continue;
      }
      await walk(child.items ?? [], depth + 1);
    }
  };

  await walk(items, 1);
  return candidates;
}
