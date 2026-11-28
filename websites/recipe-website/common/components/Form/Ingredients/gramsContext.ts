"use client";

/**
 * What the edit page's "Add grams" (51f) can do, handed to the Ingredients
 * section by the page that has it (only the edit page does): the gram bank
 * the bank step reads, who "Ask the model for the rest" asks (or why
 * nobody), and the page's actions — the model's job and "Save to the bank".
 * Without a provider, the section has no "Add grams".
 */
import { createContext, useContext } from "react";
import type { GramsBankEntry } from "../../../util/gramsBank";

export interface GramsAskStart {
  job?: string;
  /** Who was asked, for "Asking …". */
  model?: string;
  message?: string;
}

export interface GramsAskAnswer {
  line: number;
  grams?: number;
  why?: string;
  problem?: string;
}

export interface GramsAskOutcome {
  pending?: true;
  answers?: GramsAskAnswer[];
  model?: string;
  warnings?: string[];
  message?: string;
}

export interface GramsBankSaved {
  entry?: GramsBankEntry;
  message?: string;
}

export interface GramsSurface {
  /** The person's bank entries (over the built-in seed). */
  entries: readonly GramsBankEntry[];
  /** Who the model step asks ("qwen3:8b (local)"). */
  model?: string;
  /** Why it is off, when no model is set up. */
  unavailable?: string;
  /** Start asking about these lines (index and stored text). */
  ask: (lines: { line: number; text: string }[]) => Promise<GramsAskStart>;
  /** One wait for the answers. */
  result: (job: string) => Promise<GramsAskOutcome>;
  /** "Save to the bank": a name's grams in a cup, one commit. */
  saveToBank?: (input: {
    name: string;
    gramsPerCup: number;
  }) => Promise<GramsBankSaved>;
}

const GramsContext = createContext<GramsSurface | undefined>(undefined);

export const GramsProvider = GramsContext.Provider;

export function useGramsSurface(): GramsSurface | undefined {
  return useContext(GramsContext);
}
