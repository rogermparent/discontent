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
import { PANTRY_STAPLES } from "../../util/makeable";
import { inventoryKey, parseInventoryText } from "../../util/inventoryText";
import type { Inventory, MakeSettings } from "./useInventory";
import { ImportExportDialog } from "./ImportExportDialog";

/**
 * "Assume pantry staples" (U5): on by default, per browser, and it says what
 * it assumes — `PANTRY_STAPLES`, the list the server seats use too.
 */
function PantrySwitch({ settings }: { settings: MakeSettings }) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="flex items-start gap-2.5" data-testid="pantry-staples">
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-describedby={hintId}
        className="mt-0.5 size-4 shrink-0 accent-primary"
        checked={settings.pantryStaples}
        onChange={(event) => settings.setPantryStaples(event.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          Assume pantry staples
        </label>
        <span id={hintId} className="text-xs text-muted-foreground">
          {PANTRY_STAPLES.join(", ")}
        </span>
      </span>
    </div>
  );
}

/**
 * "Assume I always have" (32j): the staples the matcher counts as on hand —
 * salt, black pepper, water and ice until edited — kept in this browser
 * beside the list. Folded away by default; the summary says how many.
 */
function StaplesEditor({ settings }: { settings: MakeSettings }) {
  const {
    alwaysHave: staples,
    setStaples,
    resetStaples,
    defaultStaples,
  } = settings;
  const [draft, setDraft] = useState("");
  const inputId = useId();
  return (
    <details className="rounded-md border px-3 py-2" data-testid="staples">
      <summary className="cursor-pointer text-xs font-semibold">
        Assume I always have ({staples.length})
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {staples.length > 0 && (
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label="Assumed on hand"
            data-testid="staples-chips"
          >
            {staples.map((item) => (
              <li
                key={inventoryKey(item)}
                className="inline-flex items-center rounded-full border text-xs"
              >
                <span className="pl-2.5 pr-1 py-0.5">{item}</span>
                <button
                  type="button"
                  aria-label={`Stop assuming ${item}`}
                  className="mr-1 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() =>
                    setStaples(
                      staples.filter(
                        (kept) => inventoryKey(kept) !== inventoryKey(item),
                      ),
                    )
                  }
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const { items } = parseInventoryText(draft);
            if (items.length > 0) setStaples([...staples, ...items]);
            setDraft("");
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Add to what I always have
          </label>
          <Input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. olive oil"
            autoComplete="off"
            className="h-8 text-xs"
          />
          <Button type="submit" size="sm" variant="outline" className="h-8">
            Add
          </Button>
        </form>
        {!defaultStaples && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start h-7 px-2 text-xs"
            onClick={resetStaples}
          >
            Reset to salt, pepper, water, ice
          </Button>
        )}
      </div>
    </details>
  );
}

/** Most suggestions put in the datalist; the browser filters as you type. */
const MAX_SUGGESTIONS = 300;

/**
 * What I have: this browser's list as chips, an input to add to it, the
 * staples settings and the import/export dialog. A sidebar on wide screens;
 * on narrow ones the same panel behind a disclosure button, open to begin
 * with. `saved` is the signed-in editor's saved-inventory editor (U6), below
 * the list it never mixes into.
 *
 * Each chip's remove control is a **sibling** button rather than part of the
 * chip, so the name reads as text and the button has a name of its own
 * ("Remove vodka") — one tab stop per item, nothing nested in a control.
 */
export function InventoryPanel({
  inventory,
  saved,
  suggestions,
  inputRef,
  dialogOpen,
  onDialogOpenChange,
  settings,
}: {
  inventory: Inventory;
  /** The staples to edit (32j, U5); none, no editor. */
  settings?: MakeSettings;
  /** The saved-inventory editor (U6), signed-in editor only. */
  saved?: ReactNode;
  suggestions: string[];
  inputRef: RefObject<HTMLInputElement | null>;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
}) {
  const { have, add, remove, setHave } = inventory;
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
                className="inline-flex items-center rounded-full bg-secondary text-secondary-foreground text-xs"
              >
                <span className="pl-2.5 pr-1 py-1">{item}</span>
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
        {settings && <PantrySwitch settings={settings} />}
        {settings && <StaplesEditor settings={settings} />}
        <div className="flex flex-wrap gap-2">
          <ImportExportDialog
            have={have}
            setHave={setHave}
            open={dialogOpen}
            onOpenChange={onDialogOpenChange}
          />
        </div>
        {saved}
      </div>
    </aside>
  );
}
