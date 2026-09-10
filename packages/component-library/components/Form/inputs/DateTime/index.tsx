import { useState } from "react";
import { Errors, FieldWrapper } from "../..";
import { Input } from "@discontent/component-library/components/ui/input";

export function DateTimeInput({
  name,
  id = name,
  date,
  label,
  currentTimezone,
  errors,
  onValueChange,
}: {
  name: string;
  id?: string;
  label: string;
  date?: number;
  currentTimezone?: string;
  errors?: string[];
  /**
   * Reports the parsed epoch (or undefined) so a form can own the value. The
   * datetime-local input itself stays uncontrolled — controlling it is
   * timezone-fragile, and the canonical value flows up via this callback.
   */
  onValueChange?: (epoch: number | undefined) => void;
}) {
  const [currentDate, setCurrentDate] = useState(date);
  const dateObject =
    currentDate === undefined ? undefined : new Date(currentDate);
  return (
    <FieldWrapper label={label} id={id}>
      <Errors errors={errors} />
      <Input
        step="any"
        name={name}
        id={id}
        type="datetime-local"
        defaultValue={dateObject?.toISOString().slice(0, -1) || undefined}
        onChange={(e) => {
          const value = e.target?.value;
          if (value) {
            const parsedDate = Date.parse(value + "Z");
            if (!Number.isNaN(parsedDate)) {
              setCurrentDate(parsedDate);
              onValueChange?.(parsedDate);
              return undefined;
            }
          }
          setCurrentDate(undefined);
          onValueChange?.(undefined);
        }}
      />
      <div className="text-sm font-semibold italic h-4 my-0.5">
        {currentTimezone && currentDate && (
          <>
            {dateObject?.toLocaleString()} ({currentTimezone})
          </>
        )}
      </div>
    </FieldWrapper>
  );
}
