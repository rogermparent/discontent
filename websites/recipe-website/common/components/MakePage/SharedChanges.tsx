"use client";

import { useState, useTransition } from "react";
import { Button } from "@discontent/component-library/components/ui/button";

export interface InventoryDiff {
  add: string[];
  remove: string[];
}

/**
 * "N changes on this browser — Save to shared list / Discard" (25d).
 *
 * Shown only on the signed-in editor, and only when this browser's overlay
 * actually differs from the shared list. Save sends the diff — never the
 * whole list — so it can't undo an item someone else added meanwhile; on
 * success the caller adopts the answered list and clears the overlay.
 */
export function SharedChanges({
  diff,
  onSave,
  onDiscard,
}: {
  diff: InventoryDiff;
  onSave: (diff: InventoryDiff) => Promise<string | undefined>;
  onDiscard: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const count = diff.add.length + diff.remove.length;
  if (count === 0) return null;

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-primary/40 p-2 text-xs"
      data-testid="inventory-pending"
    >
      <p role="status">
        {count} {count === 1 ? "change" : "changes"} on this browser
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(await onSave(diff));
            })
          }
        >
          {pending ? "Saving…" : "Save to shared list"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onDiscard}
        >
          Discard
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
