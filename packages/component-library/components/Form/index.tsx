import { ReactNode } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import { Label as UILabel } from "@discontent/component-library/components/ui/label";
import {
  Field,
  FieldError,
} from "@discontent/component-library/components/ui/field";

/**
 * The form field vocabulary every content-engine site writes against.
 *
 * These are thin adapters over the shadcn primitives (`ui/field`, `ui/label`,
 * `ui/input`, `ui/textarea`) rather than a parallel system. Before this, a
 * hand-written `baseInputStyle` string was spread across 18 files and had
 * already drifted — Video/index.tsx had wandered onto ad-hoc classes, and the
 * padding differed between inputs that sit side by side.
 *
 * The `id`/`htmlFor` plumbing is load-bearing and deliberately unchanged: ~116
 * `getByLabel(...)` calls in the Playwright suites resolve through it, so the
 * association must keep working exactly as it did.
 */

/**
 * Field *shell* styling for the two elements that must look like a form field
 * but aren't an `<input>`: the Lexical editor's contentEditable shell, and the
 * native `<select>`.
 *
 * Everything that *is* an input or textarea now renders `ui/input` /
 * `ui/textarea` instead. That is the fix for the original problem — this string
 * used to be spread across 18 call sites, each appending its own padding
 * (`px-2 py-1`, `px-1`, `p-1`, `py-0.5 px-2`…), so fields sitting next to each
 * other didn't line up. Do not reach for this to style a new input.
 */
export const baseInputStyle =
  "text-foreground bg-background border border-input rounded-md outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <UILabel htmlFor={htmlFor} className={cn("py-1 font-semibold", className)}>
      {children}
    </UILabel>
  );
}

export function FieldWrapper({
  label,
  id,
  className,
  children,
}: {
  label?: string;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Field className={cn("mb-1 gap-0", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {children}
    </Field>
  );
}

/**
 * Server- and client-side field errors.
 *
 * Stays an `aria-live` region rather than becoming `ui/field`'s `FieldError`:
 * these render on a server round-trip *after* the page has settled, so a
 * screen-reader user is only told about them if the region announces. Renders
 * nothing (not an empty live region) when there are no errors.
 */
export function Errors({ errors }: { errors?: string[] }) {
  return (
    errors && (
      <div aria-live="polite" aria-atomic="true">
        {errors.map((error: string) => (
          <FieldError className="mt-2 text-sm" key={error}>
            {error}
          </FieldError>
        ))}
      </div>
    )
  );
}
