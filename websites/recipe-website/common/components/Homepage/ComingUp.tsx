import {
  HOLIDAYS_ROOT,
  type ComingUpEntry,
} from "../../controller/homepageComingUp";
import { countLabel } from "../../controller/homepageIntents";
import { parseDayKey, withinComingUpWindow } from "../../util/holidays";
import { ComingUpCards } from "./ComingUpCards";
import { HomeSection } from "./HomeSection";
import { TermPicture } from "./TermPicture";

function counts(entry: Pick<ComingUpEntry, "recipes" | "groups">): string {
  const parts = [];
  if (entry.recipes > 0) parts.push(countLabel(entry.recipes, "recipe"));
  if (entry.groups > 0) parts.push(countLabel(entry.groups, "plan"));
  return parts.join(" · ");
}

/**
 * "Coming up" (direction A, usability pass 2026-10-15): the holidays under
 * the `holidays` root, the next few first, each with a countdown and what is
 * filed under it. Nothing at all when there is no `holidays` root (every
 * test fixture but the ones that make one), nothing under it is tagged, or
 * none of what is tagged falls within the 180-day window
 * (`withinComingUpWindow`) — an undated holiday is never enough on its own
 * to keep the section up, since it has no countdown to show.
 *
 * The pictures are decorative (`alt=""`): the card's text names the holiday.
 */
export function ComingUp({
  entries,
  serverDay,
}: {
  entries: ComingUpEntry[] | null;
  serverDay: string;
}) {
  if (
    !entries ||
    entries.length === 0 ||
    withinComingUpWindow(entries, parseDayKey(serverDay)).length === 0
  ) {
    return null;
  }
  return (
    <HomeSection
      id="home-coming-up"
      title="Coming up"
      link={{ href: `/tags/${HOLIDAYS_ROOT}`, label: "All holidays" }}
    >
      <ComingUpCards
        serverDay={serverDay}
        cards={entries.map((entry) => ({
          slug: entry.slug,
          label: entry.label,
          counts: counts(entry),
          picture: (
            <TermPicture
              slug={entry.slug}
              label={entry.label}
              summary={entry}
              width={640}
              height={400}
              sizes="(max-width: 1024px) 50vw, 25vw"
            />
          ),
        }))}
      />
    </HomeSection>
  );
}

export default ComingUp;
