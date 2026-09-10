import type { AggregateConfig } from "@discontent/cms/aggregates/types";
import type { GroupEntryKey, GroupEntryValue, GroupKind } from "./types";

/** One line of a recipe's "Appears in" block. */
export interface AppearsInEntry {
  /** The group's slug — the link target, `/group/<slug>`. */
  slug: string;
  name: string;
  kind: GroupKind;
  /** The label the group gave *this* recipe ("Mon · Dinner"), if any. */
  label?: string;
}

/** The accumulator's rows, which carry the sort key `finalize` then drops. */
interface DatedAppearsInEntry extends AppearsInEntry {
  date: number;
}

/**
 * Every recipe mapped to the groups that list it — what the recipe view's
 * "Appears in" block renders (D4).
 *
 * The inverse of the edge the engine cannot follow. Groups declare no
 * `references` because the reference machinery is scalar-only and a group's
 * recipes live in an array (D3/F32), so nothing rebuilds a group when a recipe
 * moves — but nothing has to: this is folded from the *group* index, and it is
 * a group write that changes what it says. A recipe write leaves it identical,
 * which the aggregate layer reports as `changed: false` and fires no tag for.
 *
 * Shaped like `recipesByTag` in `aggregateConfigs.ts`, and it makes the same
 * trade: one aggregate holding every recipe's list is one cache entry, so a
 * write that changes any recipe's list invalidates every recipe view's block,
 * and the value grows as `groups × items-per-group`. At this corpus size that
 * is nothing; a partitioned pagination index (§11.1, F8b) is the precise
 * version when it stops being nothing.
 *
 * Its own module rather than a third export of `aggregateConfigs.ts`, for the
 * reason `groupPaginationConfig.ts` gives (T1).
 */
export const groupsByRecipe: AggregateConfig<
  GroupEntryValue,
  GroupEntryKey,
  Map<string, DatedAppearsInEntry[]>,
  Record<string, AppearsInEntry[]>
> = {
  name: "by-recipe",
  /* Pinned by hand, for the reason `groupsByDate.version` spells out. */
  version: "1",
  initial: () => new Map<string, DatedAppearsInEntry[]>(),
  fold: (byRecipe, { key: [date], value, id }) => {
    for (const item of value.items ?? []) {
      if (!item.recipe) continue;
      const list = byRecipe.get(item.recipe) ?? [];
      /*
       * One entry per *item*, not per group. A group that lists the same recipe
       * twice — a meal plan cooking it Monday and Thursday — genuinely appears
       * twice, with a different label each time, and collapsing them would lose
       * the second label.
       */
      list.push({
        slug: id,
        name: value.name,
        kind: value.kind,
        label: item.label,
        date,
      });
      byRecipe.set(item.recipe, list);
    }
    return byRecipe;
  },
  /*
   * The walk is ascending by `[date, slug]`, so each list arrives oldest first
   * and is reversed here — newest first, matching every other list surface.
   * Sorting the keys too keeps the hash stable: an object whose keys arrived in
   * a different order must not read as a change, and `stableStringify` sorts
   * keys but not the arrays inside them.
   *
   * `date` is dropped on the way out. It was the sort key and nothing renders
   * it, so carrying it would put a field in the hashed value that no reader
   * reads — the same rule the index values follow.
   */
  finalize: (byRecipe) =>
    Object.fromEntries(
      [...byRecipe.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([recipe, entries]) => [
          recipe,
          [...entries].reverse().map(({ slug, name, kind, label }) => ({
            slug,
            name,
            kind,
            label,
          })),
        ]),
    ),
};

export default groupsByRecipe;
