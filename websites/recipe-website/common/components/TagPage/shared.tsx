import Link from "next/link";
import { Badge } from "@discontent/component-library/components/ui/badge";
import type { GroupListEntry } from "../../controller/groupPaginationConfig";
import type { RecipeListEntry } from "../../controller/paginationConfigs";
import { EmptyState } from "../EmptyState";
import { GroupThumbnail } from "../GroupThumbnail";
import RecipeList from "../List";
import GroupList from "../List/Group";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";

/**
 * One tag's page: everything carrying it, newest first, recipes then groups.
 *
 * Unpaginated on purpose. The rows come from folded values rather than a
 * partitioned keyspace, so there are no pages to number — see
 * `recipeTagTaxonomy.project` for the size lever and F8b for what replaces this
 * when a tag outgrows one record.
 *
 * Two lists rather than one merged one (24b): a recipe card and a group card
 * are different cards, and interleaving them by date would bury the two or
 * three groups a term has among a hundred recipes. The route hands both in and
 * decides nothing else.
 */
export function TagPage({
  label,
  recipes,
  groups,
}: {
  label: string;
  recipes: RecipeListEntry[];
  groups: GroupListEntry[];
}) {
  return (
    <PageMain>
      <PageSection grow>
        <PageHeading>{label}</PageHeading>
        {recipes.length > 0 ? (
          <RecipeList recipes={recipes} />
        ) : (
          /*
           * The recipes-only fallback. It cannot fire with both lists empty —
           * `tagRoute` 404s a slug neither carrier has — so this is what a
           * group-only tag reads above its groups.
           */
          <EmptyState message={`No recipes are tagged ${label}.`} />
        )}
        {groups.length > 0 && (
          <>
            <h2 className="mt-6 mb-2 text-xl font-bold">Groups</h2>
            {/*
              The same card `/groups` renders, from the same projection: the
              taxonomy's `project` *is* `groupsByDate`'s, so a by-term row is a
              `GroupListEntry` and the thumbnail walk works unchanged.
            */}
            <GroupList
              groups={groups}
              renderThumbnail={(group) => (
                <GroupThumbnail
                  slug={group.slug}
                  name={group.name}
                  image={group.image}
                />
              )}
            />
          </>
        )}
      </PageSection>
    </PageMain>
  );
}

/** The full tag list — every tag, with how many things carry it. */
export function TagIndexPage({
  tags,
}: {
  tags: Array<{ slug: string; label: string; count: number }>;
}) {
  return (
    <PageMain>
      <PageSection grow>
        <PageHeading>Tags</PageHeading>
        {tags.length > 0 ? (
          <div
            className="flex flex-row flex-wrap items-center gap-2"
            data-testid="tag-index"
          >
            {tags.map((tag) => (
              <Badge key={tag.slug} asChild variant="secondary">
                <Link href={`/tags/${tag.slug}`}>
                  {tag.label}
                  <span className="ml-1.5 font-mono text-[0.7em] opacity-70">
                    {tag.count}
                  </span>
                </Link>
              </Badge>
            ))}
          </div>
        ) : (
          <EmptyState message="No recipes have tags yet." />
        )}
      </PageSection>
    </PageMain>
  );
}
