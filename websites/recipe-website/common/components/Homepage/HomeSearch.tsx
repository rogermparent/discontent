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
        placeholder={
          recipeCount > 0
            ? `Search ${recipeCount} recipes — a name, an ingredient, a tag`
            : "Search recipes — a name, an ingredient, a tag"
        }
        className="h-13 w-full min-w-0 rounded-xl border border-input bg-card pr-16 pl-12 text-base text-card-foreground shadow-xs transition-colors outline-none placeholder:text-muted-foreground hover:border-ring focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:h-15 sm:text-[1.0625rem] [&::-webkit-search-cancel-button]:hidden"
      />
      <SearchShortcutHint />
    </Form>
  );
}

export default HomeSearch;
