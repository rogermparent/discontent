import Link from "next/link";
import { Badge } from "@discontent/component-library/components/ui/badge";
import type { TagIndexEntry } from "../../controller/aggregateConfigs";
import { EmptyState } from "../EmptyState";
import RecipeList from "../List";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";

/**
 * One tag's page: every recipe carrying it, newest first.
 *
 * Unpaginated on purpose. The rows come from a single folded value rather than
 * a partitioned keyspace, so there are no pages to number — see `recipesByTag`
 * for the trade and for what replaces it when a tag outgrows one page.
 */
export function TagPage({ tag }: { tag: TagIndexEntry }) {
  return (
    <PageMain>
      <PageSection grow>
        <PageHeading>{tag.label}</PageHeading>
        {tag.recipes.length > 0 ? (
          <RecipeList recipes={tag.recipes} />
        ) : (
          <EmptyState message={`No recipes are tagged ${tag.label}.`} />
        )}
      </PageSection>
    </PageMain>
  );
}

/** The full tag list — every tag, with how many recipes carry it. */
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
