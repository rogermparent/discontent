"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import {
  dedupeItems,
  inventoryKey,
  parseInventoryText,
} from "../../util/inventoryText";

export interface InventoryDiff {
  add: string[];
  remove: string[];
}

/**
 * The operator's saved inventory as the signed-in editor's `/make` receives
 * it (U6): the committed list, and the action that commits an `{add,
 * remove}` diff (25d's `saveInventoryChanges`, one commit per call).
 */
export interface SavedInventoryProps {
  items: string[];
  /**
   * The saved file doesn't exist yet. A pre-U6 overlay then waits (defers)
   * rather than migrating over a list it can't see: pre-U6 the overlay was
   * laid over whatever the saved list is now, so merging it once one exists
   * is what that browser would have shown, and nothing is dropped meanwhile.
   */
  missing?: boolean;
  save: (
    diff: InventoryDiff,
  ) => Promise<{ items: string[] } | { error: string }>;
}

/**
 * What "Save to editor" would change (41h): this browser's list as the new
 * saved list, as the diff `saveInventoryChanges` commits — never the whole
 * list, so an item the agent added to the saved list after this page loaded
 * survives unless this page saw it and the browser's list dropped it.
 */
export function saveDiff(browser: string[], saved: string[]): InventoryDiff {
  const savedKeys = new Set(saved.map(inventoryKey));
  const browserKeys = new Set(browser.map(inventoryKey));
  return {
    add: browser.filter((item) => !savedKeys.has(inventoryKey(item))),
    remove: saved.filter((item) => !browserKeys.has(inventoryKey(item))),
  };
}

function preview(items: string[]): string {
  return items.slice(0, 4).join(", ") + (items.length > 4 ? "…" : "");
}

/**
 * "Save to editor"'s inline confirm (41h): what it will add and remove,
 * before it writes — then one commit. Focus moves to "Save list" when it
 * opens, and back to the button that opened it on Cancel.
 */
export function SaveConfirm({
  browser,
  saved,
  pending,
  error,
  onSave,
  onCancel,
}: {
  browser: string[];
  saved: string[];
  pending: boolean;
  error?: string;
  onSave: (diff: InventoryDiff) => void;
  onCancel: () => void;
}) {
  const headingId = useId();
  const saveRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const diff = saveDiff(browser, saved);
  const unchanged = diff.add.length === 0 && diff.remove.length === 0;
  /* On opening only: "Save list", or Cancel when there is nothing to save. */
  const firstFocus = useRef(unchanged ? cancelRef : saveRef);
  useEffect(() => firstFocus.current.current?.focus(), []);
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      data-testid="make-save-confirm"
      className="grid gap-2.5 rounded-md border border-input bg-card p-3 text-sm text-card-foreground"
    >
      <p id={headingId} className="m-0">
        Update the editor&apos;s saved list ({saved.length})?
      </p>
      <p
        className="m-0 font-mono text-xs leading-relaxed text-muted-foreground"
        data-testid="make-save-diff"
      >
        <b className="font-medium text-foreground">+{diff.add.length}</b>{" "}
        {preview(diff.add)}
        <br />−{diff.remove.length} {preview(diff.remove)}
      </p>
      <div className="flex gap-2">
        <Button
          ref={saveRef}
          type="button"
          size="sm"
          disabled={pending || unchanged}
          onClick={() => onSave(diff)}
        >
          {pending ? "Saving…" : "Save list"}
        </Button>
        <Button
          ref={cancelRef}
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      {unchanged && (
        <p className="m-0 text-xs text-muted-foreground">
          They already match: nothing to save.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * What "Add to saved list" (42a, Da1) would add: what was typed, once each,
 * less what the saved list already holds as this page sees it — so Undo
 * takes back only what the add brought.
 */
export function savedAdditions(items: string[], saved: string[]): string[] {
  const savedKeys = new Set(saved.map(inventoryKey));
  return dedupeItems(items).filter(
    (item) => !savedKeys.has(inventoryKey(item)),
  );
}

/**
 * Per-item editing of the saved list on `/make` (42a, reversing 41-Dh2),
 * for the signed-in editor only. Each call is one `{add, remove}` diff
 * through `saveInventoryChanges` — one commit — and `add` answers whether
 * it landed.
 */
export interface SavedListEdit {
  /** A write is in flight. */
  pending: boolean;
  error?: string;
  remove: (item: string) => void;
  add: (items: string[]) => Promise<boolean>;
}

/**
 * "Add to saved list" (42a, Da1): a small form under the saved list's
 * labels, read as a list like the add field ("Campari, lime"). The draft
 * clears once the commit lands and stays on a failure.
 */
export function AddToSavedForm({ edit }: { edit: SavedListEdit }) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  return (
    <form
      className="flex gap-2"
      data-testid="make-saved-add"
      onSubmit={(event) => {
        event.preventDefault();
        const { items } = parseInventoryText(draft);
        if (items.length === 0) return;
        void edit.add(items).then((ok) => {
          if (ok) setDraft("");
        });
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Add to saved list
      </label>
      <Input
        id={inputId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Add to saved list"
        autoComplete="off"
        className="h-8 font-mono text-xs"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="h-8"
        disabled={edit.pending}
      >
        Add
      </Button>
    </form>
  );
}
