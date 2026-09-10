import Link from "next/link";
import { RecipeView } from "recipe-website-common/components/View";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { buttonVariants } from "@discontent/component-library/components/ui/button";
import Markdown from "@discontent/component-library/components/Markdown";
import type { Group, Recipe } from "recipe-website-common/controller/types";
import type { ResolvedGroupItem } from "recipe-website-common/controller/data/resolveGroupItems";
import { ReactNode } from "react";
import {
  PageMain,
  PageSection,
  PageActions,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { GroupItems } from "../GroupDetailPage/GroupItems";
import { GroupThumbnail } from "../GroupThumbnail";
import { groupKindLabel } from "../../util/groupKindLabel";

/**
 * What a feature points at, as this page renders it (22g).
 *
 * A discriminated union rather than two optional halves: the two variants share
 * only the note and the actions, and an "either both or neither" shape would
 * make every read of it a pair of non-null assertions.
 */
export type FeaturedRecipeDetailPageProps = {
  note?: string;
  actions?: ReactNode;
} & (
  | { kind: "recipe"; recipe: Recipe; recipeSlug: string }
  | {
      kind: "group";
      group: Group;
      groupSlug: string;
      /** Resolved in the *route*, because only a route may be async. */
      items: ResolvedGroupItem[];
    }
);

/**
 * The note, which both variants render identically above everything else.
 */
function FeatureNote({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <PageSection maxWidth="xl" className="py-4">
      <div className="prose prose-invert max-w-none">
        <Markdown>{note}</Markdown>
      </div>
    </PageSection>
  );
}

/**
 * One feature's own page: the whole recipe, or the whole group.
 *
 * The group variant is not a second copy of `/group/<slug>`. It leads with the
 * group's picture and kind — the feature is a *pin*, and the reader arrived
 * from a card — then shows the members as the same cards the group page uses,
 * and offers "Open group" for everything this page deliberately leaves out
 * (the description, the "Search within this group" link, the edit actions).
 */
export default function FeaturedRecipeDetailPage(
  props: FeaturedRecipeDetailPageProps,
) {
  const { note, actions } = props;

  if (props.kind === "group") {
    const { group, groupSlug, items } = props;
    return (
      <PageMain>
        <FeatureNote note={note} />
        <PageSection maxWidth="4xl" grow>
          <div className="my-2 flex flex-row flex-nowrap items-center gap-4">
            <GroupThumbnail
              slug={groupSlug}
              name={group.name}
              items={group.items}
              className="size-24 shrink-0 overflow-hidden rounded-lg"
            />
            <div className="flex flex-col flex-nowrap gap-2">
              <PageHeading className="my-0">{group.name}</PageHeading>
              <div className="flex flex-row flex-wrap items-center gap-2">
                <Badge variant="secondary" data-testid="group-kind">
                  {groupKindLabel(group.kind)}
                </Badge>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {items.length} {items.length === 1 ? "recipe" : "recipes"}
                </span>
              </div>
            </div>
          </div>
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
            href={`/group/${groupSlug}`}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            Open group
          </Link>
          <Link
            href="/featured-recipes"
            className={buttonVariants({ variant: "default", size: "sm" })}
          >
            Back to Featured Recipes
          </Link>
        </PageActions>
      </PageMain>
    );
  }

  const { recipe, recipeSlug } = props;
  return (
    <PageMain>
      <FeatureNote note={note} />
      <PageSection maxWidth="none" className="py-0" grow>
        <RecipeView recipe={recipe} slug={recipeSlug} />
      </PageSection>
      <PageActions>
        {actions}
        <Link
          href="/featured-recipes"
          className={buttonVariants({ variant: "default", size: "sm" })}
        >
          Back to Featured Recipes
        </Link>
      </PageActions>
    </PageMain>
  );
}
