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
import type { ShoppingRow } from "../../util/shoppingView";

export interface RowHandlers {
  tick(ids: readonly string[], checked: boolean): void;
  update(patch: unknown): void;
  saveSettings(patch: unknown): void;
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
              value={row.store ?? ""}
              onChange={(event) =>
                handlers.update({
                  set: { ids: row.ids, store: event.target.value || null },
                })
              }
            >
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
                    storeOverrides: { [row.name]: row.store },
                  })
                }
              >
                Always buy {row.name} at {storeName(row.store)}
              </Button>
            )}
          </div>
        )}
        {features.aisles && (
          <div className="flex flex-col gap-1">
            <label htmlFor={aisleId} className="text-xs font-semibold">
              Aisle (for every {row.name})
            </label>
            <select
              id={aisleId}
              className={selectClass}
              value={row.aisle ?? "other"}
              onChange={(event) =>
                handlers.saveSettings({
                  aisleOverrides: { [row.name]: event.target.value as Aisle },
                })
              }
            >
              {AISLES.map((aisle) => (
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
 * One line: a real checkbox with the line as its label (≥ 44 px tall), what
 * could not be read under it, where it came from, and its menu. A partly
 * ticked merged row shows its checkbox as mixed and its label as what is
 * left to buy.
 */
export function ShoppingRowView({
  row,
  settings,
  handlers,
}: {
  row: ShoppingRow;
  settings: ShoppingSettings;
  handlers: RowHandlers;
}) {
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.indeterminate = row.partial;
  }, [row.partial]);
  return (
    <li
      className="flex min-h-11 items-start gap-3 py-1.5 break-inside-avoid"
      data-testid="shopping-row"
      data-key={row.key}
    >
      <input
        ref={box}
        id={id}
        type="checkbox"
        className="mt-2 size-5 shrink-0 accent-primary"
        checked={row.checked}
        onChange={() => handlers.tick(row.ids, !row.checked)}
      />
      <div className="min-w-0 flex-1 py-1.5">
        <label
          htmlFor={id}
          className={cn(
            "block break-words leading-snug",
            row.checked && "text-muted-foreground line-through",
          )}
        >
          {row.label}
        </label>
        {(row.optional || row.need || row.partial) && (
          <p className="text-xs text-muted-foreground">
            {[
              row.partial && `${row.checkedCount} of ${row.total} ticked`,
              row.optional && "optional",
              row.need && "buy anyway",
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
        {settings.features.sources && <Sources row={row} />}
      </div>
      <RowMenu row={row} settings={settings} handlers={handlers} />
    </li>
  );
}
