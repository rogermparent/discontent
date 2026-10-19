"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Printer } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  listOrigins,
  removalPatch,
  rowsHolding,
  type ShoppingOrigin,
} from "../../util/shoppingPage";
import { SHOPPING_FEATURES } from "../../util/shoppingTypes";
import type {
  ShoppingRow,
  ShoppingSubRecipeGroup,
  ShoppingView,
} from "../../util/shoppingView";
import {
  AddBox,
  ClearChecked,
  ConfirmRemove,
  CopyButton,
  DoneShopping,
  ErrorBanner,
  ExpiredTicks,
  ModeSwitch,
  RowList,
  StoreSwitch,
  SubRecipes,
  lineCount,
  panelClass,
  syncLabel,
} from "./parts";
import { FEATURE_TEXT, SettingsSheet } from "./SettingsSheet";
import type { RowHandlers } from "./ShoppingRowView";
import type { ShoppingMode } from "./shopState";
import type { ShoppingList } from "./useShoppingList";

/**
 * Hidden on a phone's screen only: Plan's list is Shop's there (the canvas),
 * but a printout — narrower than `lg` too — keeps it.
 */
const phoneHidden = "[@media_screen_and_(max-width:1023.98px)]:hidden";

/** "plan · 3 recipes · 10 lines", "3 lines · with Simple Syrup". */
function originMeta(origin: ShoppingOrigin, rows: number): string {
  const parts: string[] = [];
  if (origin.kind === "plan") {
    const recipes = origin.recipes?.length ?? 0;
    parts.push("plan", `${recipes} ${recipes === 1 ? "recipe" : "recipes"}`);
  }
  parts.push(lineCount(rows));
  if (origin.subRecipes.length > 0) {
    parts.push(`with ${origin.subRecipes.join(", ")}`);
  }
  return parts.join(" · ");
}

/**
 * "What's on it" (42g, at home): each plan the list was given, with the
 * recipes it brought, each recipe added on its own, and the lines typed in —
 * each with "Remove these", one change through the seat's `removeSource`
 * where it takes exactly these lines (`removalPatch`).
 */
