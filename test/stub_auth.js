import { vi } from "vitest";

export const auth = vi.fn();
/* What a signed-out server action answers with: Auth.js's redirect. */
export const signIn = vi.fn();
