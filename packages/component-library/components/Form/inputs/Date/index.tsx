import { ChangeEventHandler } from "react";
import { Errors, FieldWrapper } from "../..";
import { Input } from "@discontent/component-library/components/ui/input";

export function DateInput({
  name,
  id = name,
  defaultValue,
  onChange,
  label,
  placeholder,
  errors,
}: {
  name: string;
  id?: string;
  label: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  errors?: string[];
}) {
  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <Input
        type="date"
        name={name}
        id={id}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder={placeholder}
      />
    </FieldWrapper>
  );
}
