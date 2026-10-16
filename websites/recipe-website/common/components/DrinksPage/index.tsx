import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import type {
  DrinkCard,
  DrinksPageData,
  DrinkTerm,
} from "../../controller/drinksPage";
import { DRINK_ROOT } from "../../controller/drinksPage";
import type { SecondaryInventory } from "../../controller/secondaryInventory";
import { EmptyState } from "../EmptyState";
import { PageMain, PageSection } from "../PageLayout";
import { RecipeImage } from "../RecipeImage";
import {
  RecipeCardPlaceholder,
  recipeCardImageClassName,
} from "../List/shared";
import { DrinksMakePanel } from "./MakePanel";
import { SeasonalDrinks } from "./Seasonal";

const termHref = (slug: string) => `/tags/${slug}`;
const drinks = (count: number) => (count === 1 ? "drink" : "drinks");

function SectionHeading({
  id,
  children,
  action,
}: {
  id: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="font-display text-2xl font-semibold">
        {children}
      </h2>
      {action}
    </div>
  );
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm text-primary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

/** "By spirit": a tile per child of the `spirit` root. */
function SpiritTiles({ spirits }: { spirits: DrinkTerm[] }) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5">
      {spirits.map((spirit) => (
        <li key={spirit.slug}>
          <Link
            href={termHref(spirit.slug)}
            className="flex min-h-19 flex-col justify-center gap-0.5 rounded-lg border border-border bg-card px-3.5 py-3 text-card-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <span className="font-display text-lg font-semibold leading-tight">
              {spirit.label}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {spirit.count} {drinks(spirit.count)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A row of term chips with counts: the styles, or the classics. */
function TermChips({ terms }: { terms: DrinkTerm[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {terms.map((term) => (
        <li key={term.slug}>
          <Link
            href={termHref(term.slug)}
            className="inline-flex min-h-10 items-baseline gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm text-card-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {term.label}
            <span className="font-mono text-xs text-muted-foreground">
              {term.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A drink: a portrait picture (or the monogram), its name, base · style. */
function DrinkCards({ cards }: { cards: DrinkCard[] }) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <li key={card.slug}>
          <Link
            href={`/recipe/${card.slug}`}
            className="group flex flex-col gap-2 rounded-lg"
          >
            <div className="aspect-[4/5] w-full overflow-hidden rounded-lg bg-muted">
              {card.image ? (
                <RecipeImage
                  slug={card.slug}
                  image={card.image}
                  alt=""
                  className={recipeCardImageClassName}
                  width={400}
                  height={500}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                  fallback={<RecipeCardPlaceholder name={card.name} />}
                />
              ) : (
                <RecipeCardPlaceholder name={card.name} />
              )}
            </div>
            <span className="font-display font-semibold leading-tight group-hover:text-primary">
              {card.name}
            </span>
            {card.meta.length > 0 && (
              <span className="-mt-1 font-mono text-xs text-muted-foreground">
                {card.meta.join(" · ")}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * `/drinks` (usability pass, U3 — the design's Bar home), shared by both
 * apps: what this browser's list can mix, then ways in by spirit, style and
 * name, the next holiday's drinks and the newest.
 *
 * Static apart from two client islands: the make panel (the browser's list)
 * and the seasonal row (today's date). `secondary` is
 * `secondaryInventory()`'s answer — the operator's saved list in a signed-in
 * editor; on the export (and for an editor guest) the house snapshot when
 * "Share my saved inventory on the export" is on, and nothing by default.
 */
export function DrinksPage({
  data,
  secondary,
}: {
  data: DrinksPageData;
  secondary?: SecondaryInventory;
}) {
  const allDrinksHref = termHref(DRINK_ROOT);
  return (
    <PageMain>
      <PageSection
        grow
        maxWidth="none"
        className="mx-auto flex max-w-6xl flex-col gap-12 pb-12"
      >
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            Drinks
          </h2>
          <span
            data-testid="drinks-count"
            className="font-mono text-sm text-muted-foreground"
          >
            {data.count} {drinks(data.count)}
          </span>
        </div>

        {data.count === 0 ? (
          <EmptyState
            title="No drinks yet"
            message="Recipes tagged drink show up here."
            action={
              <Button asChild>
                <Link href="/recipes">Browse all recipes</Link>
              </Button>
            }
          />
        ) : (
          <>
            <DrinksMakePanel secondary={secondary} />

            {data.spirits.length > 0 && (
              <section
                aria-labelledby="drinks-by-spirit"
                className="flex flex-col gap-3.5"
              >
                <SectionHeading id="drinks-by-spirit">By spirit</SectionHeading>
                <SpiritTiles spirits={data.spirits} />
              </section>
            )}

            {data.styles.length > 0 && (
              <section
                aria-labelledby="drinks-by-style"
                className="flex flex-col gap-3.5"
              >
                <SectionHeading id="drinks-by-style">By style</SectionHeading>
                <TermChips terms={data.styles} />
              </section>
            )}

            {data.classics.length > 0 && (
              <section
                aria-labelledby="drinks-classics"
                className="flex flex-col gap-3.5"
              >
                <SectionHeading
                  id="drinks-classics"
                  action={
                    data.classicsCount > data.classics.length ? (
                      <TextLink href={allDrinksHref}>
                        All{" "}
                        <span className="font-mono">{data.classicsCount}</span>{" "}
                        classics
                      </TextLink>
                    ) : undefined
                  }
                >
                  Classics
                </SectionHeading>
                <TermChips terms={data.classics} />
              </section>
            )}

            <SeasonalDrinks
              options={data.seasonal.map((holiday) => ({
                slug: holiday.slug,
                label: holiday.label,
                count: holiday.count,
                href: `/search?q=${encodeURIComponent(
                  `tag:${DRINK_ROOT} tag:${holiday.slug}`,
                )}`,
                cards: <DrinkCards cards={holiday.drinks} />,
              }))}
            />

            <section
              aria-labelledby="drinks-new"
              className="flex flex-col gap-4"
            >
              <SectionHeading
                id="drinks-new"
                action={
                  <TextLink href={allDrinksHref}>
                    All <span className="font-mono">{data.count}</span>{" "}
                    {drinks(data.count)}
                  </TextLink>
                }
              >
                New drinks
              </SectionHeading>
              <DrinkCards cards={data.latest} />
            </section>
          </>
        )}
      </PageSection>
    </PageMain>
  );
}

export default DrinksPage;
