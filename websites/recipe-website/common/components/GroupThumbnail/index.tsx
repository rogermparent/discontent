import { Layers } from "lucide-react";
import { groupItems } from "../../controller/data/readGroupItem";
import { recipeItems } from "../../controller/data/readRecipeItem";
import type { GroupItem } from "../../controller/types";
import { RecipeImage } from "../RecipeImage";
import {
  recipeCardImageClassName,
  standardRecipeImageProps,
} from "../List/shared";

/**
 * How far into a group the walk looks for a photo.
 *
 * Six, not all of them: a meal plan may list dozens of recipes, and a card is
 * not worth a dozen reads. The reads are cached and usually already warm — the
 * same recipes are on the page below — so the bound is about the cold case, and
 * six is the first row of the recipe grid either way.
 */
const MEMBERS_WALKED = 6;

/**
 * A group's picture: its first member with a photo, or a placeholder (22g).
 *
 * The precedence this implements is *pre-defined group image › first usable
 * member thumbnail › placeholder icon*, and 22g ships the last two — a group has
 * no image of its own yet. The fallback is a **render-time** read rather than a
 * borrowed index value on purpose: borrowing it would mean following
 * `items[].recipe`, which is the array reference the engine's scalar-only
 * machinery cannot address (D3/F32). Doing it here costs cached reads and gets
 * invalidation for free in both directions — a recipe's image change fires
 * `item:recipes:<slug>`, a group's membership change fires `item:groups:<slug>`,
 * and both tags are on the entries this walk reads.
 *
 * Async, which is why it arrives at `GroupList` as a prop: that component is
 * rendered from `GroupResults` on the client too, so it cannot itself be a
 * server component (fact 12).
 *
 * Pass `items` when the caller already holds them — the group and featured
 * detail pages do — and the group read is skipped entirely.
 */
export async function GroupThumbnail({
  slug,
  name,
  items,
  className,
}: {
  slug: string;
  name: string;
  items?: GroupItem[];
  /** Replaces the default `h-full w-full` box, for a fixed-size header crop. */
  className?: string;
}) {
  const box = className ?? "h-full w-full";

  /*
   * 22h slots the group's own `image` in here, ahead of the member walk: read
   * `group.image` (via `items ? undefined : the record` — the callers that pass
   * `items` will pass it too) and render `GroupImage` instead of returning to
   * the walk below.
   */
  const groupItemList = items ?? (await groupItems.read(slug))?.items ?? [];

  /* Distinct, in the group's order: a meal plan may list one recipe twice. */
  const candidates: string[] = [];
  const seen = new Set<string>();
  for (const item of groupItemList) {
    if (!item?.recipe || seen.has(item.recipe)) continue;
    seen.add(item.recipe);
    candidates.push(item.recipe);
    if (candidates.length >= MEMBERS_WALKED) break;
  }

  /*
   * Concurrent, then chosen positionally — `Promise.all` resolves in order, so
   * "the first member with a photo" stays the group's own first, not whichever
   * read settled first.
   */
  const recipes = await Promise.all(
    candidates.map((recipeSlug) => recipeItems.read(recipeSlug)),
  );
  const index = recipes.findIndex((recipe) => Boolean(recipe?.image));
  const image = index === -1 ? undefined : recipes[index]?.image;

  if (image) {
    return (
      <div data-testid="group-thumbnail" className={box}>
        <RecipeImage
          slug={candidates[index]}
          image={image}
          alt={name}
          className={recipeCardImageClassName}
          {...standardRecipeImageProps}
        />
      </div>
    );
  }

  /*
   * The same bench-toned box `RecipeCardPlaceholder` uses, with the layers mark
   * instead of a monogram: a group is a stack of things, and an initial would
   * read as a recipe card that had lost its photo.
   */
  return (
    <div
      data-testid="group-thumbnail-placeholder"
      aria-hidden
      className={`flex items-center justify-center bg-gradient-to-br from-muted to-accent/40 ${box}`}
    >
      <Layers className="size-8 text-muted-foreground/60" aria-hidden="true" />
    </div>
  );
}

export default GroupThumbnail;
