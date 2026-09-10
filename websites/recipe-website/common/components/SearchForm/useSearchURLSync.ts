"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSearch } from "./SearchContext";
import { quoteQueryValue } from "./queryLanguage";

/**
 * Translate the pre-PR-21 `?tags=a,b&mode=or` pair into query-language terms.
 * Read-only back-compat: links, bookmarks and history entries minted before the
 * filter moved into the query keep working, but nothing writes these params
 * again — `?q=` is the whole URL state now.
 */
export function legacyTagsToQuery(
  tags: string | null,
  mode: string | null,
): string {
  const terms = (tags ?? "")
    .split(",")
    .filter(Boolean)
    .map((tag) => `tag:${quoteQueryValue(tag)}`);
  if (terms.length === 0) return "";
  if (terms.length === 1) return terms[0];
  // `mode=and` was the default and is the implicit join; `or` needs the group,
  // or the OR would bind looser than the free text sitting beside it.
  return mode === "or" ? `(${terms.join(" OR ")})` : terms.join(" ");
}

/**
 * Synchronize the search query with the URL. Only active when enabled === true
 * (page mode; the modal disables it).
 */
export function useSearchURLSync(enabled: boolean) {
  const searchParams = useSearchParams();
  const { query, submitSearch, inputValue } = useSearch();

  // Initialize from URL exactly once per mount — only if sessionStorage didn't
  // already seed a value. Using a ref prevents this from re-firing when the
  // user clears the input (which also makes inputValue undefined).
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!enabled || initializedRef.current) return;
    initializedRef.current = true;
    if (inputValue !== undefined) return;
    const urlQuery = searchParams.get("q") ?? "";
    const legacy = legacyTagsToQuery(
      searchParams.get("tags"),
      searchParams.get("mode"),
    );
    const combined = [urlQuery, legacy].filter(Boolean).join(" ");
    if (combined) submitSearch(combined);
  }, [enabled, searchParams, submitSearch, inputValue]);

  // Sync the query to the URL, so a search stays shareable and reload-safe.
  //
  // `replaceState`, not `pushState`: the field is live now, and pushing per
  // query change would stack a history entry for every debounced keystroke —
  // "chocolate" alone would bury the previous page under nine back presses.
  // Deep links still work (the seeding effect above reads `?q=` on mount) and
  // the popstate handler below still restores state for entries pushed by real
  // navigations.
  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const before = params.toString();

    if (query) params.set("q", query);
    else params.delete("q");

    // Legacy params are read on mount and folded into `q`; leaving them in the
    // URL after that would let a reload apply the same tags twice.
    params.delete("tags");
    params.delete("mode");

    const after = params.toString();
    if (after !== before) {
      history.replaceState({ q: query }, "", url.toString());
    }
  }, [enabled, query]);

  // Listen to browser back/forward.
  useEffect(() => {
    if (!enabled) return;

    const listener = (e: PopStateEvent) => {
      const urlQuery = e.state?.q;
      if (typeof urlQuery === "string") submitSearch(urlQuery);
    };

    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  }, [enabled, submitSearch]);
}
