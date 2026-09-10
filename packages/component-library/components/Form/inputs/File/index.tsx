import { ChangeEventHandler, forwardRef, ForwardedRef } from "react";
import { Errors, FieldWrapper } from "../..";
import { InputGroup } from "@discontent/component-library/components/ui/input-group";

function FileInputComponent(
  {
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
  },
  ref?: ForwardedRef<HTMLInputElement>,
) {
  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      {/* The file input stays a native, *uncontrolled* <input type="file"> —
          browsers do not allow setting a file input's value programmatically.
          InputGroup only supplies the border/focus treatment the wrapper used
          to hand-roll. */}
      <InputGroup className="h-auto px-3 py-2">
        <input
          type="file"
          name={name}
          id={id}
          data-slot="input-group-control"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground"
          defaultValue={defaultValue}
          onChange={onChange}
          placeholder={placeholder}
          ref={ref}
        />
      </InputGroup>
    </FieldWrapper>
  );
}

export const FileInput = forwardRef(FileInputComponent);
