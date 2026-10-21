"use client";

import { useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Undo2, X } from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";
import { useSearch } from "recipe-website-common/components/SearchForm/SearchContext";
import {
  ASK_FALLBACK_LABEL,
  ASK_PARAM,
} from "recipe-editor/controller/ask/urls";
import {
  ASK_RECORD_KEY,
  forgetAskRecord,
  onThisSite,
  parseAskRecord,
} from "./askClient";

/** This tab's Ask record, as text: `null` on the server and at hydration. */
function useAskRecordText(): string | null {
  return useSyncExternalStore(
    subscribeNever,
    () => {
      try {
        return sessionStorage.getItem(ASK_RECORD_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
}

/* The record is written just before the navigation that mounts this line,
 * and forgotten only by its own buttons, which leave: nothing to listen for. */
function subscribeNever(): () => void {
  return () => undefined;
}

/**
 * "Filled in from: <question>" (43q): over any page Ask opened (its URL
 * carries `?ask=`), with **Undo** — back to the page and query it was asked
 * from, or the empty search when this tab has no record of it — and a dismiss that keeps the page as filled in. The editor's root
 * layout mounts it; the export has no Ask, so no such line.
 */
export function AskBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const { submitSearch } = useSearch();
  const recordText = useAskRecordText();
  const question = params.get(ASK_PARAM)?.trim();
  if (!question) return null;
  const record = parseAskRecord(recordText);
  const ours = record?.question === question ? record : undefined;

  /*
   * Back to the page and query the Ask came from. With no record for this
   * question (another tab's link, storage blocked) there is nowhere known to
   * go back to — history may lead off the site — so Undo opens the empty
   * search instead (Dq14).
   */
  const undo = () => {
    forgetAskRecord();
    const back = onThisSite(ours?.origin) ?? "/search";
    const origin = new URL(back, window.location.origin);
    /* `/search` reads `?q=` once; the search state is shared, so set it. */
    if (origin.pathname === "/search") {
      submitSearch(origin.searchParams.get("q") ?? "");
    }
    router.push(back);
  };

  const dismiss = () => {
    forgetAskRecord();
    const url = new URL(window.location.href);
    url.searchParams.delete(ASK_PARAM);
    /* A plain state, so Next adopts the URL and this strip (and `/make`'s
     * `?ask=` reader) sees `?ask=` gone; Next's own state would be ignored. */
    window.history.replaceState(null, "", url);
  };

  return (
    <aside
      aria-label="Filled in from your question"
      data-testid="ask-banner"
      className="w-full border-b border-border bg-muted/60"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <Sparkles aria-hidden className="size-4 shrink-0 text-primary" />
        <p className="m-0 min-w-0 flex-1 basis-[16rem]">
          {ours?.fallback ? (
            <>
              {ASK_FALLBACK_LABEL}: <q className="font-medium">{question}</q>
            </>
          ) : (
            <>
              Filled in from: <q className="font-medium">{question}</q>
            </>
          )}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={undo}
          data-testid="ask-undo"
        >
          <Undo2 aria-hidden />
          Undo
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          <X aria-hidden />
        </Button>
      </div>
    </aside>
  );
}
