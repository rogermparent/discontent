import Link from "next/link";
import { ReactNode } from "react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { buttonVariants } from "@discontent/component-library/components/ui/button";
import Markdown from "@discontent/component-library/components/Markdown";
import {
  PageMain,
  PageSection,
  PageHeading,
  PageActions,
} from "recipe-website-common/components/PageLayout";
import type { Group, GroupItem, Recipe } from "../../controller/types";
import { groupKindLabel } from "../../util/groupKindLabel";
import { groupSearchHref } from "../SearchForm/queryLanguage";
import { GroupItems } from "./GroupItems";

/** One row's item, paired with the recipe it names — or `null` if it dangles. */
export interface ResolvedGroupItem {
  item: GroupItem;
  recipe: Recipe | null;
}

export interface GroupDetailPageProps {
  group: Group;
  /**
   * The group's own slug. Read since 22f, by the "Search within this group"
   * link — before that it was carried only because both routes had it and both
   * apps' `generateMetadata` wanted the same record.
   */
  slug: string;
  /**
   * Resolved in the *route*, not here: the editor and the export read recipes
   * through the same cached item read, but only a route may be async, and the
   * order has to be the group's rather than whatever the reads settle in.
   */
  items: ResolvedGroupItem[];
  actions?: ReactNode;
}

/**
 * One group: what it is, what is in it, in order.
 *
 * A dangling item renders as muted text rather than being skipped. Nothing
 * rewrites a group when a recipe is renamed or deleted (D3), so a dangle is an
 * ordinary state and hiding it would make a meal plan silently lose a day.
 */
export default function GroupDetailPage({
  group,
  slug,
  items,
  actions,
}: GroupDetailPageProps) {
  const { name, kind, description } = group;
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>{name}</PageHeading>
        <div className="mb-4 flex flex-row flex-wrap items-center gap-2">
          <Badge variant="secondary" data-testid="group-kind">
            {groupKindLabel(kind)}
          </Badge>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {items.length} {items.length === 1 ? "recipe" : "recipes"}
          </span>
          {/*
            The narrowing move, sitting where the group is (22f). A group page
            is a fixed list; this hands the same membership to `/search`, where
            it composes with everything else the query language can say
            (`group:x tag:quick time:<30`) and stays visible as a chip.
          */}
          {items.length > 0 && (
            <Link
              href={groupSearchHref(slug)}
              data-testid="group-search-link"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Search within this group
            </Link>
          )}
        </div>
        {description && (
          <div className="my-2">
            <Markdown>{description}</Markdown>
          </div>
        )}
        {items.length > 0 ? (
          <GroupItems items={items} />
        ) : (
          <p className="my-4 text-muted-foreground" data-testid="group-empty">
            This group has no recipes in it yet.
          </p>
        )}
      </PageSection>
      <PageActions>
        {actions}
        <Link
          href="/groups"
          className={buttonVariants({ variant: "default", size: "sm" })}
        >
          Back to Groups
        </Link>
      </PageActions>
    </PageMain>
  );
}
