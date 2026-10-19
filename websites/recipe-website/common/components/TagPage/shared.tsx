import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChevronRight, Gift } from "lucide-react";
import { buttonVariants } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import Markdown from "@discontent/component-library/components/Markdown";
import type { TermPageData } from "../../controller/tagVocabulary";
import type { RecipeListEntry } from "../../controller/paginationConfigs";
import {
  TERM_NARROW_ROW_LIMIT,
  otherTags,
  pageTagSlugs,
  rootSections,
  type RootSection,
  type TagBoardData,
} from "../../controller/tagBoardPage";
import { tagSlug } from "../../controller/tagSlug";
import { buildFacetModel, type FacetTerm } from "../../util/facets";
import {
  HOLIDAYS_ROOT,
  dayKey,
  holidayRuleKey,
  localDay,
} from "../../util/holidays";
import { EmptyState } from "../EmptyState";
import { quoteQueryValue } from "../SearchForm/queryLanguage";
import { GroupThumbnail } from "../GroupThumbnail";
import RecipeList from "../List";
import { RecipeCardPlaceholder } from "../List/shared";
import { RecipeImage } from "../RecipeImage";
import { TermImage } from "../TermImage";
import { PageMain } from "recipe-website-common/components/PageLayout";
import { groupCountLabel } from "../../util/groupCountLabel";
import { groupKindLabel } from "../../util/groupKindLabel";
import { TagBoard } from "./Board";
import { HolidayWhen } from "./HolidayWhen";
import { Leader, plural } from "./parts";
import { RootViews } from "./RootViews";
import { TermRecipes } from "./TermRecipes";

/**
 * The tag pages as canvas B, "Narrow it down", draws them (epic 43, 43t):
 * `/tags` a facet board you can combine from, a term page that keeps
 * narrowing, and a root page (`/tags/course`) that shows its narrower terms
 * rather than the newest 48 recipes.
 */

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

/** The server's calendar day, for a first render the browser then corrects. */
const serverDay = () => dayKey(localDay(new Date()));

/** The column every tag page sits in: canvas B's 1152 px. */
const WRAP = "mx-auto flex w-full max-w-6xl flex-col px-4";

/**
 * "41 recipes · 1 plan · also filed as christmas-cookies" — the count a term
 * page never had (42j), aliases included.
 */
function countLine(term: TermPageData): string {
  const parts = [plural(term.recipeCount, "recipe")];
  if (term.groups.length > 0) parts.push(plural(term.groups.length, "plan"));
  if (term.aliases?.length) {
    parts.push(`also filed as ${term.aliases.join(", ")}`);
  }
  return parts.join(" · ");
}

/**
 * Tags › Holidays › — the trail above the heading. `Tags` leads it; the
 * term's ancestors (`term-breadcrumb`) follow, labels only (34a).
 */
function Crumbs({ term }: { term: TermPageData }) {
  const ancestors = term.breadcrumb.slice(0, -1);
  const link =
    "inline-flex min-h-6 items-center hover:text-primary focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground"
    >
      <Link href="/tags" className={link}>
        Tags
      </Link>
      <span aria-hidden>›</span>
      {ancestors.length > 0 && (
        <span
          className="flex flex-wrap items-center gap-1.5"
          data-testid="term-breadcrumb"
        >
          {ancestors.map((crumb) => (
            <span key={crumb.slug} className="flex items-center gap-1.5">
              <Link href={`/tags/${crumb.slug}`} className={link}>
                {crumb.label}
              </Link>
              <span aria-hidden>›</span>
            </span>
          ))}
        </span>
      )}
    </nav>
  );
}

/** The trail, the editor's actions top right (43t), the name and the count. */
function TermHeading({
  term,
  actions,
  ticker,
}: {
  term: TermPageData;
  actions?: ReactNode;
  ticker: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Crumbs term={term} />
        {actions && (
          <div
            role="group"
            aria-label="Editor actions"
            className="flex flex-wrap gap-0.5"
            data-testid="term-actions"
          >
            {actions}
          </div>
        )}
      </div>
      <h1 className="m-0 font-display text-[2rem] leading-10 font-bold tracking-[-0.025em] sm:text-[2.5rem] sm:leading-[44px]">
        {term.label}
      </h1>
      <p
        className="m-0 font-mono text-[0.6875rem] leading-4 tracking-[0.1em] text-muted-foreground uppercase"
        data-testid="term-count"
      >
        {ticker}
      </p>
      {term.description && (
        <div
          className="max-w-[680px] text-base leading-[26px]"
          data-testid="term-description"
        >
          <Markdown>{term.description}</Markdown>
        </div>
      )}
    </div>
  );
}

