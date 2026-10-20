"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSearch } from "recipe-website-common/components/SearchForm/SearchContext";
import type { PaletteAskAnswer } from "recipe-website-common/components/CommandPalette/askSlot";
import {
  ASK_FALLBACK_LABEL,
  askWords,
  fallbackUrl,
  isSiteUrl,
} from "recipe-editor/controller/ask/urls";

/**
 * The browser's half of Ask (43q): send the question, then go where the
 * answer says — from ⌘K and from `/search` alike.
 */

/**
 * Where an Ask came from (this tab, `sessionStorage`), so "Filled in from"
 * can undo it: the page before, and whether the answer was the fallback.
 */
export interface AskRecord {
  question: string;
  origin: string;
  url: string;
  fallback?: boolean;
}

export const ASK_RECORD_KEY = "discontent-ask-v1";

/** A stored record, checked; `undefined` for anything else. */
export function parseAskRecord(raw: string | null): AskRecord | undefined {
  try {
    const record = raw ? (JSON.parse(raw) as Partial<AskRecord>) : undefined;
    return record &&
      typeof record.question === "string" &&
      isSiteUrl(record.origin) &&
      isSiteUrl(record.url)
      ? (record as AskRecord)
      : undefined;
  } catch {
    return undefined;
  }
}

export function forgetAskRecord(): void {
  try {
    sessionStorage.removeItem(ASK_RECORD_KEY);
  } catch {
    /* Storage blocked: nothing was kept. */
  }
}

function fallbackAnswer(question: string): PaletteAskAnswer {
  return {
    url: fallbackUrl(question),
    label: ASK_FALLBACK_LABEL,
    fallback: true,
  };
}

/**
 * `POST /api/ask`. Never a dead end: a refused request, an unreadable
 * answer or a dropped connection is the fallback search, as the server's
 * own fallback is. Only the caller's abort rejects.
 */
export async function postAsk(
  question: string,
  signal: AbortSignal,
): Promise<PaletteAskAnswer> {
  let response: Response;
  try {
    response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: askWords(question) }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return fallbackAnswer(question);
  }
  if (!response.ok) return fallbackAnswer(question);
  const body = (await response.json().catch(() => undefined)) as
    { url?: unknown; label?: unknown; fallback?: unknown } | undefined;
  if (!body || !isSiteUrl(body.url) || typeof body.label !== "string") {
    return fallbackAnswer(question);
  }
  return { url: body.url, label: body.label, fallback: !!body.fallback };
}

/**
 * Go to an answer: remember where this was (for Undo), hand a `/search`
 * target's query to the search state (the page reads `?q=` only on its first
 * load, and the search is shared app-wide), then navigate.
 */
export function useOpenAsk(): (
  answer: PaletteAskAnswer,
  question: string,
) => void {
  const router = useRouter();
  const { submitSearch } = useSearch();
  return useCallback(
    (answer: PaletteAskAnswer, question: string) => {
      if (!isSiteUrl(answer.url)) return;
      const record: AskRecord = {
        question: askWords(question),
        origin: `${window.location.pathname}${window.location.search}`,
        url: answer.url,
        ...(answer.fallback ? { fallback: true } : {}),
      };
      try {
        sessionStorage.setItem(ASK_RECORD_KEY, JSON.stringify(record));
      } catch {
        /* Storage blocked: Undo goes back in history instead. */
      }
      const target = new URL(answer.url, window.location.origin);
      if (target.pathname === "/search") {
        submitSearch(target.searchParams.get("q") ?? "");
      }
      router.push(answer.url);
    },
    [router, submitSearch],
  );
}