function Origins({
  origins,
  view,
  list,
}: {
  origins: ShoppingOrigin[];
  view: ShoppingView;
  list: ShoppingList;
}) {
  const headingId = useId();
  return (
    <section
      className={cn(panelClass, "print:hidden")}
      aria-labelledby={headingId}
      data-testid="shopping-on-list"
    >
      <h2 id={headingId} className="font-semibold">
        What’s on it
      </h2>
      <p className="mb-1 text-xs text-muted-foreground">
        Remove takes every line it added, ticked or not, as one change.
      </p>
      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {origins.map((origin) => {
          const rows = rowsHolding(view, new Set(origin.ids));
          const href =
            origin.kind === "plan"
              ? `/group/${origin.slug}`
              : origin.kind === "recipe"
                ? `/recipe/${origin.slug}`
                : undefined;
          return (
            <li
              key={origin.key}
              className="flex flex-col gap-1 py-2"
              data-testid="shopping-on-list-entry"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm">
                  {href ? (
                    <Link
                      href={href}
                      className="font-medium underline-offset-4 hover:text-primary hover:underline"
                    >
                      {origin.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{origin.name}</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {originMeta(origin, rows)}
                  </span>
                </span>
                <ConfirmRemove
                  label={` lines from ${origin.name}`}
                  question={`Remove what ${origin.name} added to ${lineCount(rows)}?`}
                  disabled={list.working}
                  onRemove={() =>
                    void list.removeOrigin(
                      removalPatch(origin, list.items),
                      origin.ids,
                    )
                  }
                />
              </div>
              {origin.recipes && origin.recipes.length > 0 && (
                <ul
                  className="ml-3 flex flex-col gap-0.5 border-l border-border pl-3 text-xs text-muted-foreground"
                  aria-label={`Recipes in ${origin.name}`}
                >
                  {origin.recipes.map((recipe) => (
                    <li key={recipe.slug}>
                      <Link
                        href={`/recipe/${recipe.slug}`}
                        className="text-foreground underline-offset-4 hover:text-primary hover:underline"
                      >
                        {recipe.name}
                      </Link>
                      {` · ${lineCount(rowsHolding(view, new Set(recipe.ids)))}`}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Every switch beside the list (42g, desktop): each writes on change, one
 * commit, through the settings write the sheet uses. The sheet keeps the
 * stores and aisles, and stays the phone's way in.
 */
function Switches({
  list,
  openSettings,
}: {
  list: ShoppingList;
  openSettings(): void;
}) {
  const headingId = useId();
  const { features } = list.settings;
  return (
    <section
      className={cn(panelClass, "hidden lg:block print:hidden")}
      aria-labelledby={headingId}
      data-testid="shopping-switches"
    >
      <h2 id={headingId} className="font-semibold">
        Switches
      </h2>
      <p className="mb-1 text-xs text-muted-foreground">
        Shared by every device. Each one changes the list at once.
      </p>
      <div className="flex flex-col">
        {SHOPPING_FEATURES.map((feature) => (
          <label
            key={feature}
            className="flex items-start gap-2.5 border-t border-border py-2"
          >
            <input
              type="checkbox"
              role="switch"
              className="mt-0.5 size-5 shrink-0 accent-primary"
              checked={features[feature]}
              disabled={list.working}
              onChange={(event) =>
                void list.saveSettings({
                  features: { [feature]: event.target.checked },
                })
              }
            />
            <span className="flex-1 text-sm">
              <span className="font-medium">{FEATURE_TEXT[feature][0]}</span>
              <span className="block text-xs text-muted-foreground">
                {FEATURE_TEXT[feature][1]}
              </span>
            </span>
          </label>
        ))}
      </div>
      <Button
        type="button"
        variant="link"
        className="mt-1 h-10 px-0"
        onClick={openSettings}
      >
        Stores and aisles
        <ChevronRight aria-hidden className="size-4" />
      </Button>
    </section>
  );
}

/**
 * "Probably on hand" at home: each row with Buy anyway — the per-item
 * `need` flag the row menu's "Buy even if on hand" already sets — which puts
 * it back on its store's list.
 */
function OnHandPanel({
  rows,
  list,
}: {
  rows: ShoppingRow[];
  list: ShoppingList;
}) {
  const headingId = useId();
  return (
    <section
      className={cn(panelClass, "print:hidden")}
      aria-labelledby={headingId}
      data-testid="shopping-probably-have"
    >
      <h2 id={headingId} className="font-semibold">
        Probably on hand ({rows.length})
      </h2>
      <p className="mb-1 text-xs text-muted-foreground">
        Your “what I have” list or the staples (salt, pepper, water) cover
        these. Buy anyway puts a line back on the list.
      </p>
      <ul className="grid border-t border-border sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] sm:gap-x-6">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex min-h-11 items-center gap-2 border-b border-border py-1 text-sm"
            data-testid="shopping-onhand-row"
          >
            <span className="min-w-0 flex-1 break-words">{row.label}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={list.working}
              onClick={() => void list.update({ need: row.ids })}
            >
              Buy anyway<span className="sr-only">: {row.label}</span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * On a phone, Plan ends in "Start shopping": a button per store with what
 * is left there (or one for the list), each opening Shop at that store.
 */
function StartShopping({
  view,
  storesOn,
  start,
}: {
  view: ShoppingView;
  storesOn: boolean;
  start(store: string): void;
}) {
  const stores = storesOn
    ? view.stores.map((list) => ({
        id: list.store!.id,
        name: list.store!.name,
        count: list.count,
      }))
    : [{ id: "all", name: "Start shopping", count: view.counts.remaining }];
  return (
    <div
      className="sticky-chrome bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-border bg-card px-4 py-2.5 shadow-[0_-4px_6px_-1px_rgb(0_0_0/0.06)] sm:bottom-0 lg:hidden print:hidden"
      data-testid="shopping-start"
    >
      {storesOn && (
        <p className="mb-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Start shopping
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
        {stores.map((store, index) => (
          <Button
            key={store.id}
            type="button"
            variant={index === stores.length - 1 ? "default" : "outline"}
            className="h-12 justify-between"
            onClick={() => start(store.id)}
          >
            {store.name}
            <span className="font-mono tabular-nums">{store.count}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * At home (42g, canvas B "Plan"): the list's panels — add, what is on it by
 * plan and recipe, sub-recipes, the switches — beside the list itself by
 * store and aisle, what is probably on hand with Buy anyway, and the ticked
 * fold with Clear checked. On a phone the panels stand alone and Start
 * shopping opens the store view; the list is Shop's there.
 */
export function PlanView({
  list,
  fullView,
  view,
  text,
  held,
  expired,
  subRecipes,
  handlers,
  store,
  setStore,
  storesOn,
  mode,
  setMode,
}: {
  list: ShoppingList;
  fullView: ShoppingView;
  view: ShoppingView;
  text: string;
  held: number;
  expired: number;
  subRecipes: ShoppingSubRecipeGroup[];
  handlers: RowHandlers;
  store: string;
  setStore(store: string): void;
  storesOn: boolean;
  mode: ShoppingMode;
  setMode(mode: ShoppingMode): void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const origins = useMemo(
    () => listOrigins(list.items, list.plans),
    [list.items, list.plans],
  );
  const sync = syncLabel(list, held);
  const showStoreHeadings = storesOn && view.stores.length > 1;
  const known = fullView.stores.some((each) => each.store?.id === store);

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto flex flex-col">
            <h1 className="text-2xl font-bold">Shopping list</h1>
            <p
              className="text-sm text-muted-foreground"
              data-testid="shopping-counts"
            >
              {view.counts.remaining} to buy
              {list.settings.features.onHand &&
                ` · ${view.counts.onHand} probably on hand`}
              {` · ${view.counts.checked} checked`}
              {sync && (
                <span className="print:hidden" role="status">
                  {" "}
                  · {sync}
                </span>
              )}
            </p>
          </div>
          <ModeSwitch mode={mode} onChange={setMode} />
          <div className="flex gap-2 print:hidden">
            <CopyButton text={text} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-10 lg:inline-flex"
              onClick={() => window.print()}
            >
              <Printer aria-hidden className="size-4" />
              Print
            </Button>
            <SettingsSheet
              settings={list.settings}
              save={list.saveSettings}
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
            />
          </div>
        </div>
        <ErrorBanner list={list} />
        <ExpiredTicks count={expired} dismiss={list.dismissExpired} />
        {list.holding && <DoneShopping list={list} rows={held} />}
      </header>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:items-start">
        <aside className="flex flex-col gap-4 print:hidden">
          <section className={panelClass} aria-label="Add">
            <h2 className="mb-1.5 text-sm font-semibold">Add to the list</h2>
            <AddBox
              list={list}
              hint="Plans and recipes add from their own pages."
            />
          </section>
          {origins.length > 0 && (
            <Origins origins={origins} view={fullView} list={list} />
          )}
          {subRecipes.length > 0 && (
            <SubRecipes groups={subRecipes} view={fullView} list={list} />
          )}
          <Switches list={list} openSettings={() => setSettingsOpen(true)} />
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {storesOn && (
            <div className={phoneHidden}>
              <StoreSwitch
                view={fullView}
                value={known ? store : "all"}
                onChange={setStore}
              />
            </div>
          )}
          <div
            data-testid="shopping-list"
            className={cn("flex flex-col gap-4", phoneHidden)}
          >
            {view.counts.remaining === 0 && (
              <p className="py-6 text-center text-muted-foreground">
                {view.counts.items === 0
                  ? "The list is empty. Add lines above, or add a recipe or a meal plan from its page."
                  : "Nothing left to buy."}
              </p>
            )}
            {view.stores.map((storeList) =>
              storeList.count === 0 ? null : (
                <section
                  key={storeList.store?.id ?? "all"}
                  aria-label={storeList.store?.name ?? "The list"}
                  data-testid="shopping-store"
                  className="rounded-lg border border-border bg-card px-4 py-3 print:border-0 print:px-0"
                >
                  {showStoreHeadings && storeList.store && (
                    <h2 className="mb-1 flex items-baseline gap-3 font-display text-2xl font-semibold tracking-tight">
                      {storeList.store.name}{" "}
                      <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {storeList.count} to buy
                      </span>
                    </h2>
                  )}
                  <div className="xl:columns-2 xl:gap-8">
                    {storeList.sections.map((section) => (
                      <section
                        key={section.aisle ?? "all"}
                        className="break-inside-avoid"
                        data-testid="shopping-aisle"
                        aria-label={section.label}
                      >
                        {section.label && (
                          <h3 className="mt-1.5 flex justify-between border-b border-border py-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            {section.label}{" "}
                            <span className="font-mono text-xs font-medium">
                              {section.rows.length}
                            </span>
                          </h3>
                        )}
                        <RowList
                          rows={section.rows}
                          list={list}
                          handlers={handlers}
                        />
                      </section>
                    ))}
                  </div>
                </section>
              ),
            )}
          </div>

          {list.settings.features.onHand && view.onHand.length > 0 && (
            <OnHandPanel rows={view.onHand} list={list} />
          )}

          {view.checked.length > 0 && (
            <details
              className={cn(
                "rounded-md border px-3 py-2 print:hidden",
                phoneHidden,
              )}
              data-testid="shopping-checked"
            >
              <summary className="min-h-10 cursor-pointer py-2 font-semibold">
                Checked ({view.checked.length})
              </summary>
              <RowList rows={view.checked} list={list} handlers={handlers} />
              <div className="py-2">
                {/* Exactly the lines shown ticked here — this store's, with
                    ticks not yet saved — never "whatever the server has ticked". */}
                <ClearChecked
                  ids={view.checked.flatMap((row) => row.ids)}
                  clear={() =>
                    void list.clearChecked(
                      view.checked.flatMap((row) => row.ids),
                    )
                  }
                />
              </div>
            </details>
          )}
        </div>
      </div>

      <StartShopping
        view={fullView}
        storesOn={storesOn}
        start={(choice) => {
          setStore(choice);
          setMode("shop");
          window.scrollTo({ top: 0 });
        }}
      />
    </>
  );
}
