import type { TermSummary } from "../../controller/homepageComingUp";
import { RecipeImage } from "../RecipeImage";
import { TermImage } from "../TermImage";
import { Monogram } from "./Monogram";

/**
 * A term's picture on the homepage — the featured list's term rows (Coming
 * up's cards too, until 42f): the record's image, else the newest recipe
 * photo under the term, else its initial. Decorative (`alt=""`): every row
 * that shows one prints the term's label beside it.
 */
export function TermPicture({
  slug,
  label,
  summary,
  width,
  height,
  sizes,
  small = false,
}: {
  slug: string;
  label: string;
  summary: Pick<TermSummary, "image" | "recipeImage">;
  width: number;
  height: number;
  sizes: string;
  /** A thumbnail-sized monogram (the featured list's rows, 42f). */
  small?: boolean;
}) {
  const props = {
    alt: "",
    width,
    height,
    sizes,
    className: "h-full w-full object-cover",
  };
  const monogram = <Monogram label={label} small={small} />;
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
