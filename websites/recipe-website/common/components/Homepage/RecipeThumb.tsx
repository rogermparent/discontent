import { RecipeImage } from "../RecipeImage";
import { Monogram } from "./Monogram";

/**
 * The one image size the homepage's small squares use (42f): the season
 * strip (72 px), New this week (56 px), the plan and featured rows (40–44
 * px). One size, so the export transforms each photo once for all of them.
 *
 * No `sizes` (48e review): with one, Next lists every configured width in
 * the `srcset` (15 of them, ~2 KB an image, a transform each); without, it
 * is `1x` / `2x` — two — which is all a fixed square needs, and the
 * homepage now hands down a picture for every candidate the day may pick.
 */
export const THUMB_IMAGE = {
  width: 160,
  height: 160,
} as const;

/**
 * The larger square of 48e's course cards and the warm drink (about 190 px
 * on a laptop, 56–88 px on a phone), `1x` / `2x` as `THUMB_IMAGE` is.
 */
export const CARD_IMAGE = {
  width: 384,
  height: 384,
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
  size = "thumb",
}: {
  slug: string;
  image?: string;
  name?: string;
  /** `card` for 48e's course cards and the warm drink. */
  size?: "thumb" | "card";
}) {
  const monogram = <Monogram label={name ?? slug} small={size === "thumb"} />;
  if (!image) return monogram;
  return (
    <RecipeImage
      slug={slug}
      image={image}
      alt=""
      {...(size === "card" ? CARD_IMAGE : THUMB_IMAGE)}
      className="h-full w-full object-cover"
      fallback={monogram}
    />
  );
}

export default RecipeThumb;
