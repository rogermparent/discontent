import { ChangeEventHandler } from "react";
import { Errors, FieldWrapper } from "../..";

export function CheckboxInput({
  name,
  id = name,
  defaultChecked,
  checked,
  onChange,
  label,
  placeholder,
  errors,
  list,
}: {
  name: string;
  id?: string;
  label?: string;
  defaultChecked?: boolean;
  /** Controlled checked state; when provided the input is controlled. */
  checked?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  errors?: string[];
  list?: string;
}) {
  // Avoid passing both checked and defaultChecked (React would warn).
  const checkedProps = checked !== undefined ? { checked } : { defaultChecked };
  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      {/*
       * Deliberately a native checkbox, not ui/checkbox.
       *
       * The defect here was `baseInputStyle` — a *text field's* border, radius
       * and focus ring painted onto a checkbox, which drew a rounded box around
       * the native control. Removing it is the fix. Swapping in the Radix
       * primitive would change this component's public API from
       * onChange(ChangeEvent) to onCheckedChange(boolean) at every call site,
       * which is a much larger change than the bug warrants — and a native
       * checkbox is already the right thing for a form that submits FormData.
       */}
      <input
        type="checkbox"
        name={name}
        id={id}
        className="size-4 accent-primary self-start outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        {...checkedProps}
        onChange={onChange}
        placeholder={placeholder}
        list={list}
      />
    </FieldWrapper>
  );
}
