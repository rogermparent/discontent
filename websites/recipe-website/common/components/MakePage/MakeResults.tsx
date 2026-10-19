"use client";

import { Fragment, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import { requirementLabel } from "../../util/ingredientNames";
import type {
  BuyNext,
  MakeableAnalysis,
  PreparedCorpus,
  RecipeMatch,
} from "../../util/makeable";
import SearchList from "../SearchList";
import { RecipeCardLink } from "../List/shared";
import { isFeatured, type MakeKind } from "./kinds";
import { namesAndMore } from "./makeMath";
import { StaticTape, TapeLabel } from "./Tape";
import type { CardView } from "./useInventory";

/**
 * What a card says under its name: what to make first, what a close item
 * stands in for (32j: "≈ onion for shallot"), and what it **needs** — each
 * missing line a dashed tape (41h). With close matches not counted, a close
 * line is missing too, and says what came near.
 *
 * A bean line another bean on hand could replace (42m) says so: in "With a
 * bean swap" as "Use [pinto beans] for [black bean]" — the bean on hand a
 * tape, the line's a dashed one — in place of "Needs"; in the bucket the
 * recipe also sits in, as "(swap: pinto beans)" after its "Needs" tape.
 */
function MatchNote({
  match,
  swapView = false,
  className,
}: {
  match: RecipeMatch;
  /** The card is in "With a bean swap": the swaps replace "Needs". */
  swapView?: boolean;
  className?: string;
}) {
  if (
    match.via.length === 0 &&
    match.missing.length === 0 &&
    match.close.length === 0
  ) {
    return null;
  }
  const nearBy = new Map(
    match.close.map(({ requirement, item }) => [requirement, item]),
  );
  const swapBy = new Map(
    (match.swaps ?? []).map(({ requirement, use }) => [requirement, use]),
  );
  const swapping = swapView && swapBy.size > 0;
  const counted = match.close.filter(
    ({ requirement }) => !match.missing.includes(requirement),
  );
  return (
    <div className={cn("flex flex-col gap-1 text-xs", className)}>
      {match.via.map(({ slug, name }) => (
        <p
          key={slug}
          data-testid="make-via"
          className="m-0 text-muted-foreground"
        >
          Make {name.toLowerCase()} first
        </p>
      ))}
      {counted.map(({ requirement, item }) => (
        <p
          key={`${requirement.line}-${requirementLabel(requirement)}`}
          data-testid="make-close"
          className="m-0 text-muted-foreground"
        >
          <span aria-hidden>≈ </span>
          <span className="sr-only">Close match: </span>
          {item} for {requirementLabel(requirement)}
        </p>
      ))}
      {swapping &&
        match.swaps!.map(({ requirement, use }) => (
          <p
            key={`${requirement.line}`}
            data-testid="make-swap"
            className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground"
          >
            Use <StaticTape kind="have">{use}</StaticTape> for{" "}
            <StaticTape>{requirementLabel(requirement)}</StaticTape>
          </p>
        ))}
      {!swapping && match.missing.length > 0 && (
        <p
          data-testid="make-missing"
          className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground"
        >
          Needs{" "}
          {match.missing.map((requirement) => {
            const near = nearBy.get(requirement);
            const swap = swapBy.get(requirement);
            return (
              <Fragment key={`${requirement.line}`}>
                <StaticTape>{requirementLabel(requirement)}</StaticTape>{" "}
                {near && <span>(close: {near}) </span>}
                {swap && <span>(swap: {swap}) </span>}
              </Fragment>
            );
          })}
        </p>
      )}
    </div>
  );
}

/** Cards a group shows before "Show all N" (usability pass review). */
export const GROUP_LIMIT = 12;
/** "Can make now" is what people came for: it shows more before folding. */
export const READY_LIMIT = 24;

/** What every card grid needs to draw either kind of card. */
export interface CardContext {
  view: CardView;
  recipes: Map<string, MassagedRecipeEntry>;
  prepared: PreparedCorpus;
  /** Per recipe, the line indexes the featured ingredients meet. */
  featuredLines?: Map<string, Set<number>>;
  /** Slugs that just became makeable: a brief accent ring (41h). */
  fresh: Set<string>;
  /** A tag's label, for a spec card's style line. */
  tagLabel: (tag: string) => string | undefined;
}

/**
 * A spec card (41h): name, style, the lines it uses — featured ones marked —
 * and "Needs" tapes for what's missing. Compact, for scanning a bar's worth
 * at once; the photo cards stay the default.
 */
function SpecCard({
  match,
  context,
  swapView,
}: {
  match: RecipeMatch;
  context: CardContext;
  swapView?: boolean;
}) {
  const { recipe } = match;
  const entry = context.prepared.recipes.get(recipe.slug);
  const tags = context.recipes.get(recipe.slug)?.tags ?? [];
  const style = tags
    .map((tag) => context.tagLabel(tag))
    .filter((label): label is string => !!label)
    .slice(0, 3)
    .join(" · ");
  const missing = new Set(match.missing);
  /* A line is marked when a featured item meets it, as the scope does. */
  const marks = context.featuredLines?.get(recipe.slug);
  const lines = (entry?.requirements ?? []).filter(
    (requirement) =>
      !requirement.optional && !requirement.staple && !missing.has(requirement),
  );
  return (
    <li
      className={cn(
        "grid content-start gap-2 rounded-md border bg-card p-3.5 text-card-foreground",
        context.fresh.has(recipe.slug) && "make-fresh",
      )}
    >
      <h3 className="m-0 font-display text-base leading-tight font-bold">
        <Link
          href={`/recipe/${recipe.slug}`}
          className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {recipe.name}
        </Link>
      </h3>
      {style && (
        <span className="font-mono text-[0.66rem] leading-none tracking-[0.09em] text-muted-foreground uppercase">
          {style}
        </span>
      )}
      {lines.length > 0 && (
        <p className="m-0 font-mono text-[0.8rem] leading-relaxed text-muted-foreground">
          {lines.map((requirement, i) => {
            const label = requirementLabel(requirement);
            const marked = !!marks?.has(requirement.line);
            return (
              <Fragment key={`${requirement.line}-${label}`}>
                {i > 0 && " · "}
                {marked ? (
                  <mark className="bg-transparent font-medium text-primary underline underline-offset-[0.2em]">
                    {label}
                  </mark>
                ) : (
                  label
                )}
              </Fragment>
            );
          })}
        </p>
      )}
      <MatchNote match={match} swapView={swapView} />
    </li>
  );
}

/**
 * A group's cards, at most `limit` of them until "Show all N" — a real
 * button with `aria-expanded`, expanding in place. A real list runs to
 * hundreds of one- and two-away recipes; the headings keep the counts.
 */
function MatchGrid({
  matches,
  context,
  limit = GROUP_LIMIT,
  swapView,
}: {
  matches: RecipeMatch[];
  context: CardContext;
  limit?: number;
  /** "With a bean swap" (42m): each card says what to swap. */
  swapView?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const gridId = useId();
  const bySlug = new Map(matches.map((match) => [match.recipe.slug, match]));
  const shown = expanded ? matches : matches.slice(0, limit);
  const { recipes, fresh } = context;
  return (
    <>
      <div id={gridId}>
        {context.view === "specs" ? (
          <ul
            className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14.5rem,1fr))] gap-3 p-0"
            data-testid="make-spec-cards"
          >
            {shown.map((match) => (
              <SpecCard
                key={match.recipe.slug}
                match={match}
                context={context}
                swapView={swapView}
              />
            ))}
          </ul>
        ) : (
          <SearchList
            recipeResults={shown
              .map((match) => recipes.get(match.recipe.slug))
              .filter((recipe): recipe is MassagedRecipeEntry => !!recipe)}
            highlightQuery=""
            renderItemWrapper={(recipe, content) => (
              <RecipeCardLink
                href={`/recipe/${recipe.slug}`}
                className={cn(
                  "rounded-md",
                  fresh.has(recipe.slug) && "make-fresh",
                )}
              >
                {content}
                <MatchNote
                  match={bySlug.get(recipe.slug)!}
                  swapView={swapView}
                  className="mx-2 my-1"
                />
              </RecipeCardLink>
            )}
          />
        )}
      </div>
      {matches.length > limit && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          aria-expanded={expanded}
          aria-controls={gridId}
          data-testid="make-show-all"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : `Show all ${matches.length}`}
        </Button>
      )}
    </>
  );
}

