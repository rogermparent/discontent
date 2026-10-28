"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@discontent/component-library/components/ui/dialog";
import { cn } from "@discontent/component-library/lib/utils";
import type { GroupItem } from "../../controller/types";
import { PLAN_CHANGED, planItemsKey } from "../../util/planPage";
import {
  planMerge,
  resolvePlanMerge,
  type MergeSide,
  type MineRow,
  type PlanConflict,
  type PlanMergeInput,
} from "../../util/planMerge";
import type { PlanEditor } from "./types";

function refKey(item: GroupItem): string {
  return item.group !== undefined
    ? `group:${item.group}`
    : `recipe:${item.recipe}`;
}

function ChangeList({
  title,
  lines,
  testId,
}: {
  title: string;
  lines: string[];
  testId: string;
}) {
  return (
    <section className="flex flex-col gap-1" data-testid={testId}>
      <h3 className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h3>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing.</p>
      ) : (
        <ul className="m-0 list-disc pl-5 text-sm">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** One conflict: two choices, neither picked until the person picks. */
function ConflictChoice({
  conflict,
  value,
  onChange,
}: {
  conflict: PlanConflict;
  value: MergeSide | undefined;
  onChange: (side: MergeSide) => void;
}) {
  const name = useId();
  const legend =
    conflict.kind === "field"
      ? `${conflict.name}: ${conflict.field}`
      : conflict.kind === "removed"
        ? `${conflict.name}: keep or remove`
        : "The order";
  const options: [MergeSide, string][] = [
    ["mine", `Yours: ${conflict.mine}`],
    ["theirs", `Stored: ${conflict.theirs}`],
  ];
  return (
    <fieldset
      className="flex flex-col gap-1.5"
      data-testid="plan-merge-conflict"
    >
      <legend className="pb-1 text-sm font-medium">{legend}</legend>
      {options.map(([side, label]) => (
        <label
          key={side}
          className={cn(
            "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm",
            value === side && "border-primary bg-accent text-accent-foreground",
          )}
        >
          <input
            type="radio"
            name={name}
            value={side}
            checked={value === side}
            onChange={() => onChange(side)}
            className="size-4 accent-[var(--color-primary)]"
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * "Try to merge" (46h, 43-Dp1-11): offered beside a Save the plan refused
 * because its stored rows moved. It reads the stored rows, shows what each
 * side changed — rows added and removed, the order, scales, labels and
 * notes — asks about every change both sides made differently, and writes
 * the merge only on **Save merged**, through the same Save, checked against
 * the rows it merged with (a plan that moved again is read again).
 */
export function PlanMerge({
  editor,
  base,
  mine,
  baseNames,
  onMerged,
}: {
  editor: PlanEditor;
  /** The rows the draft was made over. */
  base: readonly GroupItem[];
  /** The draft's rows, each with the base row it came from. */
  mine: readonly MineRow[];
  /** Names of the page's rows, by `recipe:<slug>` / `group:<slug>`. */
  baseNames: Readonly<Record<string, string>>;
  /** The merge was written: refresh the page. */
  onMerged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stored, setStored] = useState<{
    items: GroupItem[];
    names: Record<string, string>;
  }>();
  const [choices, setChoices] = useState<Record<string, MergeSide>>({});
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [saving, setSaving] = useState(false);
  /* Written: the trigger goes with the dialog, so focus goes elsewhere. */
  const merged = useRef(false);

  /* Read the stored rows: on opening, and again if they moved meanwhile. */
  async function read() {
    setStored(undefined);
    setChoices({});
    try {
      const result = await editor.readItems();
      if ("error" in result) setError(result.error);
      else setStored(result);
    } catch {
      setError(
        "Couldn't reach the editor — check the connection and try again.",
      );
    }
  }

  const input = useMemo<PlanMergeInput | undefined>(
    () =>
      stored && {
        base,
        mine,
        theirs: stored.items,
        nameOf: (item) => {
          const key = refKey(item);
          return (
            stored.names[key] ??
            baseNames[key] ??
            item.recipe ??
            item.group ??
            "a row"
          );
        },
      },
    [stored, base, mine, baseNames],
  );
  const merge = useMemo(() => (input ? planMerge(input) : undefined), [input]);
  const unanswered = merge
    ? merge.conflicts.filter((conflict) => !choices[conflict.id]).length
    : 0;

  async function saveMerged() {
    if (!input || !stored || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const result = await editor.saveItems(
        resolvePlanMerge(input, choices),
        planItemsKey(stored.items),
      );
      if (!("error" in result)) {
        merged.current = true;
        setOpen(false);
        onMerged();
      } else if (result.error === PLAN_CHANGED) {
        /* It moved again while this was open: read it again. */
        setNote("The plan changed again — this is the newest.");
        await read();
      } else setError(result.error);
    } catch {
      setError(
        "Couldn't reach the editor — check the connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setError(undefined);
          setNote(undefined);
          setOpen(true);
          void read();
        }}
      >
        Try to merge
      </Button>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        data-testid="plan-merge"
        onCloseAutoFocus={(event) => {
          /* The page moves focus to the plan's heading (`onMerged`). */
          if (merged.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Merge with the stored plan</DialogTitle>
          <DialogDescription>
            The plan was saved somewhere else after this page opened. Here is
            what each side changed; nothing is written until Save merged.
          </DialogDescription>
        </DialogHeader>
        {note && (
          <p className="text-sm" role="status">
            {note}
          </p>
        )}
        {!merge ? (
          !error && (
            <p className="text-sm text-muted-foreground" role="status">
              Reading the stored plan…
            </p>
          )
        ) : (
          <div className="flex flex-col gap-4">
            <ChangeList
              title="Changed elsewhere"
              lines={merge.theirs}
              testId="plan-merge-theirs"
            />
            <ChangeList
              title="Your changes"
              lines={merge.mine}
              testId="plan-merge-mine"
            />
            {merge.conflicts.length > 0 && (
              <section className="flex flex-col gap-3">
                <h3 className="font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase">
                  Both changed — which to keep?
                </h3>
                {merge.conflicts.map((conflict) => (
                  <ConflictChoice
                    key={conflict.id}
                    conflict={conflict}
                    value={choices[conflict.id]}
                    onChange={(side) =>
                      setChoices((current) => ({
                        ...current,
                        [conflict.id]: side,
                      }))
                    }
                  />
                ))}
              </section>
            )}
          </div>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {merge && unanswered > 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              Choose for {unanswered} {unanswered === 1 ? "change" : "changes"}{" "}
              first.
            </span>
          )}
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={!merge || unanswered > 0 || saving}
            onClick={() => void saveMerged()}
          >
            {saving ? "Saving…" : "Save merged"}
          </Button>
        </div>
      </DialogContent>
    </DialogRoot>
  );
}
