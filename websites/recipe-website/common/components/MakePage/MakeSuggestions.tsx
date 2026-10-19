"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@discontent/component-library/components/ui/tabs";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import type { MassagedRecipeEntry } from "../../controller/data/read";
import type { BuyNext } from "../../util/makeable";
import type { MakeKind } from "./kinds";
import type { MostUsed } from "./makeMath";
import { BuyNextList } from "./MakeResults";
import { AddTape } from "./Tape";

/** Which panel `MakeSuggestions` shows. */
export type SuggestionTab = "buy" | "used";

/** Rows "Most used here" shows before "Show all N". */
export const MOST_USED_SHOWN = 12;

const TRIGGER = cn(
  "h-auto min-h-8 flex-none rounded-[0.3rem] px-3 py-1 font-mono text-[0.72rem] tracking-[0.06em] uppercase",
  "text-foreground data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-none",
  "dark:text-foreground dark:data-[state=active]:bg-foreground dark:data-[state=active]:text-background",
);

/**
 * "Most used here" (43m, Roger 2026-10-19: "'buy next' should show the most
 * used ingredients in the filter result so I can easily build a stockpile
 * from nothing after a clear"): what the scoped recipes ask for most, each a
 * tap-to-add tape with Undo, and how many of them use it — "in 34 of 120
 * drinks". A tap adds the name to this browser's list and focus moves to
 * the row that took its place, so a keyboard can add one after another.
 */
export function MostUsedList({
  rows,
  total,
  kind,
  empty,
  onAdd,
  intro,
}: {
  rows: MostUsed[];
  /** Recipes in scope: the "of 120". */
  total: number;
  kind: MakeKind;
  /** The counted list is empty: say how to start. */
  empty: boolean;
  onAdd: (name: string) => void;
  /** Shown under the heading while the list is empty (Import a list). */
  intro?: ReactNode;
}) {
  const headingId = useId();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? rows : rows.slice(0, MOST_USED_SHOWN);
  const noun = total === 1 ? kind.one : kind.word;
  const listRef = useRef<HTMLOListElement>(null);
  const focusAt = useRef<number | null>(null);
  useEffect(() => {
    const at = focusAt.current;
    if (at === null) return;
    focusAt.current = null;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(
      "[data-testid='make-add-used']",
    );
    if (buttons?.length) buttons[Math.min(at, buttons.length - 1)].focus();
  }, [rows]);
  return (
    <section aria-labelledby={headingId} data-testid="most-used">
      <h2 id={headingId} className="m-0 font-display text-lg font-bold">
        Most used in these {total} {noun}
      </h2>
      <p className="mt-1 mb-2 text-sm text-muted-foreground">
        {empty
          ? "Your list is empty. Tap what you have to start it — these are what the recipes here ask for most."
          : "Tap what you have to add it. Each counts the recipes here that ask for it."}
      </p>
      {intro}
      {rows.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          Everything these recipes use most is on your list already.
        </p>
      ) : (
        <>
          <ol
            id={listId}
            ref={listRef}
            className="m-0 grid list-none gap-x-6 p-0 sm:grid-cols-2"
          >
            {shown.map((row, i) => (
              <li
                key={row.name}
                className="flex min-w-0 items-center justify-between gap-3 border-t py-2"
              >
                <AddTape
                  item={row.name}
                  testId="make-add-used"
                  onAdd={(name) => {
                    focusAt.current = i;
                    onAdd(name);
                  }}
                />
                <span className="shrink-0 font-mono text-xs whitespace-nowrap text-muted-foreground">
                  in {row.recipes} of {total}
                  <span className="sr-only"> {noun}</span>
                </span>
              </li>
            ))}
          </ol>
          {rows.length > MOST_USED_SHOWN && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show fewer" : `Show all ${rows.length}`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * `/make`'s suggestions card (43m): **Buy next** (41h) and **Most used
 * here** as two tabs. The counted list empty — a first visit, or after
 * Clear — lands on Most used, so the page starts from what the recipes ask
 * for rather than from nothing; otherwise Buy next leads, as before, unless
 * the visitor picked a tab (`tab`). `/drinks` keeps a plain `BuyNextList`.
 */
export function MakeSuggestions({
  tab,
  onTab,
  buyNext,
  recipes,
  featured,
  kind,
  onHave,
  onFeature,
  mostUsed,
  total,
  empty,
  onAddUsed,
  intro,
}: {
  tab: SuggestionTab;
  onTab: (tab: SuggestionTab) => void;
  buyNext: BuyNext[];
  recipes: Map<string, MassagedRecipeEntry>;
  featured: string[];
  kind: MakeKind;
  onHave: (item: string) => void;
  onFeature: (item: string) => void;
  mostUsed: MostUsed[];
  total: number;
  empty: boolean;
  onAddUsed: (name: string) => void;
  intro?: ReactNode;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTab(value as SuggestionTab)}
      data-testid="make-suggestions"
      className="gap-3 rounded-lg border bg-card p-4 text-card-foreground sm:px-5"
    >
      <TabsList
        aria-label="Suggestions"
        className="h-auto gap-1 rounded-md border border-input bg-transparent p-0.5"
      >
        <TabsTrigger value="buy" className={TRIGGER}>
          Buy next
        </TabsTrigger>
        <TabsTrigger value="used" className={TRIGGER}>
          Most used here
        </TabsTrigger>
      </TabsList>
      <TabsContent value="buy">
        <BuyNextList
          bare
          buyNext={buyNext}
          recipes={recipes}
          featured={featured}
          kind={kind}
          onHave={onHave}
          onFeature={onFeature}
        />
      </TabsContent>
      <TabsContent value="used">
        <MostUsedList
          rows={mostUsed}
          total={total}
          kind={kind}
          empty={empty}
          onAdd={onAddUsed}
          intro={intro}
        />
      </TabsContent>
    </Tabs>
  );
}
