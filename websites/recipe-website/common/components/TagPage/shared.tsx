import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import Markdown from "@discontent/component-library/components/Markdown";
import type {
  TagVocabularyEntry,
  TermPageData,
} from "../../controller/tagVocabulary";
import { EmptyState } from "../EmptyState";
import { GroupThumbnail } from "../GroupThumbnail";
import RecipeList from "../List";
import GroupList from "../List/Group";
import { TermImage } from "../TermImage";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";

/**
 * A row of term chips with their counts — `/tags`' markup, reused for the
 * breadcrumb and the "Narrower" row so the three read as one vocabulary rather
 * than three lists that happen to link to the same pages.
 */
function TermChips({
  terms,
  testId,
  separator,
}: {
  terms: TagVocabularyEntry[];
  testId?: string;
  /** Printed between chips — the breadcrumb's "›", and nothing elsewhere. */
  separator?: string;
}) {
  return (
    <div
      className="flex flex-row flex-wrap items-center gap-2"
      data-testid={testId}
    >
      {terms.map((term, index) => (
        <span key={term.slug} className="flex flex-row items-center gap-2">
          {separator && index > 0 && (
            <span aria-hidden className="text-muted-foreground">
              {separator}
            </span>
          )}
          <Badge asChild variant="secondary">
            <Link href={`/tags/${term.slug}`}>
              {term.label}
              <span className="ml-1.5 font-mono text-[0.7em] opacity-70">
                {term.count}
              </span>
            </Link>
          </Badge>
        </span>
      ))}
    </div>
  );
}

/**
 * One term, as both its own page and a feature's detail page render it (24c).
 *
 * Extracted from `TagPage` rather than duplicated into
 * `FeaturedRecipeDetailPage`, because a feature of a term is a *pin* of exactly
 * this: the reader arrived from a card and expects the term, not a summary of
 * it. The two callers differ only in the frame around this body.
 *
 * The record's parts — picture, description, breadcrumb, narrower terms — all
 * render conditionally, and a term with no record renders none of them. That is
 * the hybrid working as intended (D3): `/tags/<slug>` for a bare string is
 * byte-for-byte the page it was before this phase.
 */
export function TermPageBody({ term }: { term: TermPageData }) {
  const {
    label,
    description,
    image,
    slug,
    breadcrumb,
    children,
    recipes,
    groups,
  } = term;
  /* The trail's last element is this term; the chips above it are the trail. */
  const ancestors = breadcrumb.slice(0, -1);

  return (
    <>
      {ancestors.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2">
          <TermChips terms={ancestors} testId="term-breadcrumb" separator="›" />
        </nav>
      )}
      <PageHeading>{label}</PageHeading>
      {image && (
        <div
          data-testid="term-image"
          className="relative aspect-[4/3] max-w-xl overflow-hidden rounded-md"
        >
          <TermImage
            slug={slug}
            image={image}
            alt={`Photo of ${label}`}
            width={580}
            height={450}
            sizes="100vw"
            loading="eager"
            className="object-cover absolute w-full h-full inset-0 rounded-md"
          />
        </div>
      )}
      {description && (
        <div className="my-2" data-testid="term-description">
          <Markdown>{description}</Markdown>
        </div>
      )}
      {children.length > 0 && (
        <div className="my-3">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
            Narrower
          </h2>
          <TermChips terms={children} testId="term-children" />
        </div>
      )}
      {recipes.length > 0 ? (
        /*
         * Already in the order the page wants: `resolveTermPage` ran the
         * record's `pinned` list over the fold's rows, so the curated front and
         * the remainder arrive as one list and this component sorts nothing.
         */
        <RecipeList recipes={recipes} />
      ) : (
        /*
         * The recipes-only fallback. It can now fire with *everything* empty —
         * a record-only term has no carriers at all and is still a real page —
         * where before this phase `tagRoute` 404'd that case.
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
    </>
  );
}

/**
 * One tag's page: everything carrying it, newest first, recipes then groups —
 * under the term record's own label, description and picture when it has one.
 *
 * Unpaginated on purpose. The rows come from folded values rather than a
 * partitioned keyspace, so there are no pages to number — see
 * `recipeTagTaxonomy.project` for the size lever and F8b for what replaces this
 * when a tag outgrows one record.
 *
 * Two lists rather than one merged one (24b): a recipe card and a group card
 * are different cards, and interleaving them by date would bury the two or
 * three groups a term has among a hundred recipes. The route hands the resolved
 * term in and this decides nothing else.
 */
export function TagPage({
  term,
  actions,
}: {
  term: TermPageData;
  /** Editor-only affordances; the export passes none. */
  actions?: ReactNode;
}) {
  return (
    <PageMain>
      <PageSection grow>
        <TermPageBody term={term} />
        {actions && (
          <div className="mt-6 flex flex-row flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </PageSection>
    </PageMain>
  );
}

/** The full tag list — every tag, with how many things carry it. */
export function TagIndexPage({ tags }: { tags: TagVocabularyEntry[] }) {
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
