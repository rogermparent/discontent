"use client";

import { useEffect, useRef, useState } from "react";
import { Errors, FieldWrapper } from "../..";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui/select";

export interface SelectOption {
  value: string;
  label: string;
  /** Indents the option in the open list (a tree, such as a term's parent). */
  depth?: number;
}

/**
 * Radix's items may not carry `""` (it means "no selection" to the Root), but
 * the forms here submit `""` for "none" — a drink with no method, a top-level
 * term, a project with no status. Such an option is this value inside the
 * control, and `""` again in what the form submits.
 */
const EMPTY = "__select-input-empty__";

const toItem = (value: string) => (value === "" ? EMPTY : value);
const fromItem = (value: string) => (value === EMPTY ? "" : value);

/**
 * A select field on the Radix `ui/select` primitive (40c), submitting by
 * `name` exactly as the native `<select>` it replaced did.
 *
 * The form value travels in a hidden `<input name>` of its own rather than
 * Radix's hidden native select, so `""` submits as `""` (see `EMPTY`) and a
 * value no option names still submits rather than being dropped. Uncontrolled
 * (`defaultValue`), it goes back to `defaultValue` on the form's `reset`, as
 * a native select does (React 19 resets a form after its action).
 *
 * The trigger carries `id`, so `<label htmlFor>` and `getByLabel` find it.
 */
export function SelectInput({
  name,
  id = name,
  defaultValue,
  value,
  onValueChange,
  label,
  errors,
  options,
  className,
}: {
  name?: string;
  id?: string;
  label?: string;
  defaultValue?: string;
  /** Controlled value; when provided the select is controlled. */
  value?: string;
  onValueChange?: (value: string) => void;
  errors?: string[];
  options: readonly SelectOption[];
  className?: string;
}) {
  /* What a native select starts on, and goes back to on a reset. */
  const resetTo = defaultValue ?? options[0]?.value ?? "";
  const [inner, setInner] = useState(resetTo);
  const current = value ?? inner;
  const hidden = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;

  useEffect(() => {
    const form = hidden.current?.form;
    if (!form || controlled) return;
    /*
     * The default as the DOM has it now (see `data-default-value`): React
     * resets an action's form in the commit that renders the action's
     * result, before effects run, so this effect's own copy could be stale.
     */
    const reset = () =>
      setInner(hidden.current?.dataset.defaultValue ?? resetTo);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [controlled, resetTo]);

  const selected = options.find((option) => option.value === current);
  return (
    <FieldWrapper label={label} id={id} className={className}>
      <Errors errors={errors} />
      <Select
        value={toItem(current)}
        onValueChange={(next) => {
          const plain = fromItem(next);
          if (value === undefined) setInner(plain);
          onValueChange?.(plain);
        }}
      >
        <SelectTrigger id={id} className="w-full bg-background">
          {/* The label from `options`, so the server render shows it too. */}
          <SelectValue>{selected?.label ?? current}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={toItem(option.value)}
              style={
                option.depth
                  ? { paddingLeft: `${0.5 + option.depth}rem` }
                  : undefined
              }
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name !== undefined && (
        <input
          type="hidden"
          name={name}
          value={current}
          data-default-value={resetTo}
          ref={hidden}
        />
      )}
    </FieldWrapper>
  );
}
