"use client";

import { createContext, useContext } from "react";

/**
 * Whether the viewer is the signed-in owner, for client surfaces that offer
 * an editor action (43s: "Import a recipe" when a search finds nothing).
 * `AppProviders` sets it from the editor's session; the reader export never
 * does, so the value there is always `false` and an owner action is
 * structurally absent.
 */
const OwnerContext = createContext(false);

export const OwnerProvider = OwnerContext.Provider;

export function useIsOwner(): boolean {
  return useContext(OwnerContext);
}
