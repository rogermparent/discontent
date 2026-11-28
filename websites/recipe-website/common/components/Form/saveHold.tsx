"use client";

/**
 * Something in the recipe form that Save must wait for (51f): the grams
 * "Add grams" marked and nobody has kept or undone yet. A section holds
 * Save with `useHoldSave(id, reason)`; the rail reads `useSaveHolds()` and
 * disables Save (and Overwrite) with the reason beside it, and the form
 * itself refuses to submit while any hold stands — Enter in a field
 * included — so a marked change can never be saved unseen.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SaveHolds {
  reasons: readonly string[];
  set: (id: string, reason: string | undefined) => void;
}

const SaveHoldContext = createContext<SaveHolds>({
  reasons: [],
  set: () => {},
});

export function SaveHoldProvider({
  formId,
  children,
}: {
  /** The form whose submit the holds refuse. */
  formId: string;
  children: ReactNode;
}) {
  const [holds, setHolds] = useState<Readonly<Record<string, string>>>({});
  const set = useCallback((id: string, reason: string | undefined) => {
    setHolds((current) => {
      if (current[id] === reason) return current;
      const next = { ...current };
      if (reason === undefined) delete next[id];
      else next[id] = reason;
      return next;
    });
  }, []);
  const reasons = useMemo(() => Object.values(holds), [holds]);
  const held = reasons.length > 0;
  useEffect(() => {
    if (!held) return;
    const form = document.getElementById(formId);
    if (!form) return;
    /* At the form, before React's own listener at the root hears it. */
    const refuse = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    form.addEventListener("submit", refuse, true);
    return () => form.removeEventListener("submit", refuse, true);
  }, [held, formId]);
  const value = useMemo(() => ({ reasons, set }), [reasons, set]);
  return (
    <SaveHoldContext.Provider value={value}>
      {children}
    </SaveHoldContext.Provider>
  );
}

/** Hold Save while `reason` is set. */
export function useHoldSave(id: string, reason: string | undefined): void {
  const { set } = useContext(SaveHoldContext);
  useEffect(() => {
    set(id, reason);
    return () => set(id, undefined);
  }, [id, reason, set]);
}

/** Why Save waits, if it does. */
export function useSaveHolds(): readonly string[] {
  return useContext(SaveHoldContext).reasons;
}
