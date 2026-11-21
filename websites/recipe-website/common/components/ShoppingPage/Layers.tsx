"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { cn } from "@discontent/component-library/lib/utils";
import { listLayers } from "../../util/shoppingChanges";
import type { ShoppingLeftOff } from "../../util/shoppingView";
import { panelClass } from "./parts";
import { changedBy } from "./ShoppingRowView";
import type { ShoppingList } from "./useShoppingList";

/**
 * 50a: the page's minimal layers UI (50c builds the walkthrough) — the
 * list's changes in order with on/off and Remove, what was left off with
 * Restore, and the "As written" switch.
 */

/** Who left a row off, in the panel's words. */
function leftOffBy(entry: ShoppingLeftOff): string {
  if (entry.source === "built-in") return "always left off";
  if (entry.source === "rule") return "your rule for every list";
  return changedBy({ source: "layer", by: entry.by });
}

/**
 * "Left off the list (N)", collapsed: each row with its reason and who said
 * so, and Restore — a rule's (water) writes a rule bringing it back; a
 * layer's turns that change off.
 */
export function LeftOffPanel({
  entries,
  list,
}: {
  entries: ShoppingLeftOff[];
  list: ShoppingList;
}) {
  const [status, setStatus] = useState("");
  const summaryRef = useRef<HTMLElement>(null);
  if (entries.length === 0 && !status) return null;
  const restore = async (entry: ShoppingLeftOff) => {
    /* A rule's row by the key it matched, never its label (49a, canned). */
    const done =
      entry.source === "layer" && entry.id
        ? await list.setLayer(entry.id, false)
        : await list.leaveOff({
            ...(entry.key ? { key: entry.key } : { name: entry.row.name }),
            leaveOff: false,
          });
    if (!done?.changed) return;
    setStatus(`Back on the list: ${entry.row.label}.`);
    /*
     * The button is gone with its row: focus goes to the panel's summary,
     * or — the last one restored — to the row now back on the list.
     */
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLInputElement>(
        `[data-testid="shopping-row"][data-key="${CSS.escape(entry.row.key)}"] input[type="checkbox"]`,
      );
      (summaryRef.current ?? row)?.focus();
    });
  };
  return (
    <section
      className="print:hidden"
      aria-label="Left off the list"
      data-testid="shopping-left-off"
    >
      <p role="status" className="sr-only">
        {status}
      </p>
      {entries.length > 0 && (
        <details className="rounded-md border px-3 py-2">
          <summary
            ref={summaryRef}
            className="min-h-10 cursor-pointer py-2 font-semibold"
          >
            Left off the list ({entries.length})
          </summary>
          <p className="text-xs text-muted-foreground">
            Not bought, so not on the list. Restore puts a line back
            {list.canLayer ? "" : " (in the editor)"}.
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {entries.map((entry) => (
              <li
                key={entry.row.key}
                className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 text-sm"
                data-testid="shopping-left-off-row"
              >
                <span className="min-w-0 flex-1 break-words">
                  {entry.row.label}
                  <span className="block text-xs text-muted-foreground">
                    {entry.reason} · {leftOffBy(entry)}
                  </span>
                </span>
                {list.canLayer && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={list.working}
                    onClick={() => void restore(entry)}
                    aria-label={`Restore ${entry.row.label}`}
                  >
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/**
 * "Changes (N)": this list's layers in the order they apply, each with who
 * made it, an on/off switch (off is undo: the change stays, to turn back
 * on) and Remove. A change none of whose lines is left is not shown.
 */
export function ChangesPanel({ list }: { list: ShoppingList }) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState("");
  const listings = useMemo(
    () =>
      listLayers(list.layers, list.items).filter((listing) => !listing.stale),
    [list.layers, list.items],
  );
  if (!list.canLayer || (listings.length === 0 && !status)) return null;
  return (
    <section
      className={cn(panelClass, "print:hidden")}
      aria-labelledby={headingId}
      data-testid="shopping-changes"
    >
      <h2
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="font-semibold"
      >
        Changes ({listings.length})
      </h2>
      <p className="mb-1 text-xs text-muted-foreground">
        This list’s own changes, applied in order. Off undoes one and keeps it
        to turn back on.
      </p>
      <p role="status" className="sr-only">
        {status}
      </p>
      {listings.length === 0 && (
        <p className="border-t border-border py-2 text-sm">
          No changes on this list.
        </p>
      )}
      <ol className="flex flex-col divide-y divide-border border-t border-border">
        {listings.map(({ layer, text }) => (
          <li
            key={layer.id}
            className="flex flex-col gap-1 py-2"
            data-testid="shopping-change"
            data-on={layer.on ? "true" : "false"}
          >
            <span
              className={cn(
                "text-sm break-words",
                !layer.on && "text-muted-foreground line-through",
              )}
            >
              {text}
            </span>
            <span className="text-xs text-muted-foreground">
              {changedBy({ source: "layer", by: layer.by })}
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  role="switch"
                  className="size-5 accent-primary"
                  checked={layer.on}
                  disabled={list.working}
                  onChange={(event) =>
                    void list.setLayer(layer.id, event.target.checked)
                  }
                  aria-label={`On: ${text}`}
                />
                On
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                disabled={list.working}
                onClick={async () => {
                  const done = await list.removeLayer(layer.id);
                  if (!done) return;
                  setStatus(`Removed: ${text}.`);
                  requestAnimationFrame(() => headingRef.current?.focus());
                }}
                aria-label={`Remove change: ${text}`}
              >
                Remove
              </Button>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "As written": the list's rows before any merge, rule or change. */
export function AsWrittenSwitch({
  on,
  onChange,
}: {
  on: boolean;
  onChange(on: boolean): void;
}) {
  return (
    <label
      className="flex min-h-10 items-center gap-2 text-sm print:hidden"
      data-testid="shopping-as-written"
    >
      <input
        type="checkbox"
        role="switch"
        className="size-5 accent-primary"
        checked={on}
        onChange={(event) => onChange(event.target.checked)}
      />
      As written
      <span className="text-xs text-muted-foreground">
        (before merges, rules and changes)
      </span>
    </label>
  );
}
