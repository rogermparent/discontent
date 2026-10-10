"use client";

import { useId } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import type { MakeKind } from "./kinds";

/**
 * Anything / Food / Drinks (32j): a segmented control of native radios, so
 * the arrow keys move between kinds and the chips' buttons keep their names
 * to themselves ("Drinks" is also a tag chip). Each radio is transparent and
 * covers its segment, so a click lands on the input itself. Each kind shows how many
 * recipes it holds; the count stays out of the accessible name, as on chips.
 * A remembered `tag:drink` reads as the Drinks segment chosen, not as the
 * page being about drinks.
 */
export function KindSwitch({
  kinds,
  current,
  counts,
  onChange,
}: {
  kinds: MakeKind[];
  /** The kind the scope is in, if any. */
  current?: MakeKind;
  counts: Map<string, number>;
  onChange: (kind: MakeKind) => void;
}) {
  const name = useId();
  return (
    <fieldset className="mt-3 flex flex-wrap items-center gap-2">
      <legend className="sr-only">Kind of recipe</legend>
      <div
        className="inline-flex rounded-md border bg-muted/40 p-0.5"
        data-testid="make-kind"
      >
        {kinds.map((kind) => {
          const checked = current?.id === kind.id;
          return (
            <label
              key={kind.id}
              className={cn(
                "relative cursor-pointer rounded px-3 py-1 text-sm font-medium",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                checked
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                name={name}
                value={kind.id}
                checked={checked}
                onChange={() => onChange(kind)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {kind.label}
              <span className="ml-1.5 font-mono text-xs opacity-70" aria-hidden>
                {counts.get(kind.id) ?? 0}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
