"use client";

/**
 * The gram marks "Add grams" made on the edit page (51f), held **above**
 * the form's keyed shell (review finding 2). "Edit with AI" and "Fill gaps
 * from the source" remount the form with its values as they are, grams
 * included; held inside the Ingredients section, the marks — and with them
 * Save's hold — went and the unreviewed grams stayed. Held here, the new
 * section finds them on their rows again (`placeGramMarks`) and Save waits
 * as before. Also held: the lines a step was undone on (Df8), what was
 * saved to the bank on this page, and whether the panel is open.
 *
 * Without a provider (the new-recipe page has no "Add grams"), a section
 * keeps its own.
 */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { GramsBankEntry } from "../../../util/gramsBank";
import type { PlacedGramMark } from "../../../util/lineMarks";

export interface GramMarksState {
  marks: readonly PlacedGramMark[];
  setMarks: Dispatch<SetStateAction<readonly PlacedGramMark[]>>;
  /** `source|before`: what a step won't propose again on this page (Df8). */
  undone: ReadonlySet<string>;
  setUndone: Dispatch<SetStateAction<ReadonlySet<string>>>;
  /** Saved to the bank on this page: the bank step reads them at once. */
  saved: readonly GramsBankEntry[];
  setSaved: Dispatch<SetStateAction<readonly GramsBankEntry[]>>;
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

function useGramMarksState(): GramMarksState {
  const [marks, setMarks] = useState<readonly PlacedGramMark[]>([]);
  const [undone, setUndone] = useState<ReadonlySet<string>>(() => new Set());
  const [saved, setSaved] = useState<readonly GramsBankEntry[]>([]);
  const [open, setOpen] = useState(false);
  return useMemo(
    () => ({
      marks,
      setMarks,
      undone,
      setUndone,
      saved,
      setSaved,
      open,
      setOpen,
    }),
    [marks, undone, saved, open],
  );
}

const GramMarksContext = createContext<GramMarksState | undefined>(undefined);

export function GramMarksProvider({ children }: { children: ReactNode }) {
  const state = useGramMarksState();
  return (
    <GramMarksContext.Provider value={state}>
      {children}
    </GramMarksContext.Provider>
  );
}

/** The page's gram marks, or the section's own without a provider. */
export function useGramMarks(): GramMarksState {
  const held = useContext(GramMarksContext);
  const own = useGramMarksState();
  return held ?? own;
}

let marksMade = 0;

/** A mark's id: unique on the page (no `crypto.randomUUID` on a plain-http LAN host). */
export function nextGramMarkId(): string {
  marksMade += 1;
  return `gram-${marksMade}`;
}
