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
  /**
   * Whether the row shows for this input — without the highlight, so Enter
   * still opens the top recipe and Tab moves onto Ask.
   */
  offers(text: string): boolean;
  /**
   * Whether the row leads and takes the highlight, so Enter asks: a closing
   * "?" or a question word in front (Dq12). Implies `offers`.
   */
  leads(text: string): boolean;
  /** Ask the server; rejects when `signal` aborts. */
  ask(question: string, signal: AbortSignal): Promise<PaletteAskAnswer>;
  /**
   * Go there. `true` when that was done in place (a search on the search
   * page): no navigation follows, so the palette closes at once.
   */
  open(answer: PaletteAskAnswer, question: string): boolean;
  /**
   * The curator hand-off (44d), the editor's too: a fetch request ("find
   * …", "import …") gets a row after Ask's that opens the curator with the
   * words filled in — never snapped to, so Enter keeps 43q's rules (cmdk
   * highlights it only when it is the one row) — and "Curator" joins Go
   * to. Absent, neither shows.
   */
  curator?: PaletteCuratorHandler;
}

export interface PaletteCuratorHandler {
  /** Whether the "Ask the curator" row shows for this input. */
  offers(text: string): boolean;
  /** Where it goes: the curator with `text` filled in. */
  href(text: string): string;
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
