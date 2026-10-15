"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { Input } from "@discontent/component-library/components/ui/input";
import { inventoryKey, parseInventoryText } from "../../util/inventoryText";

export interface InventoryDiff {
  add: string[];
  remove: string[];
}

/**
 * The operator's saved inventory as the signed-in editor's `/make` receives
 * it (U6): the committed list, what to call the group it feeds, and the
 * action that commits an `{add, remove}` diff (25d's
 * `saveInventoryChanges`, one commit per call).
 */
export interface SavedInventoryProps {
  items: string[];
  label: string;
  save: (
    diff: InventoryDiff,
  ) => Promise<{ items: string[] } | { error: string }>;
}

/**
 * "Your saved inventory (N)" (U6) — the signed-in editor's list, below this
 * browser's and folded away: it is no longer what `/make` leads with, only
 * what its secondary group judges. Every change commits at once, as a diff
 * (never the whole list, so a save can't drop what the agent added
 * meanwhile); the two bridge buttons copy one list into the other.
 */
export function SavedInventoryEditor({
  items,
  have,
  onSaved,
  onCopyToBrowser,
  save,
}: {
  items: string[];
  /** This browser's list. */
  have: string[];
  onSaved: (items: string[]) => void;
  onCopyToBrowser: (items: string[]) => void;
  save: SavedInventoryProps["save"];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState("");
  const inputId = useId();

  const savedKeys = useMemo(() => new Set(items.map(inventoryKey)), [items]);
  const haveKeys = useMemo(() => new Set(have.map(inventoryKey)), [have]);
  const browserOnly = have.filter((item) => !savedKeys.has(inventoryKey(item)));
  const savedOnly = items.filter((item) => !haveKeys.has(inventoryKey(item)));

  const commit = (diff: InventoryDiff) =>
    startTransition(async () => {
      const result = await save(diff);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError(undefined);
      onSaved(result.items);
    });

  return (
    <details
      className="rounded-md border px-3 py-2"
      data-testid="saved-inventory"
    >
      <summary className="cursor-pointer text-xs font-semibold">
        Your saved inventory ({items.length})
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-xs">
        <p className="text-muted-foreground">
          Kept in the content repository for the agent and the CLI. What it adds
          shows apart from this browser&apos;s results.
        </p>
        {items.length > 0 && (
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label="Saved inventory"
            data-testid="saved-inventory-chips"
          >
            {items.map((item) => (
              <li
                key={inventoryKey(item)}
                className="inline-flex items-center rounded-full border"
              >
                <span className="pl-2.5 pr-1 py-0.5">{item}</span>
                <button
                  type="button"
                  aria-label={`Remove ${item} from your saved inventory`}
                  disabled={pending}
                  className="mr-1 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => commit({ add: [], remove: [item] })}
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
            const { items: parsed } = parseInventoryText(draft);
            if (parsed.length > 0) commit({ add: parsed, remove: [] });
            setDraft("");
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Add to your saved inventory
          </label>
          <Input
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add to saved"
            autoComplete="off"
            className="h-8 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={pending}
          >
            Add
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-xs"
            disabled={pending || browserOnly.length === 0}
            onClick={() => commit({ add: browserOnly, remove: [] })}
          >
            Save this browser&apos;s list to it
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            disabled={pending || savedOnly.length === 0}
            onClick={() => onCopyToBrowser(savedOnly)}
          >
            Copy it to this browser
          </Button>
        </div>
        <p role="status" className="text-muted-foreground">
          {pending ? "Saving…" : ""}
        </p>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
