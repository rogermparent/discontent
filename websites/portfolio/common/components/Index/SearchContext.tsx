"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { fold } from "@discontent/component-library/lib/fold";
import type { ProjectIndexEntry } from "@discontent/projects-collection/controller/data/readIndex";

/*
 * The index's search.
 *
 * This is deliberately ~150 lines rather than a port of recipe's 551-line
 * FlexSearch + IndexedDB + react-query stack. That stack exists to avoid
 * re-tokenizing *hundreds* of recipes on every visit, and it carries two
 * documented footguns (a schema-version trap in the IndexedDB name, and a
 * duplicate-id hazard on commit). A portfolio corpus is dozens of entries — with
 * summaries capped at 300 chars, ~50 projects is roughly 15 KB — so tokenizing
 * is not a cost worth engineering around.
 *
 * What is kept from recipe, verbatim, because it is small and correct: the
 * sessionStorage + useSyncExternalStore mechanism. It is SSR-safe (there is a
 * server snapshot), it survives a navigation to a project and back, and it does
 * not re-render the tree on every keystroke of an unrelated component.
 *
 * The escape hatch, if a corpus ever outgrows this: swap the useMemo filter for
 * an in-memory FlexSearch `Document` — still without IdxDB, which skips both of
 * the footguns above.
 */

const SESSION_EVENT = "portfolio-index-storage";
const QUERY_KEY = "index-query";

function subscribeSession(callback: () => void) {
  window.addEventListener(SESSION_EVENT, callback);
  return () => window.removeEventListener(SESSION_EVENT, callback);
}

function readSession(key: string) {
  return sessionStorage.getItem(key) ?? "";
}

function writeSession(key: string, value: string) {
  if (value) {
    sessionStorage.setItem(key, value);
  } else {
    sessionStorage.removeItem(key);
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

const getQuerySnapshot = () => readSession(QUERY_KEY);
/** "" on the server, so SSR and first client render agree. */
const getServerSnapshot = () => "";

export interface IndexSearchContextValue {
  query: string;
  setQuery: (value: string) => void;
  /** Every project, in index order. */
  all: ProjectIndexEntry[];
  /** Those matching the query — the full list when the query is empty. */
  results: ProjectIndexEntry[];
}

const IndexSearchContext = createContext<IndexSearchContextValue | null>(null);

/**
 * Rank a project against a folded query.
 *
 * Field order *is* the ranking — name beats tags beats role beats summary — and
 * it is expressed as a score rather than sorted tiers so a single pass does it.
 * Returns 0 for no match.
 */
function score(project: ProjectIndexEntry, needle: string): number {
  const name = fold(project.name);
  if (name.startsWith(needle)) return 100;
  if (name.includes(needle)) return 80;
  if (project.tags?.some((tag) => fold(tag).includes(needle))) return 60;
  if (project.role && fold(project.role).includes(needle)) return 40;
  if (project.client && fold(project.client).includes(needle)) return 35;
  if (project.summary && fold(project.summary).includes(needle)) return 20;
  return 0;
}

export function IndexSearchProvider({
  projects,
  children,
}: {
  /**
   * Seeded from a server-rendered prop, not fetched. The page already has the
   * full array, so search works before hydration finishes and the list still
   * renders with JavaScript disabled.
   */
  projects: ProjectIndexEntry[];
  children: ReactNode;
}) {
  const query = useSyncExternalStore(
    subscribeSession,
    getQuerySnapshot,
    getServerSnapshot,
  );

  const setQuery = useCallback((value: string) => {
    writeSession(QUERY_KEY, value);
  }, []);

  const results = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return projects;
    return (
      projects
        .map((project) => ({ project, rank: score(project, needle) }))
        .filter((entry) => entry.rank > 0)
        // Ties keep index order, which is reverse-chronological — so among equally
        // good matches the most recent work leads.
        .sort((a, b) => b.rank - a.rank)
        .map((entry) => entry.project)
    );
  }, [projects, query]);

  const value = useMemo(
    () => ({ query, setQuery, all: projects, results }),
    [query, setQuery, projects, results],
  );

  return (
    <IndexSearchContext.Provider value={value}>
      {children}
    </IndexSearchContext.Provider>
  );
}

export function useIndexSearch(): IndexSearchContextValue {
  const context = useContext(IndexSearchContext);
  if (!context) {
    throw new Error(
      "useIndexSearch must be used within an IndexSearchProvider",
    );
  }
  return context;
}
