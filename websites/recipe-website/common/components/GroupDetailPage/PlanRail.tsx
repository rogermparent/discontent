"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, Clock, CookingPot, ShoppingCart } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import { requirementLabel } from "../../util/ingredientNames";
import type { RecipeMatch } from "../../util/makeable";
import {
  formatChillShort,
  formatDays,
  formatExtra,
  formatOven,
  summarizeMakeAhead,
  type MakeAhead,
} from "../../util/planTimes";
import type { PlanRowView } from "../../util/planPage";
import { quoteQueryValue } from "../SearchForm/queryLanguage";
import { AddGroupToShopping } from "../ShoppingPage/AddToShopping";
import { isActionError } from "../ShoppingPage/useShoppingList";
import type { SecondList } from "../MakePage/InventoryPanel";
import { useMakeable, type Makeable } from "../MakePage/useMakeable";
import type { PlanEditor } from "./types";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export const panelClass =
  "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground";

const headingClass =
  "flex items-center gap-2 font-display text-lg font-semibold tracking-[-0.02em]";

const NUMBER_WORDS = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** `/make`'s scope for this plan: its recipes, sub-plans' included. */
export function planScope(slug: string): string {
  return `group:${quoteQueryValue(slug)}`;
}

export function planMakeHref(slug: string): string {
  return `/make?q=${encodeURIComponent(planScope(slug))}`;
}

// --- shopping ---------------------------------------------------------------

/** "66 lines, merged into 26 rows. None ticked yet." */
function shoppingSentence(summary: NonNullable<PlanEditor["shopping"]>) {
  const ticked =
    summary.ticked === 0
      ? "None ticked yet."
      : summary.ticked === summary.lines
        ? "All ticked."
        : `${summary.ticked} ticked.`;
  return (
    <>
      This plan is on your list:{" "}
      <b className="font-mono font-medium tabular-nums">{summary.lines}</b>{" "}
      {summary.lines === 1 ? "line" : "lines"}, merged into{" "}
      <b className="font-mono font-medium tabular-nums">{summary.rows}</b>{" "}
      {summary.rows === 1 ? "row" : "rows"}. {ticked}
    </>
  );
}

/**
 * Shopping list (signed in): what of this plan is on the list, Open list and
 * Take it off the list (`removeSource {group}`, one commit, confirmed in
 * place as /shopping's Remove these is, 42-Dg3) — or, when none of it is,
 * the existing "Add to shopping list" with its scale.
 */
