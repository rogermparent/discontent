"use client";

import { useEffect, useId, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@discontent/component-library/components/ui/popover";
import { cn } from "@discontent/component-library/lib/utils";
import { AISLE_LABELS, AISLES, type Aisle } from "../../util/aisles";
import type { ShoppingSettings } from "../../util/shoppingTypes";
import {
  shoppingNameOf,
  type ShoppingChange,
  type ShoppingRow,
} from "../../util/shoppingView";

export interface RowHandlers {
  tick(ids: readonly string[], checked: boolean): void;
  update(patch: unknown): void;
  saveSettings(patch: unknown): void;
  /** 49a: Split a merged row (delete its decision); absent where unsupported. */
  split?(id: string): void;
  /** 49b: a merged row's "Ask the model about this" (its decision's id). */
  askAbout?(id: string): void;
}

/** 49a: "1 cup white flour (Pancakes) · 2 cups all-purpose flour (Bread)". */
function mergedFrom(row: ShoppingRow): string | undefined {
  if (!row.merge) return undefined;
  return row.merge.from
    .map((line) => {
      const whose = line.recipeName ?? line.recipe;
      return whose ? `${line.text} (${whose})` : line.text;
    })
    .join(" · ");
}

/**
 * 49a (Da5): a merged row says what it was made from, and Split puts its
 * names back as their own rows. At home only; in the store the row is one
 * line like any other (its menu still splits it).
 */
function MergedFrom({
  row,
  handlers,
}: {
  row: ShoppingRow;
  handlers: RowHandlers;
}) {
  const from = mergedFrom(row);
  if (!from || !row.merge) return null;
  const { id } = row.merge;
  return (
    <p
      className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground print:hidden"
      data-testid="shopping-merged-from"
    >
      <span className="break-words">merged from: {from}</span>
      {handlers.split && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-6 min-w-6 px-0 text-xs"
          onClick={() => handlers.split?.(id)}
          aria-label={`Split ${row.name} back into its lines`}
        >
          Split
        </Button>
      )}
    </p>
  );
}

/** 50a: who made a change, as the chain says it. */
export function changedBy(
  change: Pick<ShoppingChange, "source" | "by">,
): string {
  if (change.source === "rule") return "a rule for every list";
  return change.by?.kind === "model"
    ? `suggested by ${change.by.model ?? "the model"}`
    : "by you";
}

/**
 * 50a (Plan): a changed row's marker, and its chain — as written, then each
 * change, who made it and why.
 */
