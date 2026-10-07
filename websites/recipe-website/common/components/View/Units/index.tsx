"use client";

import React, { ReactNode, useMemo, useSyncExternalStore } from "react";
import type Fraction from "fraction.js";
import { cn } from "@discontent/component-library/lib/utils";
import {
  ounceAmounts,
  ratioBase,
  UNIT_MODES,
  type UnitMode,
} from "../../../util/barUnits";

/**
 * How ounce amounts read on this recipe: oz, ml or parts (27c).
 *
 * One provider per recipe view, beside `MultiplierProvider`, so the
 * ingredient list, the batching note and the focus view all read the same
 * mode. Outside a provider (a yield, an instruction) the default is plain oz,
 * which is exactly what `Multiplyable` rendered before units existed.
 */
interface UnitState {
  /** The mode in effect — `parts` falls back to `oz` with fewer than two oz lines. */
  mode: UnitMode;
  setMode: (mode: UnitMode) => void;
  /** The smallest oz amount, which reads "1 part". */
  base?: Fraction;
  /** How many oz amounts the recipe has; the toggle hides at 0. */
  ozCount: number;
}

const UnitContext = React.createContext<UnitState>({
  mode: "oz",
  setMode: () => {},
  ozCount: 0,
});

/** The reader's choice survives a reload; never required, so every access is guarded. */
const STORAGE_KEY = "recipe-unit-mode";

function readStoredMode(): UnitMode | undefined {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return (UNIT_MODES as readonly string[]).includes(value ?? "")
      ? (value as UnitMode)
      : undefined;
  } catch {
    return undefined;
  }
}

/*
 * The choice as a tiny external store, so React reads it with
 * `useSyncExternalStore`: `oz` for the server render and hydration, the stored
 * choice right after — with no setState-in-effect to cascade. `memoryMode`
 * carries the choice for the page's life when storage is blocked.
 */
let memoryMode: UnitMode | undefined;
const listeners = new Set<() => void>();

function storeMode(mode: UnitMode) {
  memoryMode = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* Private mode or blocked storage: the choice lasts this page only. */
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

const getSnapshot = (): UnitMode => memoryMode ?? readStoredMode() ?? "oz";
const getServerSnapshot = (): UnitMode => "oz";

export function UnitProvider({
  lines,
  children,
}: {
  /** The recipe's stored ingredient lines, headings included. */
  lines: string[];
  children: ReactNode;
}) {
  const chosen = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const value = useMemo<UnitState>(() => {
    const ozCount = ounceAmounts(lines).length;
    const base = ratioBase(lines);
    const mode =
      ozCount === 0 || (chosen === "parts" && ozCount < 2) ? "oz" : chosen;
    return {
      mode,
      base,
      ozCount,
      setMode: storeMode,
    };
  }, [lines, chosen]);

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnits(): UnitState {
  return React.useContext(UnitContext);
}

const LABELS: Record<UnitMode, { label: string; name: string }> = {
  oz: { label: "oz", name: "Ounces" },
  ml: { label: "ml", name: "Millilitres" },
  parts: { label: "parts", name: "Parts" },
};

/**
 * The three-way oz · ml · parts control, beside the scaler. Renders nothing
 * for a recipe with no oz lines; `parts` is offered only with two or more,
 * since a ratio needs something to be a ratio of.
 */
export function UnitToggle() {
  const { mode, setMode, ozCount } = useUnits();
  if (ozCount === 0) return null;
  const modes = UNIT_MODES.filter((m) => m !== "parts" || ozCount >= 2);
  return (
    <div
      role="group"
      aria-label="Units"
      className="inline-flex rounded-md bg-muted p-0.5 print:hidden"
    >
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          aria-label={LABELS[m].name}
          aria-pressed={mode === m}
          onClick={() => setMode(m)}
          className={cn(
            "rounded-sm px-2.5 py-1 font-mono text-sm tabular-nums transition-colors",
            mode === m
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {LABELS[m].label}
        </button>
      ))}
    </div>
  );
}
