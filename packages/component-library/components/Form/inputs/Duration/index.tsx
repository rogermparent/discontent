import { ChangeEventHandler } from "react";
import { Errors, FieldWrapper } from "../..";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@discontent/component-library/components/ui/input-group";

function DurationNumberInput({
  parentName,
  parentLabel,
  childName,
  label,
  unit,
  defaultValue,
  value,
  onChange,
  placeholder,
}: {
  parentName: string;
  parentLabel?: string;
  childName: string;
  label: string;
  /** Short unit shown as a trailing addon ("h" / "m"). */
  unit: string;
  defaultValue?: number;
  /** Controlled string value; when provided the input is controlled. */
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
}) {
  const fullName = `${parentName}.${childName}`;
  // Avoid passing both value and defaultValue (React would warn / ignore one).
  const valueProps = value !== undefined ? { value } : { defaultValue };
  return (
    <div className="flex w-full flex-col flex-nowrap text-sm">
      <label htmlFor={fullName}>{label}</label>
      <InputGroup>
        <InputGroupInput
          /* The `title` is what four new-recipe.spec assertions locate these by
             (getByTitle("Prep Time Minutes")); it must survive the addon. */
          title={parentLabel ? `${parentLabel} ${label}` : label}
          type="number"
          name={fullName}
          id={fullName}
          min={0}
          {...valueProps}
          onChange={onChange}
          placeholder={placeholder}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{unit}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function DurationInput({
  name,
  id = name,
  defaultValue,
  label,
  errors,
  onHoursChange,
  onMinutesChange,
  placeholder,
  valueMinutes,
  onValueChange,
}: {
  name: string;
  id?: string;
  label?: string;
  defaultValue?: number;
  errors?: string[];
  onHoursChange?: ChangeEventHandler<HTMLInputElement>;
  onMinutesChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: number;
  /** Controlled total duration in minutes (for TanStack Form). */
  valueMinutes?: number;
  onValueChange?: (minutes: number) => void;
}) {
  const controlled = valueMinutes !== undefined;
  const defaultHours = defaultValue ? Math.floor(defaultValue / 60) : undefined;
  const defaultMinutes = defaultValue ? defaultValue % 60 : undefined;
  const placeholderHours = placeholder
    ? String(Math.floor(placeholder / 60))
    : undefined;
  const placeholderMinutes = placeholder ? String(placeholder % 60) : undefined;

  // Controlled string values for the hours/minutes sub-inputs. 0/undefined
  // render as empty (matching the old uncontrolled defaultValue behaviour).
  const hasValue = Boolean(valueMinutes);
  const hoursValue = controlled
    ? hasValue
      ? String(Math.floor((valueMinutes as number) / 60))
      : ""
    : undefined;
  const minutesValue = controlled
    ? hasValue
      ? String((valueMinutes as number) % 60)
      : ""
    : undefined;

  const handleHours: ChangeEventHandler<HTMLInputElement> = (e) => {
    const hours = Number(e.target.value) || 0;
    onValueChange?.(hours * 60 + (valueMinutes ? valueMinutes % 60 : 0));
  };
  const handleMinutes: ChangeEventHandler<HTMLInputElement> = (e) => {
    const minutes = Number(e.target.value) || 0;
    onValueChange?.(Math.floor((valueMinutes || 0) / 60) * 60 + minutes);
  };

  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <div className="flex flex-row flex-nowrap gap-2 w-full">
        <DurationNumberInput
          parentName={name}
          parentLabel={label}
          childName="hours"
          label="Hours"
          unit="h"
          defaultValue={controlled ? undefined : defaultHours}
          value={hoursValue}
          placeholder={placeholderHours}
          onChange={controlled ? handleHours : onHoursChange}
        />
        <DurationNumberInput
          parentName={name}
          parentLabel={label}
          childName="minutes"
          label="Minutes"
          unit="m"
          defaultValue={controlled ? undefined : defaultMinutes}
          value={minutesValue}
          placeholder={placeholderMinutes}
          onChange={controlled ? handleMinutes : onMinutesChange}
        />
      </div>
    </FieldWrapper>
  );
}