function Changes({ row }: { row: ShoppingRow }) {
  const changes = row.changes ?? [];
  if (changes.length === 0) return null;
  return (
    <details
      className="mt-0.5 text-xs text-muted-foreground print:hidden"
      data-testid="shopping-row-changes"
    >
      <summary className="min-h-6 cursor-pointer select-none py-1">
        <span
          className="mr-1 rounded-sm border border-border px-1 font-mono text-[0.6875rem] uppercase tracking-wide text-foreground"
          data-testid="shopping-row-changed"
        >
          changed
        </span>
        {changes.length === 1 ? "1 change" : `${changes.length} changes`}
      </summary>
      <ol
        className="ml-3 flex flex-col gap-0.5"
        aria-label="How this line changed"
      >
        {row.asWritten && row.asWritten.length > 0 && (
          <li>
            <span className="font-medium">As written:</span>{" "}
            {row.asWritten.join(" · ")}
          </li>
        )}
        {changes.map((change, index) => (
          <li key={`${change.id}:${index}`}>
            → {change.text}
            {change.skipped && ` (not applied: ${change.skipped})`} —{" "}
            {changedBy(change)}
            {change.reason && ` · ${change.reason}`}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** "from Chili", "from 3 recipes" — or nothing for lines typed by hand. */
function sourceSummary(row: ShoppingRow): string | undefined {
  const names = new Set(
    (row.sources ?? [])
      .filter((source) => source.recipe)
      .map((source) => source.recipeName ?? source.recipe),
  );
  if (names.size === 0) return undefined;
  if (names.size === 1) return `from ${[...names][0]}`;
  return `from ${names.size} recipes`;
}

function Sources({ row }: { row: ShoppingRow }) {
  const summary = sourceSummary(row);
  if (!summary || !row.sources) return null;
  return (
    <details className="mt-0.5 text-xs text-muted-foreground print:hidden">
      <summary className="cursor-pointer select-none py-1">{summary}</summary>
      <ul className="ml-3 flex flex-col gap-0.5" data-testid="shopping-sources">
        {row.sources.map((source) => (
          <li key={source.id}>
            <span className="font-medium">
              {source.recipeName ?? source.recipe ?? "Typed in"}
            </span>
            {source.scale && ` ×${source.scale}`}
            {source.via &&
              source.via.length > 0 &&
              ` · ${source.via.join(" › ")}`}
            {" — "}
            {source.text}
            {source.for &&
              source.for.length > 0 &&
              ` (for ${source.for.map((sub) => sub.name).join(" › ")})`}
          </li>
        ))}
      </ul>
    </details>
  );
}

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";

/** The row's menu: store, aisle, buy-anyway, remove. */
function RowMenu({
  row,
  settings,
  handlers,
}: {
  row: ShoppingRow;
  settings: ShoppingSettings;
  handlers: RowHandlers;
}) {
  const storeId = useId();
  const aisleId = useId();
  const needId = useId();
  const { features } = settings;
  const storeName = (id?: string) =>
    settings.stores.find((store) => store.id === id)?.name ?? id;
  /* The ingredient, not the whole line: "eggs", never "2 large eggs, beaten". */
  const name = features.merge ? row.name : shoppingNameOf(row.name).label;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-11 shrink-0 p-0 print:hidden"
          aria-label={`Options for ${row.label}`}
        >
          <MoreHorizontal aria-hidden className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-3">
        <p className="text-sm font-semibold break-words">{row.label}</p>
        {features.stores && (
          <div className="flex flex-col gap-1">
            <label htmlFor={storeId} className="text-xs font-semibold">
              Store
            </label>
            <select
              id={storeId}
              className={selectClass}
              value={row.storePinned ? (row.store ?? "") : ""}
              onChange={(event) =>
                handlers.update({
                  set: { ids: row.ids, store: event.target.value || null },
                })
              }
            >
              <option value="">
                Automatic (
                {storeName(row.storePinned ? undefined : row.store) ??
                  "default"}
                )
              </option>
              {settings.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            {row.store && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto min-h-9 whitespace-normal"
                onClick={() =>
                  handlers.saveSettings({
                    storeOverrides: { [name]: row.store },
                  })
                }
              >
                Always buy {name} at {storeName(row.store)}
              </Button>
            )}
          </div>
        )}
        {features.aisles && (
          <div className="flex flex-col gap-1">
            <label htmlFor={aisleId} className="text-xs font-semibold">
              Aisle (for every {name})
            </label>
            <select
              id={aisleId}
              className={selectClass}
              value={row.aisle ?? "other"}
              onChange={(event) =>
                handlers.saveSettings({
                  aisleOverrides: { [name]: event.target.value as Aisle },
                })
              }
            >
              {/* 50b (Db7): "Check at home first" is a change of one list, never a rule by name. */}
              {AISLES.filter((aisle) => aisle !== "check").map((aisle) => (
                <option key={aisle} value={aisle}>
                  {AISLE_LABELS[aisle]}
                </option>
              ))}
            </select>
          </div>
        )}
        {features.onHand && (
          <label htmlFor={needId} className="flex items-center gap-2 text-sm">
            <input
              id={needId}
              type="checkbox"
              className="size-4 accent-primary"
              checked={row.need}
              onChange={(event) =>
                handlers.update(
                  event.target.checked
                    ? { need: row.ids }
                    : { unneed: row.ids },
                )
              }
            />
            Buy even if on hand
          </label>
        )}
        {row.merge && handlers.split && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handlers.split?.(row.merge!.id)}
          >
            Split into its names
          </Button>
        )}
        {row.merge && handlers.askAbout && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handlers.askAbout?.(row.merge!.id)}
          >
            Ask the model about this
          </Button>
        )}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => handlers.update({ remove: row.ids })}
        >
          Remove from list
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The row's label with its amount set in the mono face (42g, the canvas):
 * "10 eggs" reads as data + name. Only when the label starts with the amount
 * as `buildShoppingView` wrote it, so the text — what a test and a screen
 * reader read — is exactly `row.label` either way.
 */
function RowLabel({ row }: { row: ShoppingRow }) {
  const amount = row.remaining ?? row.quantity;
  if (amount && row.label.startsWith(`${amount} `)) {
    return (
      <>
        <span className="font-mono font-semibold tabular-nums">{amount}</span>
        {row.label.slice(amount.length)}
      </>
    );
  }
  return <>{row.label}</>;
}

/**
 * One line: a real checkbox with the line as its label (≥ 44 px tall), what
 * could not be read under it, where it came from, and its menu. A partly
 * ticked merged row shows its checkbox as mixed and its label as what is
 * left to buy. In the store (42g, `variant="shop"`) it is bigger, for a
 * thumb at arm's length, and a ticked row stays where it is, struck through.
 */
export function ShoppingRowView({
  row,
  settings,
  handlers,
  variant = "plan",
}: {
  row: ShoppingRow;
  settings: ShoppingSettings;
  handlers: RowHandlers;
  variant?: "plan" | "shop";
}) {
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  const shop = variant === "shop";
  useEffect(() => {
    if (box.current) box.current.indeterminate = row.partial;
  }, [row.partial]);
  return (
    <li
      className={cn(
        "flex items-start break-inside-avoid",
        shop ? "min-h-[3.375rem] gap-3.5 py-1" : "min-h-11 gap-3 py-1.5",
      )}
      data-testid="shopping-row"
      data-key={row.key}
      data-checked={row.checked ? "true" : undefined}
    >
      <input
        ref={box}
        id={id}
        type="checkbox"
        className={cn(
          "shrink-0 accent-primary",
          shop ? "mt-3 size-6" : "mt-2 size-5",
        )}
        checked={row.checked}
        onChange={() => handlers.tick(row.ids, !row.checked)}
      />
      <div className={cn("min-w-0 flex-1", shop ? "py-2.5" : "py-1.5")}>
        <label
          htmlFor={id}
          className={cn(
            "block break-words leading-snug",
            shop && "text-[1.0625rem]",
            row.checked && "text-muted-foreground line-through",
          )}
        >
          <RowLabel row={row} />
        </label>
        {(row.optional ||
          row.partlyOptional ||
          row.need ||
          row.partial ||
          row.forNote ||
          (row.notes?.length ?? 0) > 0 ||
          row.merge?.amountStale) && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="shopping-row-note"
          >
            {[
              row.forNote,
              row.partial && `${row.checkedCount} of ${row.total} ticked`,
              row.optional ? "optional" : row.partlyOptional,
              row.need && "buy anyway",
              row.merge?.amountStale && "your amount was for the old list",
              /* 50a: a layer's note: "or make from ~4 pears". */
              ...(row.notes ?? []),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {row.raw && row.raw.length > 0 && (
          <ul className="text-sm text-muted-foreground">
            {row.raw.map((line, index) => (
              <li key={index}>· {line}</li>
            ))}
          </ul>
        )}
        {row.alternatives && row.alternatives.length > 0 && (
          <ul
            className="text-sm text-muted-foreground"
            data-testid="shopping-alternatives"
          >
            {row.alternatives.map((line, index) => (
              <li key={index}>or {line}</li>
            ))}
          </ul>
        )}
        {!shop && <MergedFrom row={row} handlers={handlers} />}
        {!shop && <Changes row={row} />}
        {settings.features.sources && <Sources row={row} />}
      </div>
      <RowMenu row={row} settings={settings} handlers={handlers} />
    </li>
  );
}
