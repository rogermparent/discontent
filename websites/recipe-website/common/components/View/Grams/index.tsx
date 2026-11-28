"use client";

/**
 * "Show grams" on the recipe page (51f, Roger's answer 6): a view-time
 * toggle, like the drinks' oz · ml · parts (`../Units`). With it on, a line
 * measured in cups or spoons that stores no grams shows the bank's grams
 * after it, marked ≈ and scaled with the multiplier; a line that stores
 * grams shows them as it always does. Nothing is saved — the reader's
 * choice only, kept in this browser.
 *
 * The grams are worked out on the server (`viewGrams` over the gram bank,
 * in `RecipeView`), so the bank never ships to the browser; this module
 * holds only the choice and each line's number.
 */
import React, { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@discontent/component-library/lib/utils";
import { Multiplyable } from "../Multiplier/Multiplyable";

interface ViewGrams {
  shown: boolean;
  setShown: (shown: boolean) => void;
  /** Each line's estimate, by its place; null where there is none. */
  grams: readonly (number | null)[];
  /** Whether any line has one: the toggle hides without. */
  any: boolean;
}

const ViewGramsContext = React.createContext<ViewGrams>({
  shown: false,
  setShown: () => {},
  grams: [],
  any: false,
});

const STORAGE_KEY = "recipe-show-grams";

let memory: boolean | undefined;
const listeners = new Set<() => void>();

function readStored(): boolean | undefined {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "1" ? true : value === "0" ? false : undefined;
  } catch {
    return undefined;
  }
}

function store(shown: boolean) {
  memory = shown;
  try {
    window.localStorage.setItem(STORAGE_KEY, shown ? "1" : "0");
  } catch {
    /* Blocked storage: the choice lasts this page only. */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const getSnapshot = () => memory ?? readStored() ?? false;
const getServerSnapshot = () => false;

export function ViewGramsProvider({
  grams = [],
  children,
}: {
  grams?: readonly (number | null)[];
  children: ReactNode;
}) {
  const chosen = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const value = useMemo<ViewGrams>(() => {
    const any = grams.some((each) => each !== null);
    return { shown: any && chosen, setShown: store, grams, any };
  }, [grams, chosen]);
  return (
    <ViewGramsContext.Provider value={value}>
      {children}
    </ViewGramsContext.Provider>
  );
}

export function useViewGrams(): ViewGrams {
  return React.useContext(ViewGramsContext);
}

/** "As written · Show grams", beside the scaler; nothing without estimates. */
export function ShowGramsToggle() {
  const { shown, setShown, any } = useViewGrams();
  if (!any) return null;
  const option = (value: boolean, label: string) => (
    <button
      type="button"
      aria-pressed={shown === value}
      onClick={() => setShown(value)}
      className={cn(
        "rounded-sm px-2.5 py-1 text-sm transition-colors",
        shown === value
          ? "bg-card text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label="Grams"
      className="inline-flex rounded-md bg-muted p-0.5 print:hidden"
      data-testid="show-grams"
    >
      {option(false, "As written")}
      {option(true, "Show grams")}
    </div>
  );
}

/** A line's estimate, when "Show grams" is on: " ≈ 426g", scaled. */
export function GramsEstimate({ line }: { line: number }) {
  const { shown, grams } = useViewGrams();
  const estimate = grams[line];
  if (!shown || estimate === null || estimate === undefined) return null;
  return (
    <span
      className="shrink-0 font-mono text-[0.9em] whitespace-nowrap text-muted-foreground tabular-nums"
      data-testid="grams-estimate"
    >
      <span aria-hidden>≈ </span>
      <span className="sr-only">about </span>
      <Multiplyable baseNumber={String(estimate)} />g
    </span>
  );
}
