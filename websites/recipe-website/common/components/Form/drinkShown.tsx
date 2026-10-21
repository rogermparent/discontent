"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "@tanstack/react-form";
import { useRecipeForm } from "./formContext";
import { useTagPicker } from "./Tags";
import { tagsSayDrink } from "./Tags/tagPicker";

/*
 * When the drink spec is on the page (43e2): the recipe is tagged a drink
 * (a tag under `drink`), or already has a spec, or the person asked for one
 * ("add one anyway"). Then it is the first section, and the rail lists it.
 */

interface Reveal {
  drink: boolean;
  revealDrink: () => void;
}

const RevealContext = createContext<Reveal>({
  drink: false,
  revealDrink: () => {},
});

export function RevealProvider({ children }: { children: ReactNode }) {
  const [drink, setDrink] = useState(false);
  const value = useMemo(
    () => ({ drink, revealDrink: () => setDrink(true) }),
    [drink],
  );
  return (
    <RevealContext.Provider value={value}>{children}</RevealContext.Provider>
  );
}

export function useRevealDrink(): () => void {
  return useContext(RevealContext).revealDrink;
}

export function useDrinkShown(): boolean {
  const form = useRecipeForm();
  const { model } = useTagPicker();
  const revealed = useContext(RevealContext).drink;
  const tags = useStore(form.store, (state) => state.values.tags);
  const spec = useStore(form.store, (state) =>
    Object.values(state.values.drink).some((part) => part?.trim()),
  );
  return revealed || spec || tagsSayDrink(model, tags);
}
