"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@discontent/component-library/components/ui/toggle-group";
import { cn } from "@discontent/component-library/lib/utils";
import type { Recipe } from "../../../controller/types";
import { ScaledYield } from "../Multiplier";
import {
  ALL_OPTIONS,
  formatPickParam,
  hasChoices,
  knownPicks,
  parsePickParam,
  pickStorageKey,
  PICK_PARAM,
  readStoredPicks,
  shownPath,
  writeStoredPicks,
  type ChoiceSet,
  type Choices,
  type Picks,
  type ShownPath,
} from "../../../util/alternatives";

/**
 * The reader's pick among a recipe's alternatives (45e, G3), shared by every
 * part of the recipe view that changes with it: the steps and their
 * numbers, the ingredient rail, the heads-up notes, the yield, the cook
 * view and "Add to list".
 *
 * **The server renders the default** (G2) and so does the first client
 * render, so the HTML matches (U1). After hydration the pick a link names
 * (`?pick=`) wins, then the one this device remembers (localStorage, per
 * recipe); choosing one remembers it and writes it into the address, so
 * the address can be shared. Only the steps and their lines change when it
 * applies — nothing above them moves.
 *
 * A recipe with no sets has one path and nothing here does anything: the
 * path is every step and line, numbered as before.
 */

interface ChoicesValue {
  choices: Choices;
  picks: Picks;
  path: ShownPath;
  /** Choose `option` (a slug, or `ALL_OPTIONS`) for the set `setKey`. */
  choose: (setKey: string, option: string) => void;
}

const ChoicesContext = createContext<ChoicesValue | undefined>(undefined);

/** The recipe's pick, or `undefined` outside a recipe view. */
export function useChoices(): ChoicesValue | undefined {
  return useContext(ChoicesContext);
}

function localStore(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

const noSubscription = () => () => {};

/**
 * Where the device's pick comes from, as one comparable string (a store
 * snapshot must compare equal while nothing changed): the address's
 * `?pick=` and what localStorage holds for the recipe, as a JSON pair.
 */
function devicePickSnapshot(slug: string): string {
  let linked: string | null = null;
  let stored: string | null = null;
  try {
    linked = new URLSearchParams(window.location.search).get(PICK_PARAM);
  } catch {
    /* No address to read. */
  }
  try {
    stored = localStore()?.getItem(pickStorageKey(slug)) ?? null;
  } catch {
    /* Blocked storage: nothing remembered. */
  }
  return JSON.stringify([linked, stored]);
}

/** The link's pick when it names one, else the remembered one. */
function readSnapshot(snapshot: string, choices: Choices): Picks {
  if (!snapshot) return {};
  const [linked, stored] = JSON.parse(snapshot) as [
    string | null,
    string | null,
  ];
  const fromLink = parsePickParam(linked, choices);
  if (Object.keys(fromLink).length > 0) return fromLink;
  return knownPicks(choices, readStoredPicks({ getItem: () => stored }, "_"));
}

/** Put the pick into the address bar, or take it out when it is the default. */
function writeAddress(choices: Choices, picks: Picks) {
  try {
    const url = new URL(window.location.href);
    const value = formatPickParam(choices, picks);
    if (value) url.searchParams.set(PICK_PARAM, value);
    else url.searchParams.delete(PICK_PARAM);
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, "", url);
    }
  } catch {
    /* The pick holds on the page all the same. */
  }
}

export function ChoicesProvider({
  slug,
  choices,
  children,
}: {
  slug: string;
  choices: Choices;
  children: ReactNode;
}) {
  const active = hasChoices(choices);
  /*
   * After hydration (U1): the link's pick, else the remembered one, read as
   * an external store whose server snapshot is "" — so the server and the
   * hydrating render both have the default, and React re-renders with the
   * device's pick once it owns the page (as `?cook=1` opens the cook view).
   */
  const external = useSyncExternalStore(
    noSubscription,
    () => (active ? devicePickSnapshot(slug) : ""),
    () => "",
  );
  const [chosen, setChosen] = useState<Picks | null>(null);
  const picks = useMemo(
    () => chosen ?? (active ? readSnapshot(external, choices) : {}),
    [active, chosen, choices, external],
  );

  const choose = useCallback(
    (setKey: string, option: string) => {
      const next = { ...picks, [setKey]: option };
      setChosen(next);
      writeStoredPicks(localStore(), slug, next);
      writeAddress(choices, next);
    },
    [choices, picks, slug],
  );

  const value = useMemo<ChoicesValue>(
    () => ({ choices, picks, path: shownPath(choices, picks), choose }),
    [choices, picks, choose],
  );

  return (
    <ChoicesContext.Provider value={value}>{children}</ChoicesContext.Provider>
  );
}

/** The anchor of a set's picker: `#choice-then-make`. */
export function choiceSetId(setKey: string): string {
  return `choice-${setKey}`;
}

/**
 * A set's options as segmented buttons (Radix ToggleGroup, single: arrow
 * keys move between them, each a radio with its state announced). `all`
 * adds an "All" button that shows every option stacked. Always one pressed:
 * pressing the pressed one again keeps it.
 */
export function ChoicePicker({
  set,
  value,
  onChange,
  all = true,
  compact = false,
  className,
}: {
  set: ChoiceSet;
  value: string;
  onChange: (option: string) => void;
  all?: boolean;
  compact?: boolean;
  className?: string;
}) {
  /* `useId`: the cook view renders the same set's picker over the page's. */
  const labelId = useId();
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1.5 print:hidden", className)}
    >
      <span
        id={labelId}
        className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground"
      >
        {set.label}
      </span>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
        aria-labelledby={labelId}
        data-testid="choice-picker"
        className="flex w-full flex-wrap gap-1 rounded-md bg-muted p-1"
      >
        {[
          ...set.options.map((option) => ({
            value: option.slug,
            label: option.label,
          })),
          ...(all ? [{ value: ALL_OPTIONS, label: "All" }] : []),
        ].map(({ value: optionValue, label }) => (
          <ToggleGroupItem
            key={optionValue}
            value={optionValue}
            className={cn(
              "min-h-8 flex-none rounded-sm px-3 text-sm font-medium text-muted-foreground first:rounded-sm last:rounded-sm hover:bg-card/60 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs",
              compact && "min-h-7 px-2.5",
            )}
          >
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** The value a set's picker shows: its pick, resolved. */
export function pickOf(path: ShownPath, set: ChoiceSet): string {
  return path.picks[set.key] ?? set.options[0].slug;
}

/** `aria-hidden`-free hiding for what is off the path: screen only, so print shows all (G3). */
export const OFF_PATH_ATTR = "data-off-path";

export function offPath(shown: boolean): Record<string, string> | undefined {
  return shown ? undefined : { [OFF_PATH_ATTR]: "" };
}

/**
 * The meta strip's yield (45e): the chosen option's when it names one, the
 * recipe's otherwise — scaled with the rest, as `ScaledYield` does.
 */
export function PathYield({ recipeYield }: { recipeYield?: string }) {
  const context = useChoices();
  const value = context?.path.yield ?? recipeYield;
  /* Options with yields, none chosen ("All") and none of the recipe's own. */
  if (!value) return <>—</>;
  return <ScaledYield recipe={{ recipeYield: value } as Recipe} />;
}

export type { ChoicesValue };