export function ShoppingPanel({
  slug,
  editor,
}: {
  slug: string;
  editor: PlanEditor;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState(false);
  const summary = editor.shopping;
  return (
    <section className={panelClass} aria-labelledby="plan-shopping-heading">
      <h2 id="plan-shopping-heading" className={headingClass}>
        <ShoppingCart aria-hidden className="size-5" />
        Shopping list
      </h2>
      {summary ? (
        <>
          <p className="text-sm" data-testid="plan-shopping-summary">
            {shoppingSentence(summary)}
          </p>
          {confirming ? (
            <div
              className="flex flex-col gap-2"
              role="group"
              aria-label="Take it off the list?"
            >
              <p className="text-sm">
                Take {plural(summary.lines, "line")} off the list?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(undefined);
                    try {
                      const result = await editor.removeFromShopping();
                      if ("error" in result) setError(result.error);
                      else {
                        setConfirming(false);
                        router.refresh();
                      }
                    } catch {
                      setError(
                        "Couldn't reach the editor — check the connection and try again.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Take them off
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirming(false)}
                >
                  Keep them
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/shopping">Open list</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
              >
                Take it off the list
              </Button>
            </div>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {added
              ? "It's on your list now."
              : "Not on your shopping list. Add the whole plan, sub-plans included:"}
          </p>
          <AddGroupToShopping
            group={slug}
            add={async (input) => {
              const result = await editor.addToShopping(input);
              if (!isActionError(result)) setAdded(true);
              return result;
            }}
          />
        </>
      )}
    </section>
  );
}

// --- the shelf ----------------------------------------------------------------

/** What From your shelf says, over `useMakeable`'s analysis. */
export interface ShelfSummary {
  ready: number;
  near: number;
  more: number;
  /** The nearest recipe not ready, and what it needs. */
  nearest?: { name: string; missing: string[] };
}

export function shelfSummary(makeable: Makeable): ShelfSummary | undefined {
  const { analysis } = makeable;
  if (!analysis) return undefined;
  const near = [...analysis.oneAway, ...analysis.twoAway];
  const first: RecipeMatch | undefined = near[0] ?? analysis.further[0];
  return {
    ready: analysis.canMake.length,
    near: near.length,
    more: analysis.further.length,
    ...(first
      ? {
          nearest: {
            name: first.recipe.name,
            missing: first.missing.map(requirementLabel),
          },
        }
      : {}),
  };
}

/** The shelf over this plan, judged as /make judges it. */
export function usePlanShelf(slug: string, second?: SecondList): Makeable {
  return useMakeable(planScope(slug), second?.items);
}

/** "0 ready · 1 within two" — the cook view's link row. */
export function shelfCaption(makeable: Makeable): string {
  if (makeable.status === "empty") return "your list is empty";
  const summary = shelfSummary(makeable);
  if (!summary)
    return makeable.status === "error" ? "couldn't check" : "checking…";
  return `${summary.ready} ready · ${summary.near} one or two away`;
}

/**
 * From your shelf: the plan's recipes judged against what's on hand — the
 * list Count from picks, as on /make and /drinks — as ready, one or two
 * away, and needing more, the nearest one's missing lines as tapes, and
 * Open in Make (`/make?q=group:<slug>`).
 */
export function ShelfPanel({
  slug,
  makeable,
}: {
  slug: string;
  makeable: Makeable;
}) {
  const summary = shelfSummary(makeable);
  return (
    <section className={panelClass} aria-labelledby="plan-shelf-heading">
      <h2 id="plan-shelf-heading" className={headingClass}>
        <CookingPot aria-hidden className="size-5" />
        From your shelf
      </h2>
      {makeable.status === "empty" ? (
        <p className="text-sm text-muted-foreground">
          Nothing on your list yet. Say what you have on Make, and this counts
          what the plan needs.
        </p>
      ) : makeable.status === "error" ? (
        <p className="text-sm text-muted-foreground" role="alert">
          Couldn&rsquo;t read the recipes.{" "}
          <button
            type="button"
            className={cn("underline underline-offset-4", FOCUS)}
            onClick={makeable.retry}
          >
            Try again
          </button>
        </p>
      ) : !summary ? (
        <p className="text-sm text-muted-foreground" role="status">
          Checking your shelf…
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2" data-testid="plan-shelf-stats">
            {(
              [
                [summary.ready, "ready"],
                [summary.near, "1–2 away"],
                [summary.more, "need more"],
              ] as const
            ).map(([count, label]) => (
              <div
                key={label}
                className="flex flex-col-reverse gap-0.5 rounded-md bg-muted px-2.5 py-2"
              >
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="font-mono text-[1.375rem] leading-7 font-medium tabular-nums">
                  {count}
                </dd>
              </div>
            ))}
          </dl>
          {summary.nearest && summary.nearest.missing.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm">{summary.nearest.name} needs</p>
              <ul className="flex flex-wrap gap-1.5" aria-label="Missing">
                {summary.nearest.missing.slice(0, 6).map((name) => (
                  <li
                    key={name}
                    className="make-tape inline-flex min-h-6 items-center px-2.5 py-1 font-mono text-xs"
                    data-kind="missing"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="font-mono text-xs text-muted-foreground">
            Counting {plural(makeable.counted.length, "item")} on hand, and the
            pantry staples
          </p>
        </>
      )}
      <Link
        href={planMakeHref(slug)}
        className={cn(
          "inline-flex min-h-6 items-center gap-1 self-start text-sm text-primary underline-offset-4 hover:underline",
          FOCUS,
        )}
      >
        Open in Make
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  );
}

// --- make ahead ---------------------------------------------------------------

/** The plan's make-ahead facts, from each recipe row's steps. */
export function useMakeAhead(rows: readonly PlanRowView[]): MakeAhead {
  return useMemo(
    () =>
      summarizeMakeAhead(
        rows.flatMap((row) =>
          row.recipe
            ? [{ name: row.recipe.name, times: row.recipe.times }]
            : [],
        ),
      ),
    [rows],
  );
}

/** "5 doughs chill", or "nothing to start early" — the cook view's link row. */
export function makeAheadCaption(summary: MakeAhead): string {
  if (summary.chilling.length === 0) {
    return summary.ovens.length > 0
      ? `oven at ${formatOven(summary.ovens[0].oven)}`
      : "from the steps";
  }
  return `${plural(summary.chilling.length, summary.doughs ? "dough" : "recipe")} chill`;
}

function ovenSentence(summary: MakeAhead): string | undefined {
  const { ovens, recipes } = summary;
  if (ovens.length === 0) return undefined;
  if (ovens.length === 1) {
    const { oven, count } = ovens[0];
    if (count === recipes) {
      return recipes === 1
        ? `It bakes at ${formatOven(oven)}.`
        : recipes === 2
          ? `Both bake at ${formatOven(oven)}.`
          : `All ${numberWord(recipes)} bake at ${formatOven(oven)}.`;
    }
    return `${count} of ${recipes} bake at ${formatOven(oven)}.`;
  }
  return `Ovens: ${ovens
    .map(({ oven, count }) => `${formatOven(oven)} (${count})`)
    .join(", ")}.`;
}

/**
 * Make ahead: which recipes chill, longest first, and how long they keep;
 * the oven; the timed extras — every word from the steps (D5), and the
 * panel says so.
 */
export function MakeAheadBody({ summary }: { summary: MakeAhead }) {
  const oven = ovenSentence(summary);
  const nothing =
    summary.chilling.length === 0 && !oven && summary.extras.length === 0;
  return (
    <>
      {summary.chilling.length > 0 && (
        <>
          <p className="text-sm">
            {summary.chilling.length} of {summary.recipes}{" "}
            {summary.doughs ? "doughs" : "recipes"} chill.
            {summary.keepsDays
              ? ` ${summary.doughs ? "Mix" : "Start"} them the day before; they keep ${formatDays(summary.keepsDays)}.`
              : ""}
          </p>
          <dl
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm"
            data-testid="plan-make-ahead"
          >
            {summary.chilling.map(({ name, chill }, index) => (
              <div key={`${index}-${name}`} className="contents">
                <dt className="truncate">{name}</dt>
                <dd className="text-right font-mono text-[0.8125rem] text-muted-foreground">
                  {formatChillShort(chill)}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      {(oven || summary.extras.length > 0) && summary.chilling.length > 0 && (
        <hr className="border-border" />
      )}
      {oven && <p className="text-sm">{oven}</p>}
      {summary.extras.map(({ name, extra }, index) => (
        <p key={`${index}-${name}`} className="text-sm">
          {name}: {formatExtra(extra)}.
        </p>
      ))}
      {nothing && (
        <p className="text-sm text-muted-foreground">
          The steps don&rsquo;t say to start anything early.
        </p>
      )}
      <p className="font-mono text-xs text-muted-foreground">From the steps.</p>
    </>
  );
}

export function MakeAheadPanel({ summary }: { summary: MakeAhead }) {
  return (
    <section className={panelClass} aria-labelledby="plan-ahead-heading">
      <h2 id="plan-ahead-heading" className={headingClass}>
        <Clock aria-hidden className="size-5" />
        Make ahead
      </h2>
      <MakeAheadBody summary={summary} />
    </section>
  );
}
