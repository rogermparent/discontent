"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@discontent/component-library/components/ui/dialog";
import { Textarea } from "@discontent/component-library/components/ui/textarea";
import { cn } from "@discontent/component-library/lib/utils";
import {
  buildShoppingView,
  formatShoppingText,
  viewForStore,
  type ShoppingRow,
  type ShoppingView,
} from "../../util/shoppingView";
import { SettingsSheet } from "./SettingsSheet";
import { ShoppingRowView, type RowHandlers } from "./ShoppingRowView";
import {
  useShoppingList,
  type ShoppingList,
  type ShoppingListState,
  type ShoppingPageActions,
} from "./useShoppingList";

export type { ShoppingPageActions, ShoppingListState };

const STORE_KEY = "shopping-store";

function readStoreChoice(): string {
  try {
    return window.localStorage.getItem(STORE_KEY) ?? "all";
  } catch {
    return "all";
  }
}

const storeListeners = new Set<() => void>();

function subscribeStoreChoice(listener: () => void): () => void {
  storeListeners.add(listener);
  return () => storeListeners.delete(listener);
}

function saveStoreChoice(store: string): void {
  try {
    window.localStorage.setItem(STORE_KEY, store);
  } catch {
    /* A per-viewer convenience only. */
  }
  for (const listener of storeListeners) listener();
}

/**
 * The store switch's choice, remembered per viewer: "all" on the server and
 * through hydration, then what this browser chose last.
 */
function useStoreChoice(): [string, (store: string) => void] {
  const store = useSyncExternalStore(
    subscribeStoreChoice,
    readStoreChoice,
    () => "all",
  );
  return [store, saveStoreChoice];
}

/** Copy to the clipboard; where that is refused, a box to copy from by hand. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const id = useId();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFallback(true);
    }
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10"
        onClick={copy}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
      <DialogRoot open={fallback} onOpenChange={setFallback}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy the list</DialogTitle>
            <DialogDescription>
              This browser would not copy for us: select the text and copy it.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor={id} className="sr-only">
            The list as text
          </label>
          <Textarea
            id={id}
            data-testid="shopping-copy-text"
            readOnly
            value={text}
            rows={12}
            className="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
        </DialogContent>
      </DialogRoot>
    </>
  );
}

/** Lines typed or pasted, one per line, added as one change. */
/** The most lines one add takes (the seat's limit). */
const MAX_LINES_PER_ADD = 200;

function AddBox({ list }: { list: ShoppingList }) {
  const [text, setText] = useState("");
  const [note, setNote] = useState<string>();
  const id = useId();
  const submit = async () => {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const items = lines.slice(0, MAX_LINES_PER_ADD);
    const rest = lines.slice(MAX_LINES_PER_ADD);
    const result = await list.add({ items });
    if (!result) return;
    /* Past the limit: the rest stay in the box, and the box says so. */
    setText(rest.join("\n"));
    setNote(
      rest.length > 0
        ? `Added ${items.length}; ${rest.length} more ${rest.length === 1 ? "line is" : "lines are"} still in the box — add again.`
        : undefined,
    );
  };
  return (
    <form
      className="flex flex-wrap items-end gap-2 print:hidden"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Add to the list
      </label>
      <Textarea
        id={id}
        data-testid="shopping-add"
        value={text}
        rows={Math.min(6, Math.max(1, text.split("\n").length))}
        placeholder="Add items — one per line"
        className="min-h-10 min-w-0 flex-1 resize-none"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <Button type="submit" className="h-10" disabled={list.working}>
        Add
      </Button>
      {note && (
        <p role="status" className="basis-full text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </form>
  );
}

function StoreSwitch({
  view,
  value,
  onChange,
}: {
  view: ShoppingView;
  value: string;
  onChange(store: string): void;
}) {
  const choices = [
    { id: "all", name: "All", count: view.counts.remaining },
    ...view.stores.map((list) => ({
      id: list.store!.id,
      name: list.store!.name,
      count: list.count,
    })),
  ];
  return (
    <div
      role="group"
      aria-label="Store"
      className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 print:hidden"
    >
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          aria-pressed={value === choice.id}
          onClick={() => onChange(choice.id)}
          className={cn(
            "min-h-10 flex-1 rounded-md px-3 text-sm font-medium",
            value === choice.id
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {choice.name} <span className="text-xs">({choice.count})</span>
        </button>
      ))}
    </div>
  );
}

function RowList({
  rows,
  list,
  handlers,
}: {
  rows: ShoppingRow[];
  list: ShoppingList;
  handlers: RowHandlers;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => (
        <ShoppingRowView
          key={row.key}
          row={row}
          settings={list.settings}
          handlers={handlers}
        />
      ))}
    </ul>
  );
}

