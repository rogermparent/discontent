import Link from "next/link";
import {
  BookOpenIcon,
  CookingPotIcon,
  LayersIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@discontent/component-library/components/ui/button";

/** "1 recipe", "457 recipes". */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The top of the homepage (homepage redesign, 2026-10-15): one line saying
 * what the site holds, then the ways in. It replaced a full-width hero that
 * gave the newest featured recipe most of the first screen.
 *
 * **No heading and no slogan.** The masthead already prints the site title as
 * the page's one `h1`, so repeating it here would say nothing new, and a
 * tagline is copy someone has to own. The line is the corpus' size instead —
 * information, in the mono face the design keeps for numbers. It is left out
 * when there are no recipes, where the Latest section's empty state speaks.
 *
 * **"What can I make?" leads**, as the one primary button: it is the page that
 * answers the question a reader most often arrives with, and nothing else on
 * the site linked to it. The other three are outline buttons to places the
 * masthead or footer also reach, here because a homepage is a list of doors.
 * All four exist in both apps; nothing here reads a session.
 */
export function HomeActions({
  recipeCount,
  groupCount,
}: {
  recipeCount: number;
  groupCount: number;
}) {
  return (
    <nav aria-label="Start here" className="mb-8 flex flex-col gap-3">
      {recipeCount > 0 && (
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {plural(recipeCount, "recipe")}
          {groupCount > 0 && <> · {plural(groupCount, "group")}</>}
        </p>
      )}
      <ul className="flex flex-row flex-wrap items-center gap-2">
        <li>
          <Button asChild>
            <Link href="/make">
              <CookingPotIcon aria-hidden />
              What can I make?
            </Link>
          </Button>
        </li>
        <li>
          <Button asChild variant="outline">
            <Link href="/search">
              <SearchIcon aria-hidden />
              Search
            </Link>
          </Button>
        </li>
        <li>
          <Button asChild variant="outline">
            <Link href="/recipes">
              <BookOpenIcon aria-hidden />
              All recipes
            </Link>
          </Button>
        </li>
        <li>
          <Button asChild variant="outline">
            <Link href="/groups">
              <LayersIcon aria-hidden />
              Groups
            </Link>
          </Button>
        </li>
      </ul>
    </nav>
  );
}

export default HomeActions;
