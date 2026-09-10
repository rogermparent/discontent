"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { useSearch } from "./SearchContext";

/** How many group chips the rail shows before deferring to `/groups`. */
const RAIL_LIMIT = 12;

/**
 * A horizontal rail of group chips, shown on the *idle* search page beside the
 * tag rail (22f).
 *
 * Unlike `TagFilterRail` these chips do not write into the query: a group is a
 * destination with a page of its own, and a reader reaching for "the pie-iron
 * collection" wants to read it, not to filter recipes by it. (The narrowing
 * move exists too — it is the "Search within this group" link on that page,
 * which mints `group:<slug>`.)
 *
 * Renders nothing when the corpus has no groups, which is what keeps the
 * `three-recipes` search baselines still.
 */
export function GroupRail() {
  const { allGroups } = useSearch();

  if (allGroups.length === 0) return null;

  const shown = allGroups.slice(0, RAIL_LIMIT);
  const hasMore = allGroups.length > shown.length;

  return (
    <div
      className="my-2 flex flex-col gap-2"
      aria-label="Groups"
      data-testid="group-rail"
    >
      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        Groups
      </span>
      <div className="flex flex-row flex-wrap items-center gap-1.5">
        {shown.map((group) => (
          <Badge key={group.slug} asChild variant="outline">
            <Link
              href={`/group/${group.slug}`}
              className="hover:bg-accent hover:text-accent-foreground"
            >
              <Layers className="size-3 shrink-0" aria-hidden />
              {group.name}
              <span className="font-mono tabular-nums text-muted-foreground">
                {group.recipes.length}
              </span>
            </Link>
          </Badge>
        ))}
        {hasMore && (
          <Link
            href="/groups"
            className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            More →
          </Link>
        )}
      </div>
    </div>
  );
}

export default GroupRail;
