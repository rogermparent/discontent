import { ChangeEventHandler, ReactNode } from "react";
import { Errors, FieldWrapper, baseInputStyle } from "../..";
import clsx from "clsx";

export function SelectInput({
  name,
  id = name,
  defaultValue,
  value,
  label,
  errors,
  children,
  onChange,
}: {
  name?: string;
  id?: string;
  label?: string;
  defaultValue?: string;
  /** Controlled value; when provided the select is controlled. */
  value?: string;
  errors?: string[];
  children: ReactNode;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
}) {
  // Avoid passing both value and defaultValue (React would warn / ignore one).
  const valueProps = value !== undefined ? { value } : { defaultValue };
  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <select
        name={name}
        id={id}
        className={clsx(baseInputStyle, "px-2 py-1")}
        {...valueProps}
        onChange={onChange}
      >
        {children}
      </select>
    </FieldWrapper>
  );
}
