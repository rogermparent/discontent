import { RecipeImage } from "../RecipeImage";
import { Monogram } from "./Monogram";

/**
 * The one image size the homepage's small squares use (42f): the season
 * strip (72 px), New this week (56 px), the plan and featured rows (40–44
 * px). One size, so the export transforms each photo once for all of them.
 */
export const THUMB_IMAGE = {
  width: 160,
  height: 160,
  sizes: "72px",
} as const;

/**
 * A recipe's photo as a small square, else its initial. Decorative
 * (`alt=""`): every caller names the recipe beside it, or on the link
 * around it.
 */
export function RecipeThumb({
  slug,
  image,
  name,
}: {
  slug: string;
  image?: string;
  name?: string;
}) {
  const monogram = <Monogram label={name ?? slug} small />;
  if (!image) return monogram;
  return (
    <RecipeImage
      slug={slug}
      image={image}
      alt=""
      {...THUMB_IMAGE}
      className="h-full w-full object-cover"
      fallback={monogram}
    />
  );
}

export default RecipeThumb;