/** The term's own picture. */
function TermPicture({ term }: { term: TermPageData }) {
  if (!term.image) return null;
  return (
    <div
      data-testid="term-image"
      className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted"
    >
      <TermImage
        slug={term.slug}
        image={term.image}
        alt={`Photo of ${term.label}`}
        width={580}
        height={450}
        sizes="(max-width: 1024px) 100vw, 340px"
        loading="eager"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

/** "What can I make with these?" — `/make` scoped to the term (25c). */
function MakeLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: "outline" }),
        "min-h-11",
        className,
      )}
      data-testid="term-make-link"
    >
      <Gift aria-hidden />
      What can I make with these?
    </Link>
  );
}

/**
 * The plans filed under the term (24b) — the plan leads the page now (canvas
 * B), one card each: its picture, "Plan", the name, kind and size.
 */
function PlanCards({ term }: { term: TermPageData }) {
  if (term.groups.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 className="m-0 font-mono text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Plans
      </h2>
      <ul
        className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-1"
        data-testid="group-list"
      >
        {term.groups.map((group) => (
          <li key={group.slug}>
            <Link
              href={`/group/${group.slug}`}
              className="group flex min-h-20 items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/50"
            >
              <span className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                <GroupThumbnail slug={group.slug} image={group.image} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
                  {groupKindLabel(group.kind)}
                </span>
                <span className="font-display text-lg leading-6 font-semibold group-hover:text-primary">
                  {group.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {groupCountLabel(
                    group.itemCount - (group.groupCount ?? 0),
                    group.groupCount ?? 0,
                  )}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Signed in, with nothing pinned: where pins would go, and how. */
function PinSlot() {
  return (
    <div
      className="flex flex-col justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-input px-4 py-3.5 text-sm leading-5 text-muted-foreground"
      data-testid="term-pin-slot"
    >
      <span className="font-semibold text-foreground">Nothing pinned yet</span>
      <span>Pinned recipes lead this page. Pick them in Edit.</span>
    </div>
  );
}

/**
 * The term's narrower terms as links, beside the heading of a page that
 * narrows (a root page shows them as its sections instead).
 */
function NarrowerLinks({ term }: { term: TermPageData }) {
  if (term.children.length === 0) return null;
  return (
    <p
      className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground"
      data-testid="term-children"
    >
      <span>Narrower:</span>
      {term.children.map((child, index) => (
        <span key={child.slug}>
          {index > 0 && <span aria-hidden>· </span>}
          <Link
            href={`/tags/${child.slug}`}
            className="inline-flex min-h-6 items-center text-foreground hover:text-primary"
          >
            {child.label}
            <span className="ml-1 font-mono text-xs text-muted-foreground">
              {child.count}
            </span>
          </Link>
        </span>
      ))}
    </p>
  );
}

/**
 * The vocabulary as the browser's facet model wants it: no pictures (the
 * chips never draw one), parents and aliases kept.
 */
function lean(terms: FacetTerm[]): FacetTerm[] {
  return terms.map(({ image: _image, ...term }) => term);
}

/**
 * One term, as both its own page and a feature's detail page render it
 * (24c): the heading with the editor's actions top right and the count
 * ticker, a holiday's "when" card (or the picture and What can I make), the
 * plans and the pin slot, then the recipes with "Narrow X" over them. A
 * root term with narrower terms (`/tags/course`) is a root page instead
 * (`RootTermBody`).
 *
 * `terms` is the vocabulary (records), which the chips and the cards' tag
 * hints need; without it (a caller that has none) the page lists the
 * recipes and leaves the chips out.
 */
export function TermPageBody({
  term,
  terms,
  actions,
  signedIn = false,
}: {
  term: TermPageData;
  terms?: FacetTerm[];
  /** Editor-only affordances, top right; the export passes none. */
  actions?: ReactNode;
  /** Signed in: the pin slot shows. */
  signedIn?: boolean;
}) {
  const ancestors = term.breadcrumb.slice(0, -1);
  if (ancestors.length === 0 && term.children.length > 0) {
    return <RootTermBody term={term} terms={terms} actions={actions} />;
  }
  const { slug, label, recipes } = term;
  const query = tagQuery(slug, term.allRecipes);
  const makeHref = recipes.length > 0 ? `/make?q=${query}` : undefined;
  const isHoliday = ancestors[ancestors.length - 1]?.slug === HOLIDAYS_ROOT;
  const rule = isHoliday
    ? holidayRuleKey(
        slug,
        (term.aliases ?? []).map((alias) => tagSlug(alias)),
      )
    : undefined;
  const model = terms ? buildFacetModel(terms) : undefined;
  const pageTags = model ? pageTagSlugs(model, slug) : undefined;
  const cards = recipes.map((recipe) => ({
    ...recipe,
    tags:
      model && pageTags ? otherTags(model, recipe.tags, pageTags) : recipe.tags,
  }));
  const narrows =
    terms !== undefined && term.allRecipes.length <= TERM_NARROW_ROW_LIMIT;
  const pinSlot = signedIn && term.pinnedCount === 0 && recipes.length > 0;
  const side = isHoliday ? (
    <HolidayWhen
      slug={slug}
      label={label}
      rule={rule}
      serverDay={serverDay()}
      makeHref={makeHref}
    />
  ) : term.image || makeHref ? (
    <div className="flex flex-col gap-3">
      <TermPicture term={term} />
      {makeHref && <MakeLink href={makeHref} />}
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          "grid gap-5",
          side && "lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10",
        )}
      >
        <div className="flex min-w-0 flex-col gap-2.5">
          <TermHeading term={term} actions={actions} ticker={countLine(term)} />
          <NarrowerLinks term={term} />
        </div>
        {side}
      </div>
      {isHoliday && term.image && (
        <div className="max-w-xl">
          <TermPicture term={term} />
        </div>
      )}
      {(term.groups.length > 0 || pinSlot) && (
        <div
          className={cn(
            "grid gap-5",
            term.groups.length > 0 &&
              pinSlot &&
              "lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10",
          )}
        >
          <PlanCards term={term} />
          {pinSlot && <PinSlot />}
        </div>
      )}
      {recipes.length > 0 ? (
        <TermRecipes
          slug={slug}
          label={label}
          terms={narrows && terms ? lean(terms) : undefined}
          rows={narrows ? term.allRecipes : undefined}
          recipeCount={term.recipeCount}
          shownCount={recipes.length}
          searchHref={`/search?q=${query}`}
          grid={<RecipeList recipes={cards} />}
        />
      ) : (
        /*
         * A record-only term has no carriers at all and is still a real page;
         * `recipes` spans the subtree (34a), so a root whose recipes all
         * carry a narrower term lists them rather than landing here.
         */
        <EmptyState message={`No recipes are tagged ${label}.`} />
      )}
    </div>
  );
}

/** Three photos of a narrower term's recipes, each to its page. */
function SectionPhotos({ recipes }: { recipes: RecipeListEntry[] }) {
  if (recipes.length === 0) return null;
  return (
    <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
      {recipes.map((recipe) => (
        <li key={recipe.slug}>
          <Link
            href={`/recipe/${recipe.slug}`}
            className="group flex flex-col gap-1"
          >
            <span className="block aspect-square overflow-hidden rounded-md bg-muted">
              {recipe.image ? (
                <RecipeImage
                  slug={recipe.slug}
                  image={recipe.image}
                  alt=""
                  width={320}
                  height={320}
                  sizes="(max-width: 1024px) 33vw, 180px"
                  className="h-full w-full object-cover"
                  fallback={<RecipeCardPlaceholder name={recipe.name} />}
                />
              ) : (
                <RecipeCardPlaceholder name={recipe.name} />
              )}
            </span>
            <span className="line-clamp-2 text-xs leading-4 font-medium group-hover:text-primary">
              {recipe.name}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RootSectionRow({ section }: { section: RootSection }) {
  const id = `root-${section.slug}`;
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-2.5 border-b border-border py-3.5"
      data-testid="root-section"
    >
      <h2 id={id} className="m-0">
        <Link
          href={`/tags/${section.slug}`}
          className="group flex min-h-8 items-center justify-between gap-2"
        >
          <span className="font-display text-lg leading-6 font-semibold tracking-[-0.015em] group-hover:text-primary">
            {section.label}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[0.8125rem] font-normal text-primary">
            {section.count}
            <ChevronRight aria-hidden className="size-4" />
          </span>
        </Link>
      </h2>
      <SectionPhotos recipes={section.recipes} />
      {section.children.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {section.children.map((child) => (
            <Link
              key={child.slug}
              href={`/tags/${child.slug}`}
              className="inline-flex min-h-7 items-baseline gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-[0.8125rem] font-medium text-secondary-foreground hover:bg-secondary/80"
            >
              {child.label}
              <span className="font-mono text-[0.6875rem] opacity-75">
                {child.count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/** "Course" → "By course"; the root page's first view. */
function byLabel(label: string): string {
  return `By ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/**
 * A root page (43t, canvas B's `/tags/course`): one section per narrower
 * term, biggest first, each with three photos and its own narrower terms
 * as chips; past the first seven, "And N more" as dot-leader lines. The
 * Newest view is the list the page used to be (pinned first, then the
 * newest, capped — 34a).
 */
export function RootTermBody({
  term,
  terms,
  actions,
}: {
  term: TermPageData;
  terms?: FacetTerm[];
  actions?: ReactNode;
}) {
  const model = buildFacetModel(
    terms ??
      term.children.map((child) => ({
        slug: child.slug,
        label: child.label,
        parent: term.slug,
      })),
  );
  const { sections, more } = rootSections(model, term.slug, term.allRecipes);
  /* Narrower terms nothing carries yet still have a line (a curator's). */
  const listed = new Set([...sections, ...more].map((section) => section.slug));
  const empty = term.children
    .filter((child) => !listed.has(child.slug))
    .map((child) => ({
      slug: child.slug,
      label: child.label,
      count: 0,
      recipes: [],
      children: [],
    }));
  const rest = [...more, ...empty];
  const query = tagQuery(term.slug, term.allRecipes);
  const pageTags = pageTagSlugs(model, term.slug);
  const ticker = [
    plural(term.recipeCount, "recipe"),
    plural(term.children.length, "narrower term"),
    ...(term.groups.length > 0 ? [plural(term.groups.length, "plan")] : []),
    ...(term.aliases?.length
      ? [`also filed as ${term.aliases.join(", ")}`]
      : []),
  ].join(" · ");
  const almanac = term.slug === HOLIDAYS_ROOT;

  const bySections = (
    <div data-testid="term-children">
      <div className="grid lg:grid-cols-2 lg:gap-x-10">
        {sections.map((section) => (
          <RootSectionRow key={section.slug} section={section} />
        ))}
      </div>
      {rest.length > 0 && (
        <section aria-labelledby="root-more" className="pt-3.5">
          <h2
            id="root-more"
            className="m-0 mb-1 font-mono text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase"
          >
            {sections.length > 0 ? `And ${rest.length} more` : "Narrower"}
          </h2>
          <ul className="m-0 grid list-none gap-x-10 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((section) => (
              <li key={section.slug} className="flex">
                <Leader
                  href={`/tags/${section.slug}`}
                  label={section.label}
                  count={section.count}
                  className="min-h-10 text-[0.9375rem]"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
  const newest =
    term.recipes.length > 0 ? (
      <div className="flex flex-col gap-3">
        <RecipeList
          recipes={term.recipes.map((recipe) => ({
            ...recipe,
            tags: otherTags(model, recipe.tags, pageTags),
          }))}
        />
        {term.recipeCount > term.recipes.length && (
          <p className="my-2 text-sm">
            <Link
              href={`/search?q=${query}`}
              className="underline underline-offset-4 hover:text-primary"
              data-testid="term-see-all"
            >
              See all {term.recipeCount} recipes
            </Link>
          </p>
        )}
      </div>
    ) : (
      <EmptyState message={`No recipes are tagged ${term.label}.`} />
    );

  return (
    <div className="flex flex-col gap-4">
      <TermHeading term={term} actions={actions} ticker={ticker} />
      <div className="flex flex-wrap items-center gap-2">
        <RootViews
          first={byLabel(term.label)}
          sections={bySections}
          newest={newest}
          controls={
            <>
              {almanac && (
                <Link
                  href="/holidays"
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "min-h-11",
                  )}
                  data-testid="term-holiday-link"
                >
                  The almanac: every holiday, by date
                  <ArrowRight aria-hidden />
                </Link>
              )}
              {term.recipes.length > 0 && (
                <MakeLink
                  href={`/make?q=${query}`}
                  className="flex-1 sm:flex-none"
                />
              )}
            </>
          }
        />
      </div>
      {term.groups.length > 0 && <PlanCards term={term} />}
    </div>
  );
}

/**
 * One tag's page (34a): everything carrying it or a narrower term, under
 * the term record's own label, description and picture when it has one.
 * The route hands the resolved term in and this decides nothing else.
 */
export function TagPage({
  term,
  terms,
  actions,
  signedIn,
}: {
  term: TermPageData;
  terms?: FacetTerm[];
  /** Editor-only affordances; the export passes none. */
  actions?: ReactNode;
  signedIn?: boolean;
}) {
  return (
    <PageMain>
      <div className={cn(WRAP, "pt-7 pb-12")}>
        <TermPageBody
          term={term}
          terms={terms}
          actions={actions}
          signedIn={signedIn}
        />
      </div>
    </PageMain>
  );
}

/**
 * `/tags` (43t): the board (`TagBoard`), with each holiday's picture
 * rendered here on the server.
 */
export function TagIndexPage({
  board,
  pictures = {},
  actions,
}: {
  board: TagBoardData;
  pictures?: Record<string, ReactNode>;
  /** Editor-only affordances (31e: "New term"); the export passes none. */
  actions?: ReactNode;
}) {
  return (
    <PageMain>
      <div className={cn(WRAP, "pt-6 pb-12 lg:pt-8")}>
        <TagBoard
          data={board}
          pictures={pictures}
          serverDay={serverDay()}
          actions={actions}
        />
      </div>
    </PageMain>
  );
}
