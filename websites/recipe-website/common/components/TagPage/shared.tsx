import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import Markdown from "@discontent/component-library/components/Markdown";
import type {
  TagBoard,
  TagVocabularyEntry,
  TermCrumb,
  TermHierarchyNode,
  TermPageData,
} from "../../controller/tagVocabulary";
import type { RecipeListEntry } from "../../controller/paginationConfigs";
import { tagSlug } from "../../controller/tagSlug";
import { EmptyState } from "../EmptyState";
import { quoteQueryValue } from "../SearchForm/queryLanguage";
import { GroupThumbnail } from "../GroupThumbnail";
import RecipeList from "../List";
import GroupList from "../List/Group";
import { TermImage } from "../TermImage";
import { BLOCK_ROW_LIMIT, blockRows, type BlockRow } from "./blockRows";
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
  /** A chip prints its count when it has one; the breadcrumb's have none. */
  terms: Array<TermCrumb & { count?: number }>;
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
              {term.count !== undefined && (
                <span className="ml-1.5 font-mono text-[0.7em] opacity-70">
                  {term.count}
                </span>
              )}
            </Link>
          </Badge>
        </span>
      ))}
    </div>
  );
}

/**
 * This term as an encoded `tag:` query — for `/make` scoped to it (25c) and
 * for `/search`'s full list past the page's cap (34a).
 *
 * The `tag:` value is a carrier's own tag string, not the slug or the label:
 * `tag:` matches tag strings by word prefix, so the slug `slow-cooker` misses
 * "slow cooker" and a record's label "Drinks" misses `drink`. The slug is the
 * fallback, and right whenever the two coincide.
 */
