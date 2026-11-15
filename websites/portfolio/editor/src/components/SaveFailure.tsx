"use client";

import { useState } from "react";

/**
 * Why a save did not happen (47b): a refused image import URL, a slug
 * taken, the repository busy. A successful save redirects, so a message
 * here is always a failure.
 *
 * `state` is the form's `useActionState` value, a new object per
 * submission. Each new one remounts the alert (its `key`), so a screen
 * reader announces a second, identical failure too, which it would not if
 * the same text simply stayed in place.
 */
export function SaveFailure({ state }: { state: { message?: string } }) {
  const [shown, setShown] = useState(state);
  const [attempt, setAttempt] = useState(0);
  if (shown !== state) {
    setShown(state);
    setAttempt(attempt + 1);
  }
  if (!state.message) return null;
  return (
    <p key={attempt} role="alert" className="text-sm text-destructive my-1">
      {state.message}
    </p>
  );
}
