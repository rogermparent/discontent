"use client";

/**
 * The note under a row the form changed (`LineMark`): 50e's "The import
 * linked this line to …" with Keep the link / Undo, and 51f's grams —
 * where they came from (Pasted, Bank, ≈ Model), why, Keep / Undo, and for
 * a pasted or model value on a measured line of ¼ cup or more, "Save to
 * the bank".
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@discontent/component-library/components/Button";
import { cn } from "@discontent/component-library/lib/utils";
import { GRAMS_SOURCE_LABEL, type LineMark } from "../../../util/lineMarks";
import { plainLine } from "./ingredientRows";

const SOURCE_BORDER = {
  link: "border-warning",
  paste: "border-info",
  bank: "border-primary",
  model: "border-warning",
} as const;

export function LineMarkNote({
  number,
  mark,
  onKeep,
  onUndo,
  onSaveToBank,
}: {
  /** The row's number, for the buttons' names. */
  number: number;
  mark: LineMark;
  onKeep: () => void;
  onUndo: () => void;
  /** "Save to the bank" (a paste's or the model's grams on a measured line). */
  onSaveToBank?: () => Promise<string>;
}) {
  const [saved, setSaved] = useState<string>();
  const [saving, setSaving] = useState(false);
  /* Keep goes once pressed: focus moves on to Undo, not to the page's
   * start (review finding 7). */
  const undoRef = useRef<HTMLButtonElement>(null);
  const keptHere = useRef(false);
  const kept = mark.source !== "link" && mark.kept;
  useEffect(() => {
    if (kept && keptHere.current) {
      keptHere.current = false;
      undoRef.current?.focus();
    }
  }, [kept]);
  if (mark.source === "link") {
    return (
      <div
        className={cn(
          "mt-1 flex flex-col gap-1.5 border-l-2 pl-2 text-sm sm:ml-[1.875rem]",
          SOURCE_BORDER.link,
        )}
        data-testid="linked-line-mark"
      >
        <p>
          The import linked this line to{" "}
          <a
            href={`/recipe/${encodeURIComponent(mark.slug)}`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {mark.name}
          </a>{" "}
          —{" "}
          {mark.how === "link"
            ? "the page links it here"
            : "the line names what it makes"}
          . It read “{plainLine(mark.before)}”.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="max-sm:h-11"
            aria-label={`Keep the link on ingredient ${number}`}
            onClick={onKeep}
          >
            Keep the link
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="max-sm:h-11"
            aria-label={`Undo the link on ingredient ${number}`}
            onClick={onUndo}
          >
            Undo
          </Button>
        </div>
      </div>
    );
  }
  const label = GRAMS_SOURCE_LABEL[mark.source];
  return (
    <div
      className={cn(
        "mt-1 flex flex-col gap-1.5 border-l-2 pl-2 text-sm sm:ml-[1.875rem]",
        mark.kept ? "border-success" : SOURCE_BORDER[mark.source],
      )}
      data-testid="grams-line-mark"
      data-source={mark.source}
      data-kept={mark.kept ? "true" : undefined}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded-sm border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground">
          {mark.kept ? `Kept · ${label.replace("≈ ", "")}` : label}
        </span>
        <span>
          {mark.grams}g{mark.why ? <> · {mark.why}</> : null}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {mark.kept ? null : (
          <Button
            variant="outline"
            size="sm"
            className="max-sm:h-11"
            aria-label={`Keep the grams on ingredient ${number}`}
            onClick={() => {
              keptHere.current = true;
              onKeep();
            }}
          >
            Keep
          </Button>
        )}
        <Button
          ref={undoRef}
          variant="ghost"
          size="sm"
          className="max-sm:h-11"
          aria-label={`Undo the grams on ingredient ${number}`}
          onClick={onUndo}
        >
          Undo
        </Button>
        {onSaveToBank && !saved ? (
          <Button
            variant="ghost"
            size="sm"
            className="max-sm:h-11"
            disabled={saving}
            aria-label={`Save ingredient ${number}'s grams to the bank`}
            onClick={async () => {
              setSaving(true);
              try {
                setSaved(await onSaveToBank());
              } finally {
                setSaving(false);
              }
            }}
          >
            Save to the bank
          </Button>
        ) : null}
        {saved ? (
          <span className="text-sm" role="status">
            {saved}
          </span>
        ) : null}
      </div>
    </div>
  );
}
