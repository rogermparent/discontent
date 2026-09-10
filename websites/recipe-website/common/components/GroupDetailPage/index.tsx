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

/** One row's item, paired with the recipe it names — or `null` if it dangles. */
export interface ResolvedGroupItem {
  item: GroupItem;
  recipe: Recipe | null;
}

export interface GroupDetailPageProps {
  group: Group;
  /**
   * The group's own slug. Not read here — the page renders no self-link — but
   * both routes have it and both apps' `generateMetadata` want the same record,
   * so it stays on the props rather than being reconstructed by a caller that
   * later needs it.
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
        </div>
        {description && (
          <div className="my-2">
            <Markdown>{description}</Markdown>
          </div>
        )}
        {items.length > 0 ? (
          <ol className="my-4 flex flex-col flex-nowrap gap-3">
            {items.map(({ item, recipe }, index) => (
              <li
                /*
                 * By position, not by slug: a meal plan may legitimately list
                 * the same recipe twice, so the slug is not a key.
                 */
                key={`${index}-${item.recipe}`}
                data-testid="group-item"
                className="rounded-lg border border-border bg-card p-3 text-card-foreground"
              >
                {item.label && (
                  <p
                    className="font-mono text-xs uppercase tracking-wide text-muted-foreground"
                    data-testid="group-item-label"
                  >
                    {item.label}
                  </p>
                )}
                {recipe ? (
                  <Link
                    href={`/recipe/${item.recipe}`}
                    className="font-display font-semibold text-primary hover:underline"
                  >
                    {recipe.name}
                  </Link>
                ) : (
                  <p
                    className="text-muted-foreground"
                    data-testid="group-item-missing"
                  >
                    Recipe not found: {item.recipe}
                  </p>
                )}
                {item.note && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.note}
                  </p>
                )}
              </li>
            ))}
          </ol>
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
