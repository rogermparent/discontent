import type { AggregateConfig } from "@discontent/cms/aggregates/types";
import type {
  GroupEntryItem,
  GroupEntryKey,
  GroupEntryValue,
  GroupKind,
} from "./types";

/** One line of an "Appears in" block — on a recipe page, or on a group's. */
export interface AppearsInEntry {
  /** The group's slug — the link target, `/group/<slug>`. */
  slug: string;
  name: string;
  kind: GroupKind;
  /** The label the group gave *this* member ("Mon · Dinner"), if any. */
  label?: string;
}

/** The accumulator's rows, which carry the sort key `finalize` then drops. */
interface DatedAppearsInEntry extends AppearsInEntry {
  date: number;
}

type AppearsInAggregate = AggregateConfig<
  GroupEntryValue,
  GroupEntryKey,
  Map<string, DatedAppearsInEntry[]>,
  Record<string, AppearsInEntry[]>
>;

/**
 * The inverse of the edge the engine cannot follow: every member mapped to the
 * groups that list it.
 *
 * Groups declare no `references` because the reference machinery is scalar-only
 * and a group's members live in an array (D3/F32), so nothing rebuilds a group
 * when a member moves — but nothing has to: this is folded from the *group*
 * index, and it is a group write that changes what it says. A recipe write
 * leaves it identical, which the aggregate layer reports as `changed: false`
 * and fires no tag for.
 *
 * A factory since 23c, because the fold is the same twice over: `by-recipe`
 * keys on `item.recipe` and `by-group` on `item.group`, and a copy of the
 * fifty lines below with one accessor changed would be a place for the two to
 * drift. `keyOf` returning `undefined` skips the item, which is what keeps each
 * aggregate blind to the other's rows — and is why `by-recipe`'s *output* is
 * unchanged by sub-groups existing and its version stays `"1"` (D16).
 *
 * Shaped like `recipesByTag` in `aggregateConfigs.ts`, and it makes the same
 * trade: one aggregate holding every member's list is one cache entry, so a
 * write that changes any member's list invalidates every block, and the value
 * grows as `groups × items-per-group`. At this corpus size that is nothing; a
 * partitioned pagination index (§11.1, F8b) is the precise version when it
 * stops being nothing.
 *
 * Its own module rather than a third export of `aggregateConfigs.ts`, for the
 * reason `groupPaginationConfig.ts` gives (T1).
 */
function appearsInAggregate({
  name,
  version,
  keyOf,
}: {
  name: string;
  version: string;
  keyOf: (item: GroupEntryItem) => string | undefined;
}): AppearsInAggregate {
  return {
    name,
    /* Pinned by hand, for the reason `groupsByDate.version` spells out. */
    version,
    initial: () => new Map<string, DatedAppearsInEntry[]>(),
    fold: (byMember, { key: [date], value, id }) => {
      for (const item of value.items ?? []) {
        const member = keyOf(item);
        if (!member) continue;
        const list = byMember.get(member) ?? [];
        /*
         * One entry per *item*, not per group. A group that lists the same
         * member twice — a meal plan cooking it Monday and Thursday — genuinely
         * appears twice, with a different label each time, and collapsing them
         * would lose the second label.
         */
        list.push({
          slug: id,
          name: value.name,
          kind: value.kind,
          label: item.label,
          date,
        });
        byMember.set(member, list);
      }
      return byMember;
    },
    /*
     * The walk is ascending by `[date, slug]`, so each list arrives oldest first
     * and is reversed here — newest first, matching every other list surface.
     * Sorting the keys too keeps the hash stable: an object whose keys arrived
     * in a different order must not read as a change, and `stableStringify`
     * sorts keys but not the arrays inside them.
     *
     * `date` is dropped on the way out. It was the sort key and nothing renders
     * it, so carrying it would put a field in the hashed value that no reader
     * reads — the same rule the index values follow.
     */
    finalize: (byMember) =>
      Object.fromEntries(
        [...byMember.entries()]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([member, entries]) => [
            member,
            [...entries].reverse().map(({ slug, name, kind, label }) => ({
              slug,
              name,
              kind,
              label,
            })),
          ]),
      ),
  };
}

/**
 * Every recipe mapped to the groups that list it — what the recipe view's
 * "Appears in" block renders (D4).
 *
 * Still `"1"` after 23c: the fold skips an item with no `recipe`, so a corpus
 * that has gained sub-groups folds to exactly the bytes it folded before, and
 * bumping the version would rebuild every stored value to produce the same one
 * (D16, amending D6).
 */
export const groupsByRecipe = appearsInAggregate({
  name: "by-recipe",
  /*
   * Named arguments rather than positional ones so the version is declared as a
   * labelled literal in the source — which is the shape
   * `test/specVersions.test.ts` greps for, and a version that test could not see
   * would be a version nobody is ever asked about (T1).
   */
  version: "1",
  keyOf: (item) => item.recipe,
});

/**
 * Every group mapped to the groups that list it — the same block on a *group's*
 * page (23c/D16).
 *
 * Direct parents only, deliberately: a transitive list would say "Spring Menus"
 * on a recipe three levels down, where the reader has no row to click that
 * explains the hop. The nesting is visible by walking the pages.
 *
 * Keyed on the sub-group's slug, so it dangles exactly as `by-recipe` does: a
 * renamed or deleted child keeps its old key here until every parent is
 * re-saved (T31/T32).
 */
export const groupsByGroup = appearsInAggregate({
  name: "by-group",
  version: "1",
  keyOf: (item) => item.group,
});

export default groupsByRecipe;
