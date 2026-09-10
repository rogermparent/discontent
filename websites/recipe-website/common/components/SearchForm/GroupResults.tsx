"use client";

import GroupList from "../List/Group";
import { useSearch } from "./SearchContext";

/**
 * The groups a search matched, as a strip above the recipe grid (22f).
 *
 * Above the recipes rather than mixed into them: a group is a different kind of
 * answer — one card stands for a dozen recipes — and interleaving the two would
 * make the result count under the field a lie. `SearchTicker` goes on counting
 * recipes only, for the same reason.
 *
 * Matching is on the query's **free text**, never its filters (see
 * `matchedGroups`), so `tag:dessert` shows no groups at all and a plain
 * `weeknight` shows the collection even when it matches no recipe.
 */
export function GroupResults() {
  const { matchedGroups, parsedQuery, query, recordSearch } = useSearch();

  if (matchedGroups.length === 0) return null;

  return (
    <section
      className="my-4 flex flex-col gap-2"
      aria-label="Matching groups"
      data-testid="group-results"
    >
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        Groups
      </span>
      <GroupList
        groups={matchedGroups.map((group) => ({
          slug: group.slug,
          date: group.date,
          name: group.name,
          kind: group.kind,
          // The *deduped* membership count, where `/groups` prints the raw
          // item count. They differ only for a plan that lists one recipe
          // twice, and this is the number the `group:` filter would return.
          itemCount: group.recipes.length,
        }))}
        // The free text, never the raw query — the same rule the recipe cards
        // follow, so `group:x` cannot go on to <mark> the word "x".
        highlightQuery={parsedQuery.text}
        // Opening a result is a commit, exactly as it is for a recipe card.
        onSelect={() => recordSearch(query)}
      />
    </section>
  );
}

export default GroupResults;
