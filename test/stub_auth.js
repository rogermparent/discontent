import { vi } from "vitest";

export const auth = vi.fn();
/* What a signed-out page or server action answers with: off to `/login`. */
export const redirectToLogin = vi.fn();
export const startSignIn = vi.fn();
export const signOut = vi.fn();
export const signOutEverywhere = vi.fn();
export const signInWithPassword = vi.fn();
