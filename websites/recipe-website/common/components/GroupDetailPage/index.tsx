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
import type { Group } from "../../controller/types";
import type { ResolvedGroupItem } from "../../controller/data/resolveGroupItems";
import { groupKindLabel } from "../../util/groupKindLabel";
import { GroupImage } from "../GroupImage";
import { groupCountLabel } from "../../util/groupCountLabel";
import { groupSearchHref, tagSearchHref } from "../SearchForm/queryLanguage";
import { GroupAppearsIn } from "./GroupAppearsIn";
import { GroupItems } from "./GroupItems";

/*
 * Re-exported, not redeclared: `resolveGroupItems` is what produces these, and
 * it moved to the controller in 22g so the featured-recipe routes could share
 * it. Every existing importer goes on naming it here.
 */
export type { ResolvedGroupItem } from "../../controller/data/resolveGroupItems";

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
  const { name, kind, description, image, tags } = group;
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>{name}</PageHeading>
        <div className="mb-4 flex flex-row flex-wrap items-center gap-2">
          <Badge variant="secondary" data-testid="group-kind">
            {groupKindLabel(kind)}
          </Badge>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {groupCountLabel(
              items.filter(({ item }) => !item.group).length,
              items.filter(({ item }) => Boolean(item.group)).length,
            )}
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
        {/*
          The group's terms (24b), rendered exactly as a recipe's are — same
          badge, same `tagSearchHref`, so a chip on a group and a chip on a
          recipe land on the same page of the same vocabulary.
        */}
        {tags && tags.length > 0 && (
          <div
            className="mb-4 flex flex-row flex-wrap items-center gap-1.5 print:hidden"
            aria-label="Tags"
          >
            {tags.map((tag) => (
              <Badge key={tag} asChild variant="secondary">
                <Link href={tagSearchHref(tag)}>{tag}</Link>
              </Badge>
            ))}
          </div>
        )}
        {/*
          The group's own picture (22h), between the meta row and the prose —
          the same place a recipe's heading image sits relative to its
          description, with the same crop props `View` uses. A group with no
          image of its own renders nothing here: the member fallback is a
          *card* affordance, and standing in a member's photo at this size
          would read as a picture of the group.
        */}
        {image && (
          <div
            data-testid="group-image"
            className="relative aspect-[4/3] max-w-xl overflow-hidden rounded-md"
          >
            <GroupImage
              slug={slug}
              image={image}
              alt={`Photo of ${name}`}
              width={580}
              height={450}
              sizes="100vw"
              loading="eager"
              className="object-cover absolute w-full h-full inset-0 rounded-md"
            />
          </div>
        )}
        {description && (
          <div className="my-2">
            <Markdown>{description}</Markdown>
          </div>
        )}
        {items.length > 0 ? (
          <GroupItems items={items} />
        ) : (
          <p className="my-4 text-muted-foreground" data-testid="group-empty">
            This group has nothing in it yet.
          </p>
        )}
        {/*
          A group's own "Appears in" (23c): the parents that list it, rendered
          below its members for the same reason the recipe page puts the block
          under the recipe — it is context, not content.
        */}
        <GroupAppearsIn slug={slug} />
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
