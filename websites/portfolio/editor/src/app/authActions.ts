"use server";

import type { LoginState } from "@discontent/auth/next";
import {
  signInWithPassword,
  signOut,
  signOutEverywhere,
  startSignIn,
} from "@/auth";

/*
 * The sign-in surfaces' server actions (47e). Next checks a server action's
 * Origin against its Host before any of these run.
 */

export async function signInAction(
  state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  return signInWithPassword(state, formData);
}

/** The masthead Sign In: `/login`, then back to this page. */
export async function startSignInAction(): Promise<void> {
  await startSignIn();
}

export async function signOutAction(redirectTo?: string): Promise<void> {
  await signOut(redirectTo);
}

/** Settings. */
export async function signOutEverywhereAction(): Promise<void> {
  await signOutEverywhere();
}
