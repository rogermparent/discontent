"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, FolderOpen, FileText } from "lucide-react";
import { fold } from "@discontent/component-library/lib/fold";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@discontent/component-library/components/ui/command";
import type { ProjectIndexEntry } from "@discontent/projects-collection/controller/data/readIndex";
import { highlightMatch } from "../Index/highlight";

/*
 * ⌘K over the works.
 *
 * The corpus is fetched from `/search/all` on first open, then cached for the
 * session. It used to be a **prop**, read on the server by the layout — which
 * put the entire project index on the critical path of every page: baked into
 * the HTML of every exported page (a page-weight tax that scales with the
 * corpus, not with what the page shows), and two LMDB open/close cycles per
 * request in the editor, since `readContentIndex` closes the env in a `finally`.
 * The round trip the old comment argued against costs one request, once, only
 * for a reader who actually opens the palette. Recipe made the same call for the
 * same reason.
 *
 * This is deliberately not a port of recipe's 540-line palette. That one carries
 * recent-search history, ingredient-match explanations, a debounced FlexSearch
 * query and an overflow route to `/search`. Portfolio has no `/search` page by
 * decision, and no ingredients; what is left is: fetch, filter, group, navigate.
 */

/** Rows shown before the list stops — the dialog caps its own height anyway. */
const MAX_ROWS = 6;

/** The corpus endpoint. Served by both apps — statically in the export. */
const SEARCH_ALL_URL = "/search/all";

/**
 * Only `openPalette` — `PaletteTrigger` is the sole consumer, and it opens.
 * A matching `closePalette` was exposed here and never called: closing is
 * driven by Radix's `onOpenChange` and by `runCommand`, both inside this file.
 * (Recipe's palette does export one; `PaletteAuthItem` needs to dismiss the
 * dialog before a sign-in redirect.)
 */
interface CommandPaletteContextValue {
  openPalette: () => void;
}

const CommandPaletteContext = createContext<
  CommandPaletteContextValue | undefined
>(undefined);

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext);
  if (context === undefined) {
    throw new Error(
      "useCommandPalette must be used within a CommandPaletteProvider",
    );
  }
  return context;
}

/** Nav targets that always exist, independent of content. */
const NAV_DESTINATIONS = [
  { name: "Work", href: "/", icon: FolderOpen },
  { name: "About", href: "/about", icon: FileText },
];

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // `null` until the corpus resolves — distinct from `[]`, which is a real empty
  // index and should say "no works match", not spin.
  const [projects, setProjects] = useState<ProjectIndexEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadStarted = useRef(false);
  const router = useRouter();
  const { setTheme } = useTheme();

  /**
   * Fetch the corpus once. The ref, not the state, is the guard: two opens in
   * the same tick would both see `projects === null` and fire two requests.
   * On failure it resets, so the next open retries rather than staying broken
   * for the session.
   */
  const loadProjects = useCallback(() => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    // Nothing is set synchronously here — a `setLoadFailed(false)` reset in this
    // body would be a setState in an effect, and cascading renders on open is
    // exactly what that lint rule is for. The failure row keys off `!projects`
    // instead, so a successful retry clears it by resolving.
    fetch(SEARCH_ALL_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ projects?: ProjectIndexEntry[] }>;
      })
      .then((body) => setProjects(body.projects ?? []))
      .catch(() => {
        loadStarted.current = false;
        setLoadFailed(true);
      });
  }, []);

  // Load on open, from an effect rather than from the open handlers: the
  // keyboard path toggles through a state updater, and a fetch fired inside one
  // is a side effect in a function React is free to call twice.
  useEffect(() => {
    if (open) loadProjects();
  }, [open, loadProjects]);

  const openPalette = useCallback(() => setOpen(true), []);

  // ⌘K / Ctrl+K. Both modifiers, because the trigger's hint chip promises
  // whichever one this platform uses.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // cmdk does its own filtering, but it scores on the rendered text only — so a
  // project matched by *tag* would be filtered out before it could explain
  // itself. Filtering here, with `shouldFilter={false}` below, keeps tag and
  // role matches reachable.
  const results = useMemo(() => {
    if (!projects) return [];
    const needle = fold(query.trim());
    if (!needle) return projects.slice(0, MAX_ROWS);
    return projects
      .filter((project) => {
        if (fold(project.name).includes(needle)) return true;
        if (project.tags?.some((tag) => fold(tag).includes(needle)))
          return true;
        if (project.role && fold(project.role).includes(needle)) return true;
        if (project.client && fold(project.client).includes(needle))
          return true;
        return false;
      })
      .slice(0, MAX_ROWS);
  }, [projects, query]);

  const go = useCallback(
    (href: string) => {
      // Navigate *before* closing. Closing first unmounts the dialog, and the
      // focus restoration that Radix runs on unmount was swallowing the
      // navigation — the palette shut and the route never changed.
      router.push(href);
      setOpen(false);
      setQuery("");
    },
    [router],
  );

  const value = useMemo(() => ({ openPalette }), [openPalette]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        label="Search works"
        // cmdk's own filter is off because it scores on rendered text only, so a
        // tag- or role-only match would be filtered out before it could appear.
        shouldFilter={false}
      >
        <CommandInput
          placeholder="Search works…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {/*
            The Works group's three non-result states. All are plain divs, not
            `CommandItem`s — a selectable "Loading…" row would steal the arrow
            keys and could be activated. They are scoped to Works rather than
            using `CommandEmpty` because the nav and appearance groups are
            always present, so the list as a whole is never empty and
            `CommandEmpty` would never render.
          */}
          {!projects && !loadFailed && (
            <div
              role="status"
              className="px-3 py-4 text-sm text-muted-foreground"
            >
              Loading works…
            </div>
          )}

          {loadFailed && !projects && (
            <div role="status" className="px-3 py-4 text-sm text-destructive">
              Could not load works.
            </div>
          )}

          {projects && query.trim() && results.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              No works match.
            </div>
          )}

          {results.length > 0 && (
            <CommandGroup heading="Works">
              {results.map((project) => (
                <CommandItem
                  key={project.slug}
                  value={`project:${project.slug}`}
                  onSelect={() => go(`/project/${project.slug}`)}
                >
                  <span className="flex w-full flex-row items-baseline gap-3">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {new Date(project.date).getUTCFullYear()}
                    </span>
                    <span className="grow">
                      {highlightMatch(project.name, query)}
                    </span>
                    {project.status && (
                      <span className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                        {project.status}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="Go to">
            {NAV_DESTINATIONS.map(({ name, href, icon: Icon }) => (
              <CommandItem
                key={href}
                value={`nav:${href}`}
                onSelect={() => go(href)}
              >
                <Icon className="size-4 shrink-0" />
                {name}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Appearance">
            <CommandItem
              value="mode:light"
              onSelect={() => {
                setTheme("light");
                setOpen(false);
              }}
            >
              <Sun className="size-4 shrink-0" />
              Light
            </CommandItem>
            <CommandItem
              value="mode:dark"
              onSelect={() => {
                setTheme("dark");
                setOpen(false);
              }}
            >
              <Moon className="size-4 shrink-0" />
              Dark
            </CommandItem>
            <CommandItem
              value="mode:system"
              onSelect={() => {
                setTheme("system");
                setOpen(false);
              }}
            >
              <Monitor className="size-4 shrink-0" />
              System
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </CommandPaletteContext.Provider>
  );
}
