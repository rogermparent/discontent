/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Recipe } from "../../controller/types";
import { getTransformedRecipeImageProps } from "../RecipeImage";
import { Button } from "@discontent/component-library/components/ui/button";
import { HeroLivePanel } from "./HeroLivePanel";

/**
 * The Working Bench hero: an asymmetric slab pairing the featured recipe's
 * photo with its live panel (scaler + timeline). `label` is the mono eyebrow —
 * "Featured" when a featured recipe drives the hero, "Latest" on the fallback.
 * Degrades to a panel-only hero when the recipe has no image.
 */
export async function HeroBench({
  recipe,
  slug,
  label,
}: {
  recipe: Recipe;
  slug: string;
  label: "Featured" | "Latest";
}) {
  const image = recipe.image
    ? await getTransformedRecipeImageProps({
        slug,
        image: recipe.image,
        alt: `Photo of ${recipe.name}`,
        width: 900,
        height: 700,
        sizes: "(max-width: 1024px) 100vw, 45vw",
        className: "absolute inset-0 h-full w-full object-cover",
        loading: "eager",
      })
    : undefined;

  return (
    <section
      aria-label={`${label} recipe`}
      className="mb-10 overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="grid lg:grid-cols-[1.05fr_1fr]">
        {image && (
          <div className="relative aspect-[4/3] min-h-56 lg:aspect-auto lg:min-h-full">
            <img {...image.props} alt={`Photo of ${recipe.name}`} />
          </div>
        )}
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {label}
            </span>
            <h2 className="font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
              {recipe.name}
            </h2>
          </div>
          <HeroLivePanel recipe={recipe} />
          <div>
            <Button asChild size="lg">
              <Link href={`/recipe/${slug}`}>View recipe</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default HeroBench;
