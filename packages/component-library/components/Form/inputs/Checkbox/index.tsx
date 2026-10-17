"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Errors, FieldWrapper } from "../..";
import { Checkbox } from "../../../ui/checkbox";

type BoxProps = Omit<
  ComponentProps<typeof Checkbox>,
  "checked" | "defaultChecked" | "onCheckedChange" | "name" | "value"
>;

/**
 * The Radix `ui/checkbox` box for a form (40c), submitting and resetting as
 * the native `<input type="checkbox">` it replaced did.
 *
 * - **Submission by `name`.** A ticked, enabled box sends `name=value`
 *   (`value` is `"on"` unless given, as natively); otherwise nothing. The
 *   value travels in a hidden input of this component's own, rendered only
 *   while ticked — not Radix's hidden checkbox, which a form `reset` sets
 *   back to the box's *first* state behind the box's back, so the next
 *   submission could disagree with what the box shows.
 * - **A form `reset`** (React 19 resets a form after its action) puts an
 *   uncontrolled box back to the *current* `defaultChecked`, as natively
 *   (Radix would restore the value it mounted with), and leaves a
 *   controlled box alone — Radix would call `onCheckedChange` with its first
 *   value, undoing the owner's state (a refused save would untick the
 *   boxes it was refused with).
 *
 * The box is a `button role="checkbox"` carrying `id`, so `<label htmlFor>`,
 * a wrapping `<label>`, `getByLabel` and Playwright's `check()` all find it.
 * `onCheckedChange` gets a boolean, not a DOM event.
 */
export function FormCheckbox({
  name,
  value = "on",
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  ...props
}: BoxProps & {
  name?: string;
  value?: string;
  /** Controlled checked state; when provided the box is controlled. */
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  const controlled = checked !== undefined;
  const resetTo = defaultChecked ?? false;
  const [inner, setInner] = useState(resetTo);
  const current = controlled ? checked : inner;
  const box = useRef<HTMLButtonElement>(null);
  /* True while this box's form dispatches `reset` (Radix answers it). */
  const resetting = useRef(false);

  useEffect(() => {
    const doc = box.current?.ownerDocument;
    if (!doc) return;
    const ours = (event: Event) =>
      box.current?.form != null && event.target === box.current.form;
    /* The reset is over: take the default, and answer the box again. */
    const settle = () => {
      if (!resetting.current) return;
      resetting.current = false;
      /*
       * The default as the DOM has it now, not as this effect saw it: React
       * resets an action's form in the commit that renders the action's
       * result, before effects run, so a default that commit changed (the
       * value just saved) would still be the old one here.
       */
      if (!controlled) setInner(box.current?.dataset.defaultChecked === "true");
    };
    /*
     * `reset` bubbles: the capture listener runs before Radix's own listener
     * on the form, the bubbling one after it.
     */
    const before = (event: Event) => {
      if (!ours(event)) return;
      resetting.current = true;
      /*
       * Dispatch is synchronous, so a microtask runs after every listener:
       * the reset settles even if something stops the event before it
       * bubbles back up to `after`, and the box never ignores its changes
       * for good (40c review).
       */
      queueMicrotask(settle);
    };
    const after = (event: Event) => {
      if (ours(event)) settle();
    };
    doc.addEventListener("reset", before, true);
    doc.addEventListener("reset", after);
    return () => {
      doc.removeEventListener("reset", before, true);
      doc.removeEventListener("reset", after);
    };
  }, [controlled]);

  return (
    <>
      <Checkbox
        ref={box}
        data-default-checked={resetTo ? "true" : "false"}
        {...props}
        disabled={disabled}
        checked={current}
        onCheckedChange={(next) => {
          if (resetting.current) return;
          const ticked = next === true;
          if (!controlled) setInner(ticked);
          onCheckedChange?.(ticked);
        }}
      />
      {name !== undefined && current && !disabled && (
        <input type="hidden" name={name} value={value} />
      )}
    </>
  );
}

/**
 * A labelled checkbox field: `FormCheckbox` in the shared `FieldWrapper`
 * (40c; the native checkbox before it).
 */
export function CheckboxInput({
  name,
  id = name,
  defaultChecked,
  checked,
  onCheckedChange,
  label,
  errors,
}: {
  name: string;
  id?: string;
  label?: string;
  defaultChecked?: boolean;
  /** Controlled checked state; when provided the box is controlled. */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  errors?: string[];
}) {
  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      {/*
       * In a wrapper: `FieldWrapper`'s vertical `Field` widens every direct
       * child (`[&>*]:w-full`, later in the stylesheet than `size-4`), which
       * would stretch the box into a bar.
       */}
      <div className="flex">
        <FormCheckbox
          name={name}
          id={id}
          checked={checked}
          defaultChecked={defaultChecked}
          onCheckedChange={onCheckedChange}
        />
      </div>
    </FieldWrapper>
  );
}
