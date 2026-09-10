import { ChangeEventHandler, FocusEventHandler } from "react";
import { Errors, FieldWrapper } from "../..";
import { Input } from "@discontent/component-library/components/ui/input";

export function TextInput({
  name,
  id = name,
  defaultValue,
  onChange,
  onBlur,
  label,
  placeholder,
  errors,
  list,
  value,
}: {
  name: string;
  id?: string;
  label?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  placeholder?: string;
  errors?: string[];
  list?: string;
  value?: string;
}) {
  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <Input
        type="text"
        name={name}
        id={id}
        defaultValue={defaultValue}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        list={list}
        value={value}
      />
    </FieldWrapper>
  );
}
