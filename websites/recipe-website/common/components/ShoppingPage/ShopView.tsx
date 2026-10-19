"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import {
  aisleIsDone,
  markAisle,
  rowsHolding,
  shopAisles,
  type ShopAisle,
} from "../../util/shoppingPage";
import type { ShoppingRow, ShoppingView } from "../../util/shoppingView";
import {
  AddBox,
  ErrorBanner,
  ExpiredTicks,
  ModeSwitch,
  RowList,
  lineCount,
  syncLabel,
} from "./parts";
import type { RowHandlers } from "./ShoppingRowView";
import { useDoneAisles, type ShoppingMode } from "./shopState";
import type { ShoppingList } from "./useShoppingList";

/** An aisle section's element id: the rail's jump target. */
function aisleAnchor(aisle: ShopAisle): string {
  return `shop-aisle-${aisle.id}`;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * How far down the pinned chrome reaches — the masthead and the store bar —
 * so a jump lands below it. Nothing when the reader's sticky-chrome setting
 * (or a short viewport) has released them.
 */
function pinnedBottom(bar: HTMLElement | null): number {
  if (!bar) return 0;
  const style = window.getComputedStyle(bar);
  if (style.position !== "sticky") return 0;
  return (Number.parseFloat(style.top) || 0) + bar.offsetHeight;
}

/**
 * The aisle rail (42g): a chip per aisle, jumping to it; the aisle in view
 * marked current; a done aisle with a tick and no count.
 */
function AisleRail({
  aisles,
  done,
  current,
  jump,
}: {
  aisles: ShopAisle[];
  done: Set<string>;
  current: string | undefined;
  jump(aisle: ShopAisle): void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  /* Keep the current chip in sight, scrolling the rail only (not the page). */
  useEffect(() => {
    const box = rail.current;
    const chip = box?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!box || !chip) return;
    const left = chip.offsetLeft - box.offsetLeft;
    if (
      left < box.scrollLeft ||
      left + chip.offsetWidth > box.scrollLeft + box.clientWidth
    ) {
      box.scrollLeft = Math.max(0, left - 16);
    }
  }, [current]);
  return (
    <nav aria-label="Aisles" className="-mx-4" data-testid="shopping-rail">
      <div
        ref={rail}
        className="flex gap-1.5 overflow-x-auto px-4 pt-0.5 pb-2.5 [scrollbar-width:none]"
      >
        {aisles.map((aisle) => {
          const isDone = done.has(aisle.id);
          const isCurrent = current === aisle.id;
          return (
            <a
              key={aisle.id}
              href={`#${aisleAnchor(aisle)}`}
              aria-current={isCurrent ? "location" : undefined}
              onClick={(event) => {
                event.preventDefault();
                jump(aisle);
              }}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap",
                isCurrent
                  ? "border-primary bg-primary text-primary-foreground"
                  : isDone
                    ? "border-border text-muted-foreground"
                    : "border-input text-foreground hover:border-primary",
              )}
            >
              {isDone && <Check aria-hidden className="size-4" />}
              {aisle.label}
              {isDone ? (
                <span className="sr-only">, done</span>
              ) : (
                <span className="font-mono text-xs tabular-nums opacity-85">
                  <span className="sr-only">, </span>
                  {aisle.left}
                  <span className="sr-only"> left</span>
                </span>
              )}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * One aisle's "probably on hand" rows as one quiet line — "salt · olive
 * oil" — that opens to each row with Buy anyway (the per-item `need` flag).
 */
function OnHandLine({
  rows,
  label,
  list,
}: {
  rows: ShoppingRow[];
  label: string | undefined;
  list: ShoppingList;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div
      className="mt-2 rounded-lg bg-muted px-3 py-2"
      data-testid="shopping-onhand-line"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-sm">
          <span className="block text-xs text-muted-foreground">
            Probably at home already
          </span>
          {rows.map((row) => row.name).join(" · ")}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show"}
          <span className="sr-only">
            {" "}
            what is probably on hand{label ? ` in ${label}` : ""}
          </span>
        </Button>
      </div>
      <ul id={listId} hidden={!open} className="mt-1 flex flex-col">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex min-h-11 items-center gap-2 border-t border-border/70 text-sm"
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
    </div>
  );
}

/** "1 of 2 ticked", or the count left when nothing is. */
function aisleCount(aisle: ShopAisle): string {
  const total = aisle.rows.length;
  return total === 0 ? "" : `${aisle.ticked} of ${total} ticked`;
}

/** A done aisle, folded away to one line: open it, or undo it. */
function DoneAisle({
  aisle,
  list,
  handlers,
  undo,
}: {
  aisle: ShopAisle;
  list: ShoppingList;
  handlers: RowHandlers;
  undo(): void;
}) {
  const [open, setOpen] = useState(false);
  const rowsId = useId();
  return (
    <div
      id={aisleAnchor(aisle)}
      tabIndex={-1}
      className="scroll-mt-4 rounded-lg border border-border outline-none"
      data-testid="shopping-aisle-done"
    >
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={rowsId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Check aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">{aisle.label} — done</span>
          <span className="font-mono text-xs tabular-nums">
            {aisle.ticked} of {aisle.rows.length}
          </span>
          <ChevronDown
            aria-hidden
            className={cn("size-4 shrink-0", open && "rotate-180")}
          />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11 text-muted-foreground"
          onClick={undo}
        >
          Undo<span className="sr-only">: {aisle.label} done</span>
        </Button>
      </div>
      <div id={rowsId} hidden={!open} className="px-3 pb-1">
        <RowList
          rows={aisle.rows}
          list={list}
          handlers={handlers}
          variant="shop"
        />
      </div>
    </div>
  );
}

/**
 * In the store (42g, canvas B "Shop"), phone first: one store at a time
 * (with the `stores` switch on), an aisle rail to jump, ticked rows struck
 * through where they are until their aisle is marked done, what is
 * probably on hand as one quiet line per aisle, and a bottom bar in thumb
 * reach with Add and Done shopping.
 */
export function ShopView({
  list,
  fullView,
  view,
  held,
  expired,
  handlers,
  store,
  setStore,
  storesOn,
  mode,
  setMode,
}: {
  list: ShoppingList;
  fullView: ShoppingView;
  /** The list at the chosen store (or all of it). */
  view: ShoppingView;
  held: number;
  expired: number;
  handlers: RowHandlers;
  /** The chosen store's id, or "all". */
  store: string;
  setStore(store: string): void;
  storesOn: boolean;
  mode: ShoppingMode;
  setMode(mode: ShoppingMode): void;
}) {
  const storeId = useId();
  const addId = useId();
  const barRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string>();
  const [current, setCurrent] = useState<string>();
  const [done, setDone] = useDoneAisles();

  const scope = storesOn ? store : "list";
  const aisles = useMemo(
    () => shopAisles(view, list.settings.aisleOrder),
    [view, list.settings.aisleOrder],
  );
  const aislesOn = list.settings.features.aisles;
  const doneHere = done[scope] ?? {};
  const doneSet = new Set(
    aislesOn
      ? aisles
          .filter((aisle) => aisleIsDone(doneHere[aisle.id], aisle))
          .map((aisle) => aisle.id)
      : [],
  );
  const open = aisles.filter((aisle) => !doneSet.has(aisle.id));
  /* The rail lists aisles with lines to tick, not on-hand-only ones. */
  const railAisles = aisles.filter((aisle) => aisle.rows.length > 0);
  const folded = aisles.filter((aisle) => doneSet.has(aisle.id));

  const ticked = aisles.reduce((sum, aisle) => sum + aisle.ticked, 0);
  const left = aisles.reduce((sum, aisle) => sum + aisle.left, 0);
  const total = ticked + left;
  const checkedIds = view.checked.flatMap((row) => row.ids);
  const here = storesOn && store !== "all" ? " here" : "";

  const markDone = (aisle: ShopAisle, value: boolean) =>
    setDone((current) => markAisle(current, scope, aisle, value, Date.now()));

  /*
   * The aisle in view: the last whose top has passed under the pinned bar —
   * or, scrolled to the end, the last aisle (it may never reach the bar).
   */
  const sectionIds = railAisles.map(aisleAnchor).join(" ");
  useEffect(() => {
    if (!aislesOn || !sectionIds) return;
    const ids = sectionIds.split(" ");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = pinnedBottom(barRef.current) + 8;
      const root = document.documentElement;
      const atEnd =
        window.scrollY > 0 &&
        window.innerHeight + window.scrollY >= root.scrollHeight - 2;
      let found: string | undefined = atEnd ? ids[ids.length - 1] : undefined;
      if (!found) {
        for (const id of ids) {
          const element = document.getElementById(id);
          if (element && element.getBoundingClientRect().top <= line) {
            found = id;
          }
        }
      }
      setCurrent((found ?? ids[0]).replace(/^shop-aisle-/, ""));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [sectionIds, aislesOn]);

  const jump = useCallback((aisle: ShopAisle) => {
    const target = document.getElementById(aisleAnchor(aisle));
    if (!target) return;
    const top =
      target.getBoundingClientRect().top +
      window.scrollY -
      pinnedBottom(barRef.current) -
      4;
    window.scrollTo({
      top: Math.max(0, top),
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    target.focus({ preventScroll: true });
    setCurrent(aisle.id);
  }, []);

  /**
   * Done shopping (42-Dg4): held ticks are saved first (38d, one change);
   * then the ticked lines here leave the list, after an Undo window, and
   * this trip's done aisles are forgotten.
   */
  const saving = list.status === "saving";
  const finish = async () => {
    setNote(undefined);
    let saved: number | undefined;
    if (list.holding && list.pendingCount > 0) {
      const count = held;
      if (!(await list.done())) return;
      saved = count;
    }
    if (checkedIds.length === 0) {
      if (saved !== undefined) setNote(`Saved ${lineCount(saved)}.`);
      return;
    }
    const rows = rowsHolding(view, new Set(checkedIds));
    const cleared = `${saved !== undefined ? `Saved and cleared` : "Cleared"} ${lineCount(rows)}.`;
    setNote(cleared);
    list.startClear(checkedIds, () =>
      setDone((current) => {
        const next = { ...current };
        delete next[scope];
        return next;
      }),
    );
  };
  const clearing = list.clearing !== undefined;
  /* "Cleared 2 lines." stays while Undo can, then a few seconds more. */
  useEffect(() => {
    if (!note || clearing) return;
    const timer = window.setTimeout(() => setNote(undefined), 6000);
    return () => window.clearTimeout(timer);
  }, [note, clearing]);
  const canFinish =
    !saving &&
    !clearing &&
    ((list.holding && list.pendingCount > 0) || checkedIds.length > 0);

  let status: string;
  let detail: string | undefined;
  const sync = syncLabel(list, held);
  if (note) {
    status = note;
  } else if (list.holding) {
    status =
      list.pendingCount > 0
        ? `${lineCount(held)} ticked`
        : "Ticks stay on this device";
    detail =
      list.pendingCount > 0 ? "held on this device" : "until you're done";
  } else {
    status = `${ticked} ticked`;
    detail = sync;
  }

  const storeChoices = [
    { id: "all", name: "All stores", count: fullView.counts.remaining },
    ...fullView.stores.map((each) => ({
      id: each.store!.id,
      name: each.store!.name,
      count: each.count,
    })),
  ];

  return (
    <>
      <h1 className="sr-only">Shopping list</h1>
      <div
        ref={barRef}
        className="sticky-chrome top-[var(--header-height)] z-20 -mx-4 -mt-6 flex flex-col gap-2.5 border-b border-border bg-card px-4 pt-2.5 print:hidden"
        data-testid="shopping-shop-bar"
      >
        <div className="flex items-center gap-2.5">
          <ModeSwitch mode={mode} onChange={setMode} />
          {storesOn && (
            <>
              <label htmlFor={storeId} className="sr-only">
                Store
              </label>
              <select
                id={storeId}
                className="h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-base font-bold"
                value={store}
                onChange={(event) => setStore(event.target.value)}
              >
                {storeChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.name} ({choice.count} left)
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="flex flex-col gap-1.5" data-testid="shopping-progress">
          <div className="flex items-baseline justify-between font-mono text-xs uppercase tracking-wider">
            <span className="text-muted-foreground">
              {ticked} of {total} ticked{here}
            </span>
            <span className="font-semibold">{left} left</span>
          </div>
          <div
            role="progressbar"
            aria-label={`Ticked${here}`}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={ticked}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary"
              style={{ width: `${total === 0 ? 0 : (ticked / total) * 100}%` }}
            />
          </div>
        </div>
        {aislesOn && railAisles.length > 1 ? (
          <AisleRail
            aisles={railAisles}
            done={doneSet}
            current={current}
            jump={jump}
          />
        ) : (
          <div className="pb-0.5" />
        )}
      </div>

      <ErrorBanner list={list} />
      <ExpiredTicks count={expired} dismiss={list.dismissExpired} />

      <div data-testid="shopping-list" className="flex flex-col">
        {total === 0 && (
          <p className="py-6 text-center text-muted-foreground">
            {view.counts.items === 0
              ? "The list is empty. Add lines below, or add a recipe or a meal plan from its page."
              : "Nothing left to buy."}
          </p>
        )}
        {folded.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-3">
            {folded.map((aisle) => (
              <DoneAisle
                key={aisle.id}
                aisle={aisle}
                list={list}
                handlers={handlers}
                undo={() => markDone(aisle, false)}
              />
            ))}
          </div>
        )}
        {open.map((aisle) => (
          <section
            key={aisle.id}
            id={aisleAnchor(aisle)}
            tabIndex={-1}
            aria-label={aisle.label ?? "The list"}
            className="pt-3.5 outline-none"
            data-testid="shopping-aisle"
          >
            {aisle.label && (
              <h2 className="flex items-baseline justify-between border-b border-border pt-1 pb-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {aisle.label}{" "}
                <span className="font-mono text-xs font-medium normal-case tracking-wider">
                  {aisleCount(aisle)}
                </span>
              </h2>
            )}
            <RowList
              rows={aisle.rows}
              list={list}
              handlers={handlers}
              variant="shop"
            />
            {aisle.onHand.length > 0 && (
              <OnHandLine rows={aisle.onHand} label={aisle.label} list={list} />
            )}
            {aislesOn && aisle.rows.length > 0 && (
              <Button
                type="button"
                variant="outline"
                className="mt-2 h-11 w-full"
                onClick={() => markDone(aisle, true)}
              >
                <Check aria-hidden className="size-4" />
                Aisle done<span className="sr-only">: {aisle.label}</span>
              </Button>
            )}
          </section>
        ))}
      </div>

      <div
        className="sticky-chrome bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-4 border-t border-border bg-card px-4 pt-2.5 pb-3 shadow-[0_-4px_6px_-1px_rgb(0_0_0/0.06)] sm:bottom-0 print:hidden"
        data-testid="shopping-done"
      >
        <div id={addId} ref={addRef} hidden={!adding} className="mb-2.5">
          <AddBox list={list} />
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            className="size-11 shrink-0 p-0"
            aria-label={adding ? "Close adding" : "Add an item"}
            aria-expanded={adding}
            aria-controls={addId}
            onClick={() => {
              const next = !adding;
              setAdding(next);
              /* Into the box once it shows (the next frame). */
              if (next) {
                window.requestAnimationFrame(() =>
                  addRef.current?.querySelector("textarea")?.focus(),
                );
              }
            }}
          >
            {adding ? (
              <X aria-hidden className="size-5" />
            ) : (
              <Plus aria-hidden className="size-5" />
            )}
          </Button>
          <p
            className="min-w-0 flex-1 text-xs text-muted-foreground"
            role="status"
          >
            <span className="block font-mono text-sm font-semibold text-foreground">
              {status}
            </span>
            {detail}
          </p>
          {clearing && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => {
                list.undoClear();
                setNote(undefined);
              }}
            >
              Undo
            </Button>
          )}
          <Button
            type="button"
            className="h-12 px-5 text-[0.9375rem]"
            disabled={!canFinish}
            onClick={() => void finish()}
          >
            {saving ? "Saving…" : "Done shopping"}
          </Button>
        </div>
      </div>
    </>
  );
}