function ClearChecked({ ids, clear }: { ids: string[]; clear(): void }) {
  const count = ids.length;
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-10"
        onClick={() => setConfirming(true)}
      >
        Clear checked
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="group">
      <span className="text-sm">
        Remove {count} ticked {count === 1 ? "line" : "lines"} from the list?
      </span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="h-10"
        onClick={() => {
          setConfirming(false);
          clear();
        }}
      >
        Clear {count}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-10"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </Button>
    </div>
  );
}

function syncLabel(list: ShoppingList): string | undefined {
  switch (list.status) {
    case "pending":
    case "saving":
      return "Saving…";
    case "retrying":
      return "Not saved yet — retrying";
    default:
      return undefined;
  }
}

/**
 * The editor's shared shopping list (epic 35, 35d), mobile first: counts,
 * Copy and Settings; an add box; a store switch when stores are on; the list
 * by aisle (or one list); and folds for what is probably on hand and what is
 * ticked. The view is `buildShoppingView` over the server's items with this
 * page's pending ticks applied (D3, D9).
 */
export function ShoppingPage({
  initial,
  actions,
  patchUrl,
}: {
  initial: ShoppingListState;
  actions: ShoppingPageActions;
  /** Where batched ticks go: `/api/shopping` (a fetch can be `keepalive`). */
  patchUrl: string;
}) {
  const list = useShoppingList({ initial, actions, patchUrl });
  const [store, setStore] = useStoreChoice();

  const fullView = useMemo(
    () => buildShoppingView(list.items, list.settings, list.inventory),
    [list.items, list.settings, list.inventory],
  );
  const storesOn = list.settings.features.stores;
  const known = fullView.stores.some((each) => each.store?.id === store);
  const view =
    storesOn && store !== "all" && known
      ? viewForStore(fullView, store)
      : fullView;
  const text = useMemo(() => formatShoppingText(view), [view]);

  const handlers: RowHandlers = {
    tick: list.tick,
    update: (patch) => void list.update(patch),
    saveSettings: (patch) => void list.saveSettings(patch),
  };
  const sync = syncLabel(list);
  const showStoreHeadings = storesOn && view.stores.length > 1;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">Shopping list</h1>
          <div className="flex gap-2 print:hidden">
            <CopyButton text={text} />
            <SettingsSheet settings={list.settings} save={list.saveSettings} />
          </div>
        </div>
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
        {list.error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-md border border-destructive px-3 py-2 text-sm print:hidden"
          >
            <span className="flex-1">{list.error}</span>
            {list.pendingCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void list.flush()}
              >
                Retry
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={list.dismissError}
            >
              Dismiss
            </Button>
          </div>
        )}
      </header>

      <AddBox list={list} />

      {storesOn && (
        <StoreSwitch
          view={fullView}
          value={known ? store : "all"}
          onChange={setStore}
        />
      )}

      <div data-testid="shopping-list" className="flex flex-col gap-4">
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
            >
              {showStoreHeadings && storeList.store && (
                <h2 className="mb-1 text-lg font-bold">
                  {storeList.store.name}
                </h2>
              )}
              {storeList.sections.map((section) => (
                <section
                  key={section.aisle ?? "all"}
                  className="break-inside-avoid"
                  data-testid="shopping-aisle"
                  aria-label={section.label}
                >
                  {section.label && (
                    <h3 className="sticky-chrome top-[var(--header-height)] z-10 -mx-4 border-b border-border bg-background px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground print:static print:mx-0 print:px-0">
                      {section.label}
                    </h3>
                  )}
                  <RowList
                    rows={section.rows}
                    list={list}
                    handlers={handlers}
                  />
                </section>
              ))}
            </section>
          ),
        )}
      </div>

      {list.settings.features.onHand && view.onHand.length > 0 && (
        <details
          className="rounded-md border px-3 py-2 print:hidden"
          data-testid="shopping-probably-have"
        >
          <summary className="min-h-10 cursor-pointer py-2 font-semibold">
            Probably on hand ({view.onHand.length})
          </summary>
          <RowList rows={view.onHand} list={list} handlers={handlers} />
        </details>
      )}

      {view.checked.length > 0 && (
        <details
          className="rounded-md border px-3 py-2 print:hidden"
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
                void list.clearChecked(view.checked.flatMap((row) => row.ids))
              }
            />
          </div>
        </details>
      )}
    </div>
  );
}

export default ShoppingPage;
