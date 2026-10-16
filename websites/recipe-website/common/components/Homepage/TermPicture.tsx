import type { TermSummary } from "../../controller/homepageComingUp";
import { RecipeImage } from "../RecipeImage";
import { TermImage } from "../TermImage";
import { Monogram } from "./Monogram";

/**
 * A term's picture on the homepage — Coming up's cards and the featured
 * strip's term cards: the record's image, else the newest recipe photo under
 * the term, else its initial. Decorative (`alt=""`): every card that shows
 * one prints the term's label beside it.
 */
export function TermPicture({
  slug,
  label,
  summary,
  width,
  height,
  sizes,
}: {
  slug: string;
  label: string;
  summary: Pick<TermSummary, "image" | "recipeImage">;
  width: number;
  height: number;
  sizes: string;
}) {
  const props = {
    alt: "",
    width,
    height,
    sizes,
    className: "h-full w-full object-cover",
  };
  const monogram = <Monogram label={label} />;
  if (summary.image) {
    return <TermImage slug={slug} image={summary.image} {...props} />;
  }
  if (summary.recipeImage) {
    return (
      <RecipeImage
        slug={summary.recipeImage.slug}
        image={summary.recipeImage.image}
        {...props}
        fallback={monogram}
      />
    );
  }
  return monogram;
}

export default TermPicture;
