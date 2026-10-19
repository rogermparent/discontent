"use client";

import { useEffect, useId, useRef, useState } from "react";
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
import { rowsHolding } from "../../util/shoppingPage";
import type {
  ShoppingRow,
  ShoppingSubRecipeGroup,
  ShoppingView,
} from "../../util/shoppingView";
import { ShoppingRowView, type RowHandlers } from "./ShoppingRowView";
import type { ShoppingMode } from "./shopState";
import type { ShoppingList } from "./useShoppingList";

/*
 * The pieces both of `/shopping`'s layouts use (42g): the list's own
 * controls from epic 35 and 38–39, moved here unchanged in behaviour so the
 * at-home and in-store views can place them where each needs them.
 */

/** "1 line", "3 lines". */
export function lineCount(count: number): string {
  return `${count} ${count === 1 ? "line" : "lines"}`;
}

/** The muted, card-raised panel the at-home view is built from (the canvas). */
export const panelClass = "rounded-lg border border-border bg-card px-4 py-3.5";

/** Plan / Shop: the page's two jobs (42g). */
export function ModeSwitch({
  mode,
  onChange,
  className,
}: {
  mode: ShoppingMode;
  onChange(mode: ShoppingMode): void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Mode"
      data-testid="shopping-mode"
      className={cn(
        "flex shrink-0 gap-0.5 rounded-lg bg-muted p-[3px] print:hidden",
        className,
      )}
    >
      {(["plan", "shop"] as const).map((each) => (
        <button
          key={each}
          type="button"
          aria-pressed={mode === each}
          onClick={() => onChange(each)}
          className={cn(
            "min-h-9 rounded-md px-3 text-sm",
            mode === each
              ? "bg-background font-semibold text-foreground shadow-sm"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          {each === "plan" ? "Plan" : "Shop"}
        </button>
      ))}
    </div>
  );
}

/** Copy to the clipboard; where that is refused, a box to copy from by hand. */
export function CopyButton({ text }: { text: string }) {
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

/** The most lines one add takes (the seat's limit). */
const MAX_LINES_PER_ADD = 200;

/** Lines typed or pasted, one per line, added as one change. */
export function AddBox({
  list,
  hint,
}: {
  list: ShoppingList;
  /** A line under the box ("Plans and recipes add from their own pages."). */
  hint?: string;
}) {
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
      {hint && (
        <p className="basis-full text-xs text-muted-foreground">{hint}</p>
      )}
      {note && (
        <p role="status" className="basis-full text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </form>
  );
}

/** The store buttons of the at-home list (epic 35): all, or one store. */
export function StoreSwitch({
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

export function RowList({
  rows,
  list,
  handlers,
  variant,
}: {
  rows: ShoppingRow[];
  list: ShoppingList;
  handlers: RowHandlers;
  variant?: "plan" | "shop";
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {rows.map((row) => (
        <ShoppingRowView
          key={row.key}
          row={row}
          settings={list.settings}
          handlers={handlers}
          variant={variant}
        />
      ))}
    </ul>
  );
}

export function ClearChecked({ ids, clear }: { ids: string[]; clear(): void }) {
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

/**
 * Held ticks (38d, the `holdTicks` switch): ticks stay on this device until
 * this button saves them all as one change. A failure keeps them, and the
 * banner above says so. The at-home view's; the store has its bottom bar.
 */
export function DoneShopping({
  list,
  rows,
}: {
  list: ShoppingList;
  rows: number;
}) {
  const [saved, setSaved] = useState<number>();
  const saving = list.status === "saving";
  const done = async () => {
    const count = rows;
    setSaved(undefined);
    if (await list.done()) setSaved(count);
  };
  let text = "Ticks stay on this device until you're done.";
  if (list.pendingCount > 0) {
    text = `${lineCount(rows)} ticked on this device, not saved yet.`;
  } else if (saved !== undefined) {
    text = `Saved ${lineCount(saved)}.`;
  }
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm print:hidden"
      data-testid="shopping-done"
    >
      <span className="flex-1" role="status">
        {text}
      </span>
      <Button
        type="button"
        size="sm"
        className="h-10"
        disabled={list.pendingCount === 0 || saving}
        onClick={() => void done()}
      >
        {saving ? "Saving…" : "Done shopping"}
      </Button>
    </div>
  );
}

/**
 * 39-D3: held ticks over a week old were dropped instead of sent — one line,
 * dismissible, so a tick left on a phone for weeks never replays over what
 * other devices have done since, and the shopper knows to tick again.
 */
export function ExpiredTicks({
  count,
  dismiss,
}: {
  count: number;
  dismiss(): void;
}) {
  /*
   * Always mounted, its live region empty until there is something to say:
   * a region that arrives already filled in goes unannounced by many screen
   * readers. Empty, it is `sr-only` — out of the header's flow and gap.
   */
  return (
    <div
      className={
        count > 0
          ? "flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm print:hidden"
          : "sr-only"
      }
      data-testid="shopping-expired-ticks"
    >
      <span className="flex-1" role="status">
        {count === 1 &&
          "Dropped a tick this device held for over a week — tick again what you bought."}
        {count > 1 &&
          `Dropped ticks on ${count} lines this device held for over a week — tick again what you bought.`}
      </span>
      {count > 0 && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-10"
          onClick={dismiss}
        >
          Dismiss
        </Button>
      )}
    </div>
  );
}

/** A refused write or an unreachable editor, with Retry for held ticks. */
export function ErrorBanner({ list }: { list: ShoppingList }) {
  if (!list.error) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-md border border-destructive px-3 py-2 text-sm print:hidden"
    >
      <span className="flex-1">{list.error}</span>
      {list.pendingCount > 0 && !list.holding && (
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
  );
}

/**
 * "Remove these", then the question in place, as one change on Remove. The
 * question takes focus (on Cancel), and Cancel gives it back (39c).
 */
export function ConfirmRemove({
  label,
  question,
  disabled,
  onRemove,
  className,
}: {
  /** The rest of the button's name, for a screen reader: " lines for …". */
  label: string;
  question: string;
  disabled?: boolean;
  onRemove(): void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const questionId = useId();
  const removeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  /* Where focus goes after the next render: into the question, or back. */
  const focusNext = useRef<"cancel" | "remove" | undefined>(undefined);
  useEffect(() => {
    const target = focusNext.current;
    focusNext.current = undefined;
    if (target === "cancel") cancelRef.current?.focus();
    if (target === "remove") removeRef.current?.focus();
  }, [confirming]);
  if (!confirming) {
    return (
      <Button
        ref={removeRef}
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-10", className)}
        onClick={() => {
          focusNext.current = "cancel";
          setConfirming(true);
        }}
      >
        Remove these<span className="sr-only">{label}</span>
      </Button>
    );
  }
  return (
    <span
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-labelledby={questionId}
    >
      <span className="text-sm" id={questionId}>
        {question}
      </span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="h-10"
        disabled={disabled}
        onClick={() => {
          setConfirming(false);
          onRemove();
        }}
      >
        Remove
      </Button>
      <Button
        ref={cancelRef}
        type="button"
        variant="ghost"
        size="sm"
        className="h-10"
        onClick={() => {
          focusNext.current = "remove";
          setConfirming(false);
        }}
      >
        Cancel
      </Button>
    </span>
  );
}

/**
 * 39c: undo a sub-recipe's expansion (38d). One row per sub-recipe on the
 * list — "for Simple Syrup · 2 lines · in Lemonade", counting the rows it is
 * on as the page shows them (39-Dc7) — whose "Remove these" takes every item
 * it put there, ticked or not, as one change. Shown whatever the
 * `subRecipes` switch says: it governs adds, and these lines are already on
 * the list. The linking line ("1 batch Simple Syrup") is not put back:
 * nothing stored says how it read (39-Dc2). A panel at home (42g).
 */
export function SubRecipes({
  groups,
  view,
  list,
}: {
  groups: ShoppingSubRecipeGroup[];
  /** The whole list's view, to count the rows each sub-recipe is on. */
  view: ShoppingView;
  list: ShoppingList;
}) {
  const headingId = useId();
  return (
    <section
      className={cn(panelClass, "print:hidden")}
      aria-labelledby={headingId}
      data-testid="shopping-subrecipes"
    >
      <h2 id={headingId} className="font-semibold">
        Sub-recipes ({groups.length})
      </h2>
      <p className="mb-1 text-xs text-muted-foreground">
        Lines added for a recipe that another one links. Have it already, or
        buying it ready-made? Remove its lines.
      </p>
      <ul className="flex flex-col divide-y divide-border border-t border-border">
        {groups.map((group) => {
          const rows = rowsHolding(view, new Set(group.ids));
          return (
            <li
              key={group.slug}
              className="flex flex-wrap items-center gap-2 py-2"
              data-testid="shopping-subrecipe"
            >
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">for {group.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {lineCount(rows)}
                  {group.usedBy.length > 0 &&
                    ` · in ${group.usedBy.join(", ")}`}
                </span>
              </span>
              <ConfirmRemove
                label={` lines for ${group.name}`}
                question={`Remove what ${group.name} added to ${lineCount(rows)}?`}
                disabled={list.working}
                onRemove={() =>
                  void list.removeSubRecipe(group.slug, group.ids)
                }
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function syncLabel(
  list: ShoppingList,
  held: number,
): string | undefined {
  switch (list.status) {
    case "held":
      return `${lineCount(held)} not saved yet`;
    case "pending":
    case "saving":
      return "Saving…";
    case "retrying":
      return "Not saved yet — retrying";
    default:
      return undefined;
  }
}