function Section({
  title,
  testId,
  matches,
  context,
  limit,
  empty,
  swapView,
}: {
  title: string;
  testId: string;
  matches: RecipeMatch[];
  context: CardContext;
  limit?: number;
  /** Said when there are none; without it the section goes. */
  empty?: ReactNode;
  swapView?: boolean;
}) {
  const headingId = useId();
  if (matches.length === 0 && !empty) return null;
  return (
    <section aria-labelledby={headingId} data-testid={testId}>
      <h2
        id={headingId}
        className="m-0 mb-3 flex items-baseline gap-2 font-display text-xl font-bold"
      >
        {title}
        <span className="font-mono text-sm font-normal text-muted-foreground">
          {matches.length}
        </span>
      </h2>
      {matches.length > 0 ? (
        <MatchGrid
          matches={matches}
          context={context}
          limit={limit}
          swapView={swapView}
        />
      ) : (
        empty
      )}
    </section>
  );
}

/** A dashed box that says there's nothing here yet. */
function NoneYet({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-md border-[1.5px] border-dashed border-input p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * "Buy next" (41h): what one more item would unlock, best first, inside the
 * featured scope ("Buy next for lime drinks"). Each names the recipes it
 * would finish, its ingredient is a dashed tape that features it, and "I
 * have this: <item>" (41f's name) adds it.
 */
export function BuyNextList({
  buyNext,
  recipes,
  featured,
  kind,
  onHave,
  onFeature,
}: {
  buyNext: BuyNext[];
  recipes: Map<string, MassagedRecipeEntry>;
  featured: string[];
  kind: MakeKind;
  onHave: (item: string) => void;
  onFeature: (item: string) => void;
}) {
  const headingId = useId();
  const scope =
    featured.length > 0 ? ` for ${featured.join(" and ")} ${kind.word}` : "";
  return (
    <section
      aria-labelledby={headingId}
      data-testid="buy-next"
      className="rounded-lg border bg-card p-4 text-card-foreground sm:px-5"
    >
      <h2 id={headingId} className="m-0 font-display text-lg font-bold">
        Buy next{scope}
      </h2>
      {buyNext.length === 0 ? (
        <p className="mt-3 mb-0 text-sm text-muted-foreground">
          Nothing to suggest here yet. Add a few things to the list
          {featured.length > 0 ? " or feature something else" : ""}.
        </p>
      ) : (
        <>
          <p className="mt-1 mb-2 text-sm text-muted-foreground">
            Ranked by what each one finishes on its own.
          </p>
          <ol className="m-0 grid list-none p-0">
            {buyNext.map((entry, i) => {
              const names = entry.recipes.map(
                (slug) => recipes.get(slug)?.name ?? slug,
              );
              return (
                <li
                  key={`${i}-${entry.label}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-2.5 first:border-t-0"
                >
                  <div className="flex min-w-0 grow basis-60 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <TapeLabel
                        as="span"
                        kind="missing"
                        item={entry.label}
                        featured={isFeatured(entry.item, featured)}
                        onFeature={() => onFeature(entry.item)}
                      />
                      <span className="font-mono text-xs">
                        {entry.unlocks > 0
                          ? `makes ${entry.unlocks} more`
                          : "makes none alone"}{" "}
                        <span className="text-muted-foreground">
                          · {entry.helps} one step closer
                        </span>
                      </span>
                    </div>
                    <p className="m-0 min-w-0 text-sm text-muted-foreground">
                      {names.length > 0
                        ? namesAndMore(names)
                        : "Helps two-away recipes"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    /* Visible words first (41f, WCAG 2.5.3 label in name). */
                    aria-label={`I have this: ${entry.item}`}
                    onClick={() => onHave(entry.item)}
                  >
                    I have this
                  </Button>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

/** Photos or specs (41h): per browser, above the buckets. */
export function CardViewSwitch({
  value,
  onChange,
}: {
  value: CardView;
  onChange: (value: CardView) => void;
}) {
  const name = useId();
  const options: [CardView, string][] = [
    ["photos", "Photos"],
    ["specs", "Specs"],
  ];
  return (
    <fieldset
      className="m-0 flex items-center gap-2 border-0 p-0"
      data-testid="make-view"
    >
      <legend className="sr-only">Cards</legend>
      <span
        aria-hidden
        className="font-mono text-[0.72rem] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Cards
      </span>
      <div className="inline-flex overflow-hidden rounded-md border border-input">
        {options.map(([option, label], i) => {
          const checked = value === option;
          return (
            <label
              key={option}
              className={cn(
                "relative flex min-h-8 cursor-pointer items-center px-3 text-sm",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-[3px] has-[:focus-visible]:outline-ring",
                i > 0 && "border-l border-border",
                checked
                  ? "bg-foreground text-background"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={checked}
                onChange={() => onChange(option)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function MakeResults({
  analysis,
  context,
}: {
  analysis: MakeableAnalysis;
  context: CardContext;
}) {
  const { canMake, beanSwap, oneAway, twoAway, further } = analysis;
  return (
    <div className="grid gap-9">
      <Section
        title="Can make now"
        testId="make-can"
        matches={canMake}
        context={context}
        limit={READY_LIMIT}
        empty={
          <NoneYet>
            <strong className="font-semibold text-foreground">
              Nothing to make yet.
            </strong>{" "}
            Buy next shows what gets you there fastest.
          </NoneYet>
        }
      />
      {/* 42m: also in their own buckets below, whose counts don't change. */}
      <Section
        title="With a bean swap"
        testId="make-bean-swap"
        matches={beanSwap}
        context={context}
        swapView
      />
      <Section
        title="One ingredient away"
        testId="make-one-away"
        matches={oneAway}
        context={context}
      />
      <Section
        title="Two away"
        testId="make-two-away"
        matches={twoAway}
        context={context}
      />
      {further.length > 0 && (
        <details data-testid="make-further">
          <summary className="cursor-pointer font-display text-xl font-bold">
            Further away ({further.length})
          </summary>
          <div className="mt-3">
            <MatchGrid matches={further} context={context} />
          </div>
        </details>
      )}
    </div>
  );
}
