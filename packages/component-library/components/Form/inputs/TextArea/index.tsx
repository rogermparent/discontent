import { ChangeEventHandler } from "react";
import { Errors, FieldWrapper } from "../..";
import { Textarea } from "@discontent/component-library/components/ui/textarea";

export function TextAreaInput({
  name,
  id = name,
  defaultValue,
  value,
  onChange,
  label,
  errors,
}: {
  name?: string;
  id?: string;
  label?: string;
  defaultValue?: string;
  /** Controlled value; when provided the textarea is controlled. */
  value?: string;
  onChange?: ChangeEventHandler<HTMLTextAreaElement>;
  errors?: string[];
}) {
  // Avoid passing both value and defaultValue (React would warn / ignore one).
  const valueProps = value !== undefined ? { value } : { defaultValue };
  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <Textarea
        name={name}
        id={id}
        className="h-40 grow"
        {...valueProps}
        onChange={onChange}
      />
    </FieldWrapper>
  );
}