function tagQuery(slug: string, recipes: RecipeListEntry[]): string {
  const tag =
    recipes
      .flatMap((recipe) => recipe.tags ?? [])
      .find((candidate) => tagSlug(candidate) === slug) ?? slug;
  return encodeURIComponent(`tag:${quoteQueryValue(tag)}`);
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
    recipeCount,
    ownRecipeCount,
    groups,
  } = term;
  /* The trail's last element is this term; the chips above it are the trail. */
  const ancestors = breadcrumb.slice(0, -1);
  /*
   * The list holds the narrower terms' recipes too (34a, D1). Say so only when
   * that changes the number, so a leaf's page reads exactly as it did.
   */
  const includesNarrower = recipeCount > ownRecipeCount;
  const query = tagQuery(slug, recipes);

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
      {includesNarrower && (
        <p
          className="my-3 text-sm text-muted-foreground"
          data-testid="term-recipe-counts"
        >
          {ownRecipeCount} here · {recipeCount} including narrower terms
        </p>
      )}
      {recipes.length > 0 && (
        <p className="my-3 text-sm">
          <Link
            href={`/make?q=${query}`}
            className="underline underline-offset-4 hover:text-primary"
            data-testid="term-make-link"
          >
            What can I make with these?
          </Link>
        </p>
      )}
      {recipes.length > 0 ? (
        /*
         * Already in the order the page wants: `resolveTermPage` ran the
         * record's `pinned` list over the fold's rows, so the curated front and
         * the remainder arrive as one list and this component sorts nothing.
         */
        <>
          <RecipeList recipes={recipes} />
          {/*
            Capped (34a): pinned first, then the newest. The rest are one
            click away on `/search`, which both apps serve from the client
            corpus and whose `tag:` expands the subtree exactly as this list
            does.
          */}
          {recipeCount > recipes.length && (
            <p className="my-4 text-sm">
              <Link
                href={`/search?q=${query}`}
                className="underline underline-offset-4 hover:text-primary"
                data-testid="term-see-all"
              >
                See all {recipeCount} recipes
              </Link>
            </p>
          )}
        </>
      ) : (
        /*
         * The recipes-only fallback. It can now fire with *everything* empty —
         * a record-only term has no carriers at all and is still a real page —
         * where before this phase `tagRoute` 404'd that case. `recipes` spans
         * the subtree (34a), so a root whose recipes all carry a narrower term
         * lists them rather than landing here.
         */
        <EmptyState message={`No recipes are tagged ${label}.`} />
      )}
      {groups.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-xl font-bold">Plans</h2>
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
 * One tag's page: everything carrying it or a narrower term (34a), newest
 * first, recipes then groups —
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

/**
 * A term's other names on `/tags` (38a, D2): "also: Cocktail, Cocktails" —
 * the record's aliases as stored, which `tag:` and `/tags/<alias>` resolve to
 * the term and whose carriers its count includes. Nothing without aliases.
 */
function AliasLine({ aliases }: { aliases?: string[] }) {
  if (!aliases?.length) return null;
  return (
    <span data-testid="tag-aliases" className="text-xs text-muted-foreground">
      also: {aliases.join(", ")}
    </span>
  );
}

/**
 * One row of a `/tags` block (U4): the term's label and count, and a thin bar
 * whose width is the count over the block's largest. The bar is decoration
 * (`aria-hidden`); the count is the text. A narrower term is indented by its
 * depth under the row it belongs to, on the same scale.
 */
function TermRow({
  node,
  depth,
  max,
}: {
  node: TermHierarchyNode;
  depth: number;
  max: number;
}) {
  const width =
    max > 0 && node.total > 0 ? Math.max(2, (node.total / max) * 100) : 0;
  return (
    <li style={depth > 0 ? { paddingLeft: `${depth}rem` } : undefined}>
      <Link
        href={`/tags/${node.slug}`}
        data-testid="tag-row"
        className="group flex flex-col gap-1 border-b border-border py-1.5 underline-offset-2"
      >
        <span className="flex items-baseline justify-between gap-3 text-sm">
          <span className="group-hover:underline">{node.label}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {node.total}
          </span>
        </span>
        <AliasLine aliases={node.aliases} />
        <span
          aria-hidden
          data-testid="tag-bar"
          className="block h-[3px] rounded-full bg-primary/45"
          style={{ width: `${width}%` }}
        />
      </Link>
    </li>
  );
}

/**
 * One block of the `/tags` board (U4): a heading — the root's link, or plain
 * "More tags" — with its total, then up to `BLOCK_ROW_LIMIT` rows, biggest
 * first, top-level rows before nested ones (`blockRows`); past that, "See
 * all of <root> →" to the root's term page (or, for "More tags", which has
 * no page, a fold with the rest). The bars scale to the block's largest
 * row. Kept whole within a column (`break-inside: avoid`).
 */
function TagBlock({
  slug,
  title,
  total,
  rows,
  aliases,
}: {
  /** The root's slug; absent for "More tags", which has no page. */
  slug?: string;
  title: string;
  total: string;
  rows: TermHierarchyNode[];
  /** The root's own aliases (38a). */
  aliases?: string[];
}) {
  const { shown, rest, all } = blockRows(rows, BLOCK_ROW_LIMIT);
  const max = all.reduce((most, { node }) => Math.max(most, node.total), 0);
  const heading = (
    <>
      <span>{title}</span>
      <span className="font-mono text-xs font-normal text-muted-foreground">
        {total}
      </span>
    </>
  );
  const headingClass =
    "mb-1 flex items-baseline justify-between gap-3 border-b-2 border-foreground pb-2 font-display text-lg font-bold";
  const list = (entries: BlockRow[]) => (
    <ul>
      {entries.map(({ node, depth }) => (
        <TermRow key={node.slug} node={node} depth={depth} max={max} />
      ))}
    </ul>
  );
  return (
    <section
      className="mb-8 break-inside-avoid"
      data-testid="tag-block"
      data-slug={slug}
    >
      <h3>
        {slug ? (
          <Link
            href={`/tags/${slug}`}
            className={`${headingClass} underline-offset-4 hover:underline`}
          >
            {heading}
          </Link>
        ) : (
          <span className={headingClass}>{heading}</span>
        )}
      </h3>
      {aliases?.length ? (
        <p className="mb-1">
          <AliasLine aliases={aliases} />
        </p>
      ) : null}
      {list(shown)}
      {rest.length > 0 &&
        (slug ? (
          <Link
            href={`/tags/${slug}`}
            data-testid="tag-block-all"
            className="mt-2 inline-block text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            See all of {title} <span aria-hidden>→</span>
          </Link>
        ) : (
          <details className="mt-2" data-testid="tag-block-rest">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              {rest.length} more
            </summary>
            {list(rest)}
          </details>
        ))}
    </section>
  );
}

const EMPTY_BOARD: TagBoard = {
  roots: [],
  loose: [],
  recorded: [],
  aliased: [],
};

/**
 * `/tags` (U4): a board of count bars — one block per facet root, then the
 * records outside any hierarchy as "More tags" — and below it the bare tags
 * (no record) as chips, as the page always showed them. With no records at
 * all there is no board, and the chips are every tag.
 */
export function TagIndexPage({
  tags,
  board = EMPTY_BOARD,
  actions,
}: {
  tags: TagVocabularyEntry[];
  /** The hierarchy and the loose records (31b, U4); empty without records. */
  board?: TagBoard;
  /** Editor-only affordances (31e: "New term"); the export passes none. */
  actions?: ReactNode;
}) {
  const hasBoard = board.roots.length > 0 || board.loose.length > 0;
  /* A record's slug, or an alias of one (its carriers count under the
   * term — 38a review), is no bare tag. */
  const notBare = new Set([...board.recorded, ...board.aliased]);
  const bare = tags.filter((tag) => !notBare.has(tag.slug));
  return (
    <PageMain>
      <PageSection grow maxWidth="none" className="max-w-7xl mx-auto">
        <PageHeading>Tags</PageHeading>
        {actions && (
          <div className="mb-6 flex flex-row flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
        {hasBoard && (
          <nav aria-labelledby="tags-by-kind" className="mb-8">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2
                id="tags-by-kind"
                className="font-display text-xl font-semibold"
              >
                By kind
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                bar = how many carry the tag
              </span>
            </div>
            <div className="columns-[15rem] gap-x-10" data-testid="tag-board">
              {board.roots.map((root) => (
                <TagBlock
                  key={root.slug}
                  slug={root.slug}
                  title={root.label}
                  total={`${root.total} in all`}
                  rows={root.children}
                  aliases={root.aliases}
                />
              ))}
              {board.loose.length > 0 && (
                <TagBlock
                  title="More tags"
                  total={`${board.loose.length} ${board.loose.length === 1 ? "tag" : "tags"}`}
                  rows={board.loose}
                />
              )}
            </div>
          </nav>
        )}
        {bare.length > 0 ? (
          <>
            {hasBoard && (
              <h2 className="mb-2 font-display text-xl font-semibold">
                Other tags
              </h2>
            )}
            <div
              className="flex flex-row flex-wrap items-center gap-2"
              data-testid="tag-index"
            >
              {bare.map((tag) => (
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
          </>
        ) : (
          !hasBoard && <EmptyState message="No recipes have tags yet." />
        )}
      </PageSection>
    </PageMain>
  );
}
