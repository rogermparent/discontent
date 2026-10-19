"use client";

import React, {
  ReactNode,
  Reducer,
  Suspense,
  useEffect,
  useReducer,
} from "react";
import { useSearchParams } from "next/navigation";
import Fraction from "fraction.js";
import { parseScale } from "../../../util/scale";

interface MultiplierState {
  multiplier?: Fraction;
  input?: string;
}

const MultiplierContext = React.createContext<
  [MultiplierState, React.Dispatch<string>] | undefined
>(undefined);

const multiplierInputReducer: Reducer<MultiplierState, string> = (
  state,
  input,
) => {
  if (input === state.input) {
    return state;
  }
  if (!input || input === "1") {
    return { multiplier: undefined, input };
  }
  try {
    const multiplier = new Fraction(input);
    return { multiplier, input };
  } catch {
    return state;
  }
};

/**
 * Seeds the multiplier from `?scale=` (epic 32, D4) — the link a meal-plan
 * row with a `scale` makes, and a public one anybody may share.
 *
 * Client-side, after hydration: the static export has no request to read a
 * query from, so the page is built at 1× and this moves it once the browser
 * knows the URL. `useSearchParams` makes the nearest Suspense boundary render
 * client-side only, so this component sits in a boundary of its own that
 * renders nothing — the recipe around it still prerenders whole (the MakePage
 * pattern, scoped down to the one hook). A value `parseScale` refuses (zero, a
 * negative, junk) is ignored, and the page stays at 1×.
 *
 * It runs when the query changes, not on every render, so whatever the reader
 * types or clicks afterwards wins.
 */
function ScaleFromSearchParams({
  setMultiplier,
}: {
  setMultiplier: React.Dispatch<string>;
}) {
  const scale = useSearchParams().get("scale");
  useEffect(() => {
    if (scale !== null && parseScale(scale)) setMultiplier(scale.trim());
  }, [scale, setMultiplier]);
  return null;
}

/**
 * On a drink (42c2), how many drinks the recipe makes at 1× — the scaler then
 * counts drinks (`util/drinkCount`). `undefined` for everything else, and for
 * a drink whose yield counts something other than drinks.
 */
const DrinkBaseContext = React.createContext<number | undefined>(undefined);

export function MultiplierProvider({
  children,
  drinkBase,
}: {
  children: ReactNode;
  drinkBase?: number;
}) {
  const [multiplierState, setMultiplier] = useReducer(
    multiplierInputReducer,
    {},
  );

  return (
    <MultiplierContext.Provider value={[multiplierState, setMultiplier]}>
      <DrinkBaseContext.Provider value={drinkBase}>
        <Suspense fallback={null}>
          <ScaleFromSearchParams setMultiplier={setMultiplier} />
        </Suspense>
        {children}
      </DrinkBaseContext.Provider>
    </MultiplierContext.Provider>
  );
}

/** The drink count at 1× when the scaler counts drinks (42c2). */
export function useDrinkBase(): number | undefined {
  return React.useContext(DrinkBaseContext);
}

export function useMultiplier() {
  const context = React.useContext(MultiplierContext);
  if (context === undefined) {
    throw new Error("useMultiplier must be used within a MultiplierProvider");
  }
  return context;
}
