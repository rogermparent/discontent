"use client";

import { ReactNode } from "react";

/** The only thing the shell needs from a TanStack Form instance. */
interface SubmittableForm {
  handleSubmit: () => unknown;
}

/**
 * The `<form>` wrapper for a TanStack-Form-backed content form.
 *
 * The mechanism is unusual and worth stating, because it is what keeps this
 * component tiny: **TanStack Form never serializes anything.** Every controlled
 * field also renders a real DOM input carrying a `name` (or a hidden mirror, for
 * markdown and chips), the browser builds FormData from the DOM, and TanStack
 * only keeps those `value`s in sync. There is no reconciliation step here.
 *
 * Two deliberate non-behaviours:
 *
 * - `onSubmit` does **not** `preventDefault()`. The native submission is the
 *   point; `form.handleSubmit()` runs alongside it purely so client validators
 *   fire and errors render.
 * - It does **not** gate on validity. The server stays authoritative — a form
 *   that blocked submission client-side would just be a second, weaker copy of
 *   the server's rules, free to disagree with it.
 *
 * Callers must remount this on a failed round-trip
 * (`key={state.formData ? state.message : undefined}`): `useForm` captures its
 * defaults at mount, so without the remount the echoed values never reach the
 * fields and the user's typing is silently discarded.
 */
export function FormShell({
  form,
  action,
  id,
  className,
  children,
}: {
  form: SubmittableForm;
  action: (formData: FormData) => void;
  /** DOM id, so submit buttons elsewhere on the page can target it. */
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      id={id}
      className={className}
      action={action}
      onSubmit={() => form.handleSubmit()}
    >
      {children}
    </form>
  );
}
