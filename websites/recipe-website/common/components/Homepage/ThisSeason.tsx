import {
  datedHolidays,
  type ComingUpEntry,
} from "../../controller/homepageComingUp";
import { countLabel } from "../../controller/homepageIntents";
import { RecipeThumb } from "./RecipeThumb";
import { SeasonSection } from "./SeasonSection";

/** "32 recipes · 1 plan · featured" — what the row's holiday holds. */
function counts(
  entry: Pick<ComingUpEntry, "recipes" | "groups" | "featured">,
): string {
  const parts = [];
  if (entry.recipes > 0) parts.push(countLabel(entry.recipes, "recipe"));
  if (entry.groups > 0) parts.push(countLabel(entry.groups, "plan"));
  if (entry.featured) parts.push("featured");
  return parts.join(" · ");
}

/**
 * Whether "This season" may render: some holiday with something under it
 * has a date. Which rows show — and so whether the section shows at all —
 * is the browser's day's question (`SeasonSection`); this is only what the
 * server can answer for every day, and what places the section's grid row.
 */
export function hasSeason(entries: ComingUpEntry[] | null): boolean {
  return datedHolidays(entries ?? []).length > 0;
}

/**
 * "This season" (42f, canvas B — "Coming up" until then): the next holidays
 * under the `holidays` root as dated rows, each with its countdown, what it
 * holds, and a strip of its recipes; the holiday's name goes to its menu
 * (`/holidays/<slug>`, 42e) and "All holidays" to the almanac (`/holidays`).
 *
 * Nothing at all when there is no `holidays` root (every fixture but the
 * ones that make one), nothing under it is tagged or dated (`hasSeason`), or
 * none of it falls within the 180-day window on the reader's day
 * (`SeasonSection`) — an undated holiday never shows, since it has no date
 * to print.
 *
 * A featured holiday is shown here once, marked "featured", and the featured
 * list hides it while its row shows (`HomeRail`): the canvas found each
 * of Halloween, Thanksgiving and Christmas on the page twice.
 */
export function ThisSeason({
  entries,
  serverDay,
  className,
}: {
  entries: ComingUpEntry[] | null;
  serverDay: string;
  /** The section's own placement (the page grid's), so no wrapper is left empty. */
  className?: string;
}) {
  if (!entries || !hasSeason(entries)) return null;
  return (
    <SeasonSection
      serverDay={serverDay}
      className={className}
      rows={datedHolidays(entries).map((entry) => ({
        slug: entry.slug,
        ...(entry.rule ? { rule: entry.rule } : {}),
        label: entry.label,
        counts: counts(entry),
        /* 47h: the candidates, each picture rendered here; the browser's
         * day picks which show (`homepageShown`). */
        picks: entry.picks.map((pick) => ({
          slug: pick.slug,
          ...(pick.name ? { name: pick.name } : {}),
          thumb: (
            <RecipeThumb slug={pick.slug} image={pick.image} name={pick.name} />
          ),
        })),
      }))}
    />
  );
}

export default ThisSeason;
