"use client";

import { useState, type KeyboardEvent } from "react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { Input } from "@discontent/component-library/components/ui/input";

/**
 * The subset of a TanStack array-field API this needs. Taking the *field*
 * rather than the form instance is deliberate: it keeps this component free of
 * any form's value types, so a second content type can use it without the
 * generic gymnastics that threading a whole `useForm` result would require.
 * Callers own the `<form.Field name=… mode="array">` wrapper and the
 * `FieldWrapper` around it, which is also what keeps the emitted DOM identical
 * to the recipe implementation this was promoted from.
 */
export interface ChipsArrayField {
  state: { value?: string[] };
  pushValue: (value: string) => void;
  removeValue: (index: number) => void;
}

/**
 * Free-form chips backed by the TanStack array-field pattern.
 *
 * The submission mechanism is the load-bearing part: the visible draft input
 * has **no `name`**, and each committed chip renders its own hidden
 * `name[i]` input. If the draft carried a name, whatever the user had
 * half-typed when they hit Submit would be posted as an extra value.
 *
 * Typing and pressing Enter or comma commits a chip; Backspace on an empty
 * draft removes the last one; blur commits a pending draft so a value typed and
 * then abandoned is not silently lost.
 */
export function ChipsInput({
  field,
  name,
  id,
  itemLabel = "tag",
  suggestions = [],
  normalize = (raw: string) => raw.trim(),
  placeholder,
}: {
  field: ChipsArrayField;
  /** FormData key. Chips submit as `name[0]`, `name[1]`, … */
  name: string;
  id?: string;
  /** Singular noun used to build accessible names ("Remove tag spicy"). */
  itemLabel?: string;
  /** Existing values offered as one-click quick-adds, minus those already set. */
  suggestions?: string[];
  normalize?: (raw: string) => string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const items = field.state.value ?? [];

  const commit = (raw: string) => {
    const value = normalize(raw);
    if (value && !items.includes(value)) {
      field.pushValue(value);
    }
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && items.length > 0) {
      field.removeValue(items.length - 1);
    }
  };

  const unused = suggestions.filter((value) => !items.includes(value));

  return (
    <>
      <div
        className="flex flex-row flex-wrap items-center gap-1.5"
        aria-label={`Selected ${itemLabel}s`}
      >
        {items.map((value, index) => (
          <Badge key={`${value}-${index}`} variant="secondary">
            <input type="hidden" name={`${name}[${index}]`} value={value} />
            {value}
            <button
              type="button"
              onClick={() => field.removeValue(index)}
              aria-label={`Remove ${itemLabel} ${value}`}
              className="ml-0.5 rounded-full outline-none focus-visible:ring-ring/50 focus-visible:ring-2 hover:text-destructive"
            >
              ×
            </button>
          </Badge>
        ))}
        <Input
          id={id}
          aria-label={`Add a ${itemLabel}`}
          className="h-8 min-w-32 grow py-1"
          value={draft}
          placeholder={placeholder ?? `Add a ${itemLabel}…`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && commit(draft)}
        />
      </div>
      {unused.length > 0 && (
        <div
          className="flex flex-row flex-wrap items-center gap-1.5 mt-1.5"
          aria-label={`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} suggestions`}
        >
          {unused.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => commit(value)}
              aria-label={`Add ${itemLabel} ${value}`}
              className="rounded-md focus-visible:outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            >
              <Badge
                variant="outline"
                className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
              >
                + {value}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default ChipsInput;
