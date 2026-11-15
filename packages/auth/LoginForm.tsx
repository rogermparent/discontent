"use client";

import { useActionState } from "react";
import { FieldWrapper } from "@discontent/component-library/components/Form";
import { FormCheckbox } from "@discontent/component-library/components/Form/inputs/Checkbox";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { Input } from "@discontent/component-library/components/ui/input";
import type { LoginState } from "./next";

/**
 * The `/login` form both editors render (47e): email, password, "Remember
 * this device", and one plain message when the two don't match.
 *
 * A server action, so it works before hydration too, and the action answers
 * with a root-relative redirect: the browser never leaves the host it is on.
 */
export function LoginForm({
  action,
  redirectTo,
  notice,
  rememberDays,
}: {
  action: (state: LoginState, formData: FormData) => Promise<LoginState>;
  redirectTo: string;
  /** A status line above the form, e.g. after "Sign out everywhere". */
  notice?: string;
  rememberDays: number;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {notice && !state.error && (
        <p role="status" className="border-l-2 border-primary pl-3 text-sm">
          {notice}
        </p>
      )}
      <div aria-live="polite" aria-atomic="true">
        {state.error && (
          <p
            role="alert"
            className="border-l-2 border-destructive pl-3 text-sm font-medium"
          >
            {state.error}
          </p>
        )}
      </div>
      <FieldWrapper label="Email" id="login-email">
        <Input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          aria-invalid={state.error ? true : undefined}
        />
      </FieldWrapper>
      <FieldWrapper label="Password" id="login-password">
        <Input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={state.error ? true : undefined}
        />
      </FieldWrapper>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <FormCheckbox
            id="login-remember"
            name="remember"
            aria-describedby="login-remember-hint"
          />
          <label htmlFor="login-remember" className="text-sm font-semibold">
            Remember this device
          </label>
        </div>
        <p id="login-remember-hint" className="text-sm text-muted-foreground">
          Stay signed in on this browser for {rememberDays} days. Leave it off
          on a shared computer: you are signed out when the browser closes.
        </p>
      </div>
      <div>
        <SubmitButton pendingChildren="Signing in…">Sign in</SubmitButton>
      </div>
    </form>
  );
}
