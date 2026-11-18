import Form from "next/form";
import { SearchIcon } from "lucide-react";
import { SearchShortcutHint } from "./SearchShortcutHint";

/**
 * The homepage's search field (42f, canvas B): a real field, not the
 * masthead's palette trigger. A GET form to `/search?q=…` — `next/form`
 * navigates on the client and falls back to the browser's own submission, so
 * it works before hydration and with no JavaScript at all; Enter submits,
 * the one field needing no button.
 *
 * Labelled "Search recipes", the `/search` page's own field name. The chip
 * at its end is the palette's shortcut, the same `⌘K` / `Ctrl+K` text as the
 * masthead's (`useShortcutModifier`), and decoration (`aria-hidden`): the
 * shortcut opens the palette from anywhere, this field included.
 */
export function HomeSearch({ recipeCount }: { recipeCount: number }) {
  const count = recipeCount > 0 ? `${recipeCount} ` : "";
  return (
    <Form action="/search" role="search" className="relative">
      <label htmlFor="home-search" className="sr-only">
        Search recipes
      </label>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        id="home-search"
        name="q"
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        placeholder={`Search ${count}recipes — a name, an ingredient, a tag`}
        className="peer h-13 w-full min-w-0 rounded-xl border border-input bg-card pr-4 pl-12 text-base text-card-foreground shadow-xs transition-colors outline-none placeholder:text-transparent hover:border-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-15 sm:pr-16 sm:text-[1.0625rem] sm:placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {/*
       * 47h: on a phone the whole hint was cut off at "a name, an": the
       * field shows a short one instead, drawn over it while it is empty
       * (`peer-placeholder-shown`) — the real placeholder, transparent
       * there, still names it for assistive technology. From `sm` the
       * placeholder itself shows, as before.
       */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-12 hidden -translate-y-1/2 truncate pr-4 text-base text-muted-foreground peer-placeholder-shown:block sm:hidden! max-w-[calc(100%-3rem)]"
      >
        Search {count}recipes
      </span>
      <SearchShortcutHint />
    </Form>
  );
}

export default HomeSearch;
