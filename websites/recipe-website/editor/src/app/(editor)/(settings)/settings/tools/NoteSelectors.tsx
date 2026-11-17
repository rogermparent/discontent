import { Button } from "@discontent/component-library/components/ui/button";
import { listNoteSelectors } from "recipe-editor/controller/notes/noteSelectors";
import { forgetNoteSelectorAction } from "./noteSelectorActions";

/** "17 Nov 2026" — the server's own words, never re-rendered in the browser. */
function day(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The learned notes selectors (47j): one row a site — the selector, who
 * learned it and when, how often it found notes since — with Forget. A
 * server component: the list is read from `settings.json` on each visit.
 */
export async function NoteSelectors() {
  const rows = await listNoteSelectors();
  if (rows.length === 0) {
    return (
      <p
        className="text-sm text-muted-foreground"
        data-testid="note-selectors-empty"
      >
        None learned yet. When a page from a site with no known recipe-card
        plugin shows a “Notes” heading, an import asks the model for a selector
        once and keeps it here.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border" data-testid="note-selectors">
      {rows.map((row) => (
        <li
          key={row.site}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2"
          data-testid="note-selector"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">{row.site}</p>
            <p className="break-all font-mono text-xs">{row.selector}</p>
            <p className="text-xs text-muted-foreground">
              Learned {day(row.learned)} by {row.model} · found notes {row.hits}{" "}
              {row.hits === 1 ? "time" : "times"}
              {row.misses ? `, missed ${row.misses}` : ""}
            </p>
          </div>
          <form action={forgetNoteSelectorAction}>
            <input type="hidden" name="site" value={row.site} />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              aria-label={`Forget the selector for ${row.site}`}
            >
              Forget
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}
