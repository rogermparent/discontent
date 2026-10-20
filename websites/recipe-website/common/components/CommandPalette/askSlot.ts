"use client";

import { createContext, useContext, useEffect } from "react";

/**
 * The palette's Ask slot (43q). Ask is the editor's alone (D1: no route, no
 * model call and no Ask on the export), but the palette is shared — so it
 * knows only this shape. The editor renders a component in the palette's
 * `askSlot` that registers a handler; until one registers (always, on the
 * export) the palette has no Ask row and no Tab-to-Ask.
 */
export interface PaletteAskAnswer {
  /** Where to go, site-relative. */
  url: string;
  /** What is opening ("What can I make: drinks with lime"), or the fallback's sentence. */
  label: string;
  /** The answer is the plain word search (`label` says so). */
  fallback?: boolean;
}

export interface PaletteAskHandler {
  /** Whether the input reads as a question, so the row offers itself. */
  offers(text: string): boolean;
  /** Ask the server; rejects when `signal` aborts. */
  ask(question: string, signal: AbortSignal): Promise<PaletteAskAnswer>;
  /** Go there (the palette has closed itself). */
  open(answer: PaletteAskAnswer, question: string): void;
}

type Register = (handler: PaletteAskHandler | undefined) => void;

export const PaletteAskRegistry = createContext<Register>(() => undefined);

/** Register `handler` with the palette while mounted; pass a stable object. */
export function useRegisterPaletteAsk(handler: PaletteAskHandler): void {
  const register = useContext(PaletteAskRegistry);
  useEffect(() => {
    register(handler);
    return () => register(undefined);
  }, [register, handler]);
}
