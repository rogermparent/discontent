import {
  HOLIDAYS_ROOT,
  type ComingUpEntry,
} from "../../controller/homepageComingUp";
import { countLabel } from "../../controller/homepageIntents";
import { RecipeImage } from "../RecipeImage";
import { TermImage } from "../TermImage";
import { ComingUpCards } from "./ComingUpCards";
import { HomeSection } from "./HomeSection";
import { Monogram } from "./Monogram";

const PICTURE = {
  width: 640,
  height: 400,
  sizes: "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw",
  className: "h-full w-full object-cover",
} as const;

/** The term's picture, else a recipe's under it, else its initial. */
function Picture({ entry }: { entry: ComingUpEntry }) {
  const monogram = <Monogram label={entry.label} />;
  if (entry.image) {
    return (
      <TermImage slug={entry.slug} image={entry.image} alt="" {...PICTURE} />
    );
  }
  if (entry.recipeImage) {
    return (
      <RecipeImage
        slug={entry.recipeImage.slug}
        image={entry.recipeImage.image}
        alt=""
        {...PICTURE}
        fallback={monogram}
      />
    );
  }
  return monogram;
}

function counts(entry: ComingUpEntry): string {
  const parts = [];
  if (entry.recipes > 0) parts.push(countLabel(entry.recipes, "recipe"));
  if (entry.groups > 0) parts.push(countLabel(entry.groups, "plan"));
  return parts.join(" · ");
}

/**
 * "Coming up" (direction A, usability pass 2026-10-15): the holidays under
 * the `holidays` root, the next few first, each with a countdown and what is
 * filed under it. Nothing at all when there is no `holidays` root (every
 * test fixture but the ones that make one) or nothing under it is tagged.
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
  if (!entries || entries.length === 0) return null;
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
          picture: <Picture entry={entry} />,
        }))}
      />
    </HomeSection>
  );
}

export default ComingUp;
