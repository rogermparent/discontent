"use client";

import {
  useId,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import { cn } from "@discontent/component-library/lib/utils";
import { inventoryKey, parseInventoryText } from "../../util/inventoryText";
import type { Inventory } from "./useInventory";
import { ImportExportDialog } from "./ImportExportDialog";

/** Most suggestions put in the datalist; the browser filters as you type. */
const MAX_SUGGESTIONS = 300;

/**
 * What I have: the list as chips, an input to add to it, and the
 * import/export dialog. A sidebar on wide screens; on narrow ones the same
 * panel behind a disclosure button, open to begin with.
 *
 * Each chip's remove control is a **sibling** button rather than part of the
 * chip, so the name reads as text and the button has a name of its own
 * ("Remove vodka") — one tab stop per item, nothing nested in a control.
 */
export function InventoryPanel({
  inventory,
  shared,
  pending,
  suggestions,
  inputRef,
  dialogOpen,
  onDialogOpenChange,
}: {
  inventory: Inventory;
  /**
   * The editor's shared list (25d), when there is one. With it, each chip
   * says where it comes from — shared, or added on this browser (`+`) — and
   * shared items this browser removed are listed as hidden, with Undo.
   */
  shared?: string[];
  /** The "N changes on this browser — Save / Discard" bar, if any. */
  pending?: ReactNode;
  suggestions: string[];
  inputRef: RefObject<HTMLInputElement | null>;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
}) {
  const { have, add, remove, setHave, overlay } = inventory;
  const sharedKeys = useMemo(
    () => (shared ? new Set(shared.map(inventoryKey)) : undefined),
    [shared],
  );
  const hidden = useMemo(
    () =>
      sharedKeys
        ? overlay.removed.filter((item) => sharedKeys.has(inventoryKey(item)))
        : [],
    [overlay.removed, sharedKeys],
  );
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const panelId = useId();
  const inputId = useId();
  const listId = useId();

  const options = useMemo(() => {
    const had = new Set(have.map(inventoryKey));
    return suggestions
      .filter((name) => !had.has(inventoryKey(name)))
      .slice(0, MAX_SUGGESTIONS);
  }, [suggestions, have]);

  return (
    <aside
      aria-label="What I have"
      className="lg:w-72 lg:shrink-0 lg:sticky lg:top-4 lg:self-start"
    >
      <button
        type="button"
        className="lg:hidden flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-semibold"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        What I have ({have.length})
        <ChevronDown
          aria-hidden
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        id={panelId}
        className={cn(
          "mt-2 flex flex-col gap-3 lg:mt-0",
          !open && "hidden lg:flex",
        )}
      >
        <h2 className="hidden lg:block text-sm font-semibold">
          What I have ({have.length})
        </h2>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const { items } = parseInventoryText(draft);
            if (items.length > 0) add(items);
            setDraft("");
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Add to what I have
          </label>
          <Input
            id={inputId}
            ref={inputRef}
            data-testid="inventory-input"
            list={listId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add to what I have"
            autoComplete="off"
          />
          <datalist id={listId}>
            {options.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Button type="submit" size="sm" className="h-9">
            Add
          </Button>
        </form>
        {have.length > 0 && (
          <ul
            className="flex flex-wrap gap-1.5"
            data-testid="inventory-chips"
            aria-label="Items I have"
          >
            {have.map((item) => (
              <li
                key={inventoryKey(item)}
                data-source={
                  sharedKeys
                    ? sharedKeys.has(inventoryKey(item))
                      ? "shared"
                      : "browser"
                    : undefined
                }
                className={cn(
                  "inline-flex items-center rounded-full bg-secondary text-secondary-foreground text-xs",
                  sharedKeys &&
                    !sharedKeys.has(inventoryKey(item)) &&
                    "ring-1 ring-primary/60",
                )}
              >
                <span className="pl-2.5 pr-1 py-1">
                  {sharedKeys && !sharedKeys.has(inventoryKey(item)) && (
                    <>
                      <span aria-hidden className="mr-0.5 font-bold">
                        +
                      </span>
                      <span className="sr-only">(this browser) </span>
                    </>
                  )}
                  {item}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  className="mr-1 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => remove(item)}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {hidden.length > 0 && (
          <div>
            <h3 className="mb-1 text-xs font-semibold text-muted-foreground">
              Hidden on this browser
            </h3>
            <ul
              className="flex flex-wrap gap-1.5"
              data-testid="inventory-hidden"
              aria-label="Shared items hidden on this browser"
            >
              {hidden.map((item) => (
                <li
                  key={inventoryKey(item)}
                  className="inline-flex items-center rounded-full border border-dashed text-xs text-muted-foreground"
                >
                  <span className="pl-2.5 pr-1 py-1 line-through">{item}</span>
                  <button
                    type="button"
                    aria-label={`Undo hiding ${item}`}
                    className="mr-1 rounded-full px-1.5 py-0.5 text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => add([item])}
                  >
                    Undo
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {pending}
        <div className="flex flex-wrap gap-2">
          <ImportExportDialog
            have={have}
            setHave={setHave}
            open={dialogOpen}
            onOpenChange={onDialogOpenChange}
          />
        </div>
      </div>
    </aside>
  );
}
