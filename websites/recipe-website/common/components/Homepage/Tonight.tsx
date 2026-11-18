"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@discontent/component-library/lib/utils";
import type { TonightRecipe } from "../../controller/homepageTonight";
import { countLabel } from "../../controller/homepageIntents";
import { formatTotalTime } from "../../util/planPage";
import { parseDayKey } from "../../util/holidays";
import { useHomeDay } from "./HomeDay";
import { Monogram } from "./Monogram";

/** `/search` for a query, as the intent chips open it (42f's Df3). */
export function searchHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}

const QUICK_QUERY = "tag:quick tag:main";
const WARM_QUERY = "tag:warm-drinks";

/** "15 min · Chinese · easy": the time first, in a `<time>`, then the words. */
function Meta({ recipe }: { recipe: TonightRecipe }) {
  const parts: ReactNode[] = [];
  if (recipe.minutes) {
    parts.push(
      <time key="time" dateTime={`PT${recipe.minutes}M`}>
        {formatTotalTime(recipe.minutes)}
      </time>,
    );
  }
  for (const word of recipe.meta) parts.push(word);
  if (parts.length === 0) return null;
  return (
    <span className="block font-mono text-xs text-muted-foreground tabular-nums">
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && " · "}
          {part}
        </span>
      ))}
    </span>
  );
}

function Panel({
  id,
  title,
  count,
  children,
  className,
}: {
  id: string;
  title: string;
  count: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex min-w-0 flex-col gap-3.5 rounded-xl border border-border bg-card p-[1.125rem] text-card-foreground",
        className,
      )}
    >
      <h3
        id={id}
        className="font-mono text-xs leading-4 font-medium tracking-[0.08em] text-muted-foreground uppercase"
      >
        {title} <span className="tracking-normal normal-case">· {count}</span>
      </h3>
      {children}
    </section>
  );
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-auto inline-flex min-h-6 items-center gap-1 self-start text-sm text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ArrowRightIcon aria-hidden className="size-4" />
    </Link>
  );
}

/**
 * "Tonight" (48e, canvas B): what's for dinner — a quick dinner, what the
 * reader's list can make, and something warm to drink in the warm season —
 * as one row of three on a laptop, stacked on a phone.
 *
 * The candidates come from the server (`tonightCandidates`: tags, no
 * model); the day's turn through them is the reader's day's
 * (`homepageDay`), so the pick moves once a day and the static export
 * doesn't keep its build day's. The Make tile is the middle panel, its
 * count the browser's own list (U6).
 */
export function Tonight({
  quick,
  warm,
  make,
}: {
  /** Every quick dinner, in the fixed order the day turns through. */
  quick: TonightRecipe[];
  warm: TonightRecipe[];
  /** The Make tile, rendered by the page. */
  make: ReactNode;
}) {
  const page = useHomeDay();
  const bySlug = new Map(
    [...quick, ...warm].map((recipe) => [recipe.slug, recipe]),
  );
  const pick = (slugs: string[] | undefined, fallback: TonightRecipe[]) =>
    slugs
      ? slugs.flatMap((slug) => {
          const recipe = bySlug.get(slug);
          return recipe ? [recipe] : [];
        })
      : fallback;
  const quickShown = pick(page?.day.tonight.quick, quick.slice(0, 2));
  const [warmPick, warmOr] = pick(page?.day.tonight.warm, []);
  const thumb = (recipe: TonightRecipe) =>
    page?.thumbs[recipe.slug] ?? <Monogram label={recipe.name} small />;
  const card = (recipe: TonightRecipe) =>
    page?.cards[recipe.slug] ?? thumb(recipe);
  /* Friday and Saturday night are the weekend's; Sunday is a school night. */
  const today = page ? parseDayKey(page.today) : undefined;
  const weekend = today
    ? [5, 6].includes(
        new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay(),
      )
    : false;
  const panels = 1 + (quickShown.length > 0 ? 1 : 0) + (warmPick ? 1 : 0);

  return (
    <section aria-labelledby="home-tonight" className="flex flex-col gap-4">
      <div className="flex flex-row flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id="home-tonight"
          className="font-display text-2xl font-semibold tracking-tight"
        >
          Tonight
        </h2>
        {page?.known && (
          <span className="font-mono text-xs text-muted-foreground">
            {weekend ? "the weekend" : "a weeknight"}
          </span>
        )}
      </div>
      <div
        className={cn(
          "grid grid-cols-1 items-stretch gap-4 lg:gap-5",
          panels === 3 && "lg:grid-cols-3",
          panels === 2 && "md:grid-cols-2",
        )}
      >
        {quickShown.length > 0 && (
          <Panel
            id="home-tonight-quick"
            title="A quick dinner"
            count={countLabel(quick.length, "quick main")}
          >
            <ul className="flex flex-col gap-3" data-testid="tonight-quick">
              {quickShown.map((recipe) => (
                <li key={recipe.slug}>
                  <Link
                    href={`/recipe/${recipe.slug}`}
                    className="group grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3.5 lg:grid-cols-[6rem_minmax(0,1fr)]"
                  >
                    <div className="size-14 overflow-hidden rounded-md bg-muted lg:size-24">
                      {thumb(recipe)}
                    </div>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-display text-base leading-snug font-semibold group-hover:underline group-hover:underline-offset-4">
                        {recipe.name}
                      </span>
                      <Meta recipe={recipe} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <MoreLink href={searchHref(QUICK_QUERY)}>
              All {countLabel(quick.length, "quick main")}
            </MoreLink>
          </Panel>
        )}
        {make}
        {warmPick && (
          <Panel
            id="home-tonight-warm"
            title="Something warm"
            count={countLabel(warm.length, "warm drink")}
          >
            <Link
              href={`/recipe/${warmPick.slug}`}
              className="group flex flex-col gap-2"
              data-testid="tonight-warm"
            >
              <div className="h-24 overflow-hidden rounded-md bg-muted lg:h-40">
                {card(warmPick)}
              </div>
              <span className="font-display text-base leading-snug font-semibold group-hover:underline group-hover:underline-offset-4">
                {warmPick.name}
              </span>
            </Link>
            <Meta recipe={warmPick} />
            {warmOr && (
              <p className="text-sm text-muted-foreground">
                or{" "}
                <Link
                  href={`/recipe/${warmOr.slug}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {warmOr.name}
                </Link>
              </p>
            )}
            <MoreLink href={searchHref(WARM_QUERY)}>
              All {countLabel(warm.length, "warm drink")}
            </MoreLink>
          </Panel>
        )}
      </div>
    </section>
  );
}

export default Tonight;
