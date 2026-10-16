"use client";

import Link from "next/link";
import { useId, useMemo } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Skeleton } from "@discontent/component-library/components/ui/skeleton";
import type { SecondaryInventory } from "../../controller/secondaryInventory";
import type { BuyNext, RecipeMatch } from "../../util/makeable";
import { useMakeable } from "../MakePage/useMakeable";

/** The judge's scope on this page: every drink (`tag:` reaches the subtree). */
export const DRINKS_SCOPE = "tag:drink";
/** `/make`, scoped to drinks — where the list is edited. */
export const DRINKS_MAKE_HREF = `/make?q=${encodeURIComponent(DRINKS_SCOPE)}`;
/** Ready drinks shown as buttons before "+N more". */
const READY_LIMIT = 12;

const drinks = (count: number) => (count === 1 ? "drink" : "drinks");

function ReadyLinks({ matches }: { matches: RecipeMatch[] }) {
  const shown = matches.slice(0, READY_LIMIT);
  const more = matches.length - shown.length;
  return (
    <ul className="flex flex-wrap gap-2" data-testid="drinks-ready">
      {shown.map(({ recipe }) => (
        <li key={recipe.slug}>
          <Link
            href={`/recipe/${recipe.slug}`}
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
          >
            {recipe.name}
          </Link>
        </li>
      ))}
      {more > 0 && (
        <li>
          <Link
            href={DRINKS_MAKE_HREF}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 font-medium hover:text-primary"
          >
            <span className="font-mono">+{more}</span>&nbsp;more
          </Link>
        </li>
      )}
    </ul>
  );
}

function BuyNextColumn({ buyNext }: { buyNext: BuyNext[] }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-testid="drinks-buy-next"
      className="flex flex-[1_1_18rem] flex-col gap-1 bg-secondary p-6 text-secondary-foreground sm:p-7"
    >
      <h3
        id={headingId}
        className="mb-2 font-mono text-xs uppercase tracking-[0.16em]"
      >
        Buy next
      </h3>
      {buyNext.length === 0 ? (
        <p className="text-sm">
          Nothing on the list is one or two items from a drink.
        </p>
      ) : (
        <ol className="flex flex-col">
          {buyNext.map((entry) => (
            <li
              key={entry.label}
              className="flex items-baseline gap-3 border-b border-border py-2 last:border-b-0"
            >
              <span className="flex-1 font-medium">{entry.label}</span>
              <span className="font-mono text-sm">
                {entry.unlocks > 0
                  ? `+${entry.unlocks} ${drinks(entry.unlocks)}`
                  : `${entry.helps} closer`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * The secondary group (U6): what the other list — the operator's saved
 * inventory in a signed-in editor, or the house snapshot the operator chose
 * to share on the export — makes that this browser's list doesn't. Below
 * the panel, collapsed, and never in its counts.
 */
function SecondaryGroup({
  label,
  matches,
}: {
  label: string;
  matches: RecipeMatch[];
}) {
  return (
    <details
      data-testid="drinks-secondary"
      className="rounded-lg border border-border bg-card px-4 py-3"
    >
      <summary className="cursor-pointer font-semibold">
        {label}{" "}
        <span className="font-mono text-sm font-normal text-muted-foreground">
          {matches.length}
        </span>
      </summary>
      {matches.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing more than this browser&apos;s list makes.
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {matches.map(({ recipe }) => (
            <li key={recipe.slug}>
              <Link
                href={`/recipe/${recipe.slug}`}
                className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium hover:text-primary"
              >
                {recipe.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/**
 * `/drinks`' top panel (U3): "You can mix N drinks right now", the ready
 * drinks as buttons, and Buy next — `/make`'s judge over every drink, from
 * this browser's list (U6) in both apps.
 *
 * `secondary` comes from `secondaryInventory()`: the operator's saved list
 * in a signed-in editor; elsewhere the house snapshot when the export option
 * is on, and nothing by default.
 */
export function DrinksMakePanel({
  secondary,
}: {
  secondary?: SecondaryInventory;
}) {
  const headingId = useId();
  const { status, have, analysis, withSecondary, retry } = useMakeable(
    DRINKS_SCOPE,
    secondary?.items,
  );
  const ready = analysis?.canMake ?? [];
  const secondaryOnly = useMemo(() => {
    if (!withSecondary) return [];
    const mine = new Set(ready.map((match) => match.recipe.slug));
    return withSecondary.canMake.filter(
      (match) => !mine.has(match.recipe.slug),
    );
  }, [withSecondary, ready]);

  const invitation = (
    <div className="flex flex-col items-start gap-4 p-6 sm:p-7">
      <h2
        id={headingId}
        className="font-display text-3xl font-bold leading-none tracking-tight sm:text-4xl"
      >
        What&apos;s on your shelf?
      </h2>
      <p className="max-w-prose text-muted-foreground">
        Tell it the bottles, mixers and syrups you have, and the drinks you can
        mix show up here.
      </p>
      <Button asChild>
        <Link href={DRINKS_MAKE_HREF}>Add what you have</Link>
      </Button>
    </div>
  );

  let body;
  /* An empty list invites at once: it never waits on, or fails with, the
   * corpus or the ingredient lines it has no use for. */
  if (status === "empty") {
    body = invitation;
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-start gap-3 p-6 sm:p-7">
        <h2 id={headingId} className="font-display text-2xl font-bold">
          Drinks are unavailable
        </h2>
        <Button type="button" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  } else if (status === "pending" || !analysis) {
    body = (
      <div className="flex w-full flex-col gap-4 p-6 sm:p-7" aria-busy="true">
        <h2 id={headingId} className="sr-only">
          What you can mix
        </h2>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-11 w-24" />
        </div>
      </div>
    );
  } else if (have.length === 0) {
    /* Nothing here, but a secondary list to judge: the invitation still
     * leads, and the secondary group shows below. */
    body = invitation;
  } else {
    const oneAway = analysis.oneAway.length;
    body = (
      <>
        <div className="flex flex-[999_1_26rem] flex-col gap-5 p-6 sm:p-7">
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
              <Link href={DRINKS_MAKE_HREF} className="hover:text-primary">
                {have.length} on hand
              </Link>
            </p>
            <h2
              id={headingId}
              data-testid="drinks-can-mix"
              className="font-display text-3xl font-bold leading-none tracking-tight sm:text-4xl"
            >
              {ready.length === 0 ? (
                "Nothing to mix yet"
              ) : (
                <>
                  You can mix <span className="font-mono">{ready.length}</span>{" "}
                  {drinks(ready.length)} right now
                </>
              )}
            </h2>
          </div>
          {ready.length > 0 && <ReadyLinks matches={ready} />}
          {oneAway > 0 && (
            <Link
              href={DRINKS_MAKE_HREF}
              className="self-start text-sm text-primary underline-offset-4 hover:underline"
            >
              See the <span className="font-mono">{oneAway}</span>{" "}
              {drinks(oneAway)} one item away
            </Link>
          )}
        </div>
        <BuyNextColumn buyNext={analysis.buyNext} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <section
        aria-labelledby={headingId}
        data-testid="drinks-make"
        className="flex flex-wrap overflow-hidden rounded-xl border border-border bg-card text-card-foreground"
      >
        {body}
      </section>
      {secondary && withSecondary && (
        <SecondaryGroup label={secondary.label} matches={secondaryOnly} />
      )}
    </div>
  );
}
