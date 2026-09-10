import { groupItems } from "../../controller/data/readGroupItem";
import { recipeItems } from "../../controller/data/readRecipeItem";
import type { GroupItem } from "../../controller/types";
import { GroupImage } from "../GroupImage";
import { RecipeImage } from "../RecipeImage";
import {
  recipeCardImageClassName,
  standardRecipeImageProps,
} from "../List/shared";
import { GroupThumbnailPlaceholder } from "./Placeholder";

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
 * A group's picture: its own image, else its first member with a photo, else a
 * placeholder.
 *
 * The precedence is *group image › first usable member thumbnail › placeholder
 * icon*; 22g shipped the last two and 22h filled in the first. The member
 * fallback is a **render-time** read rather than a borrowed index value on
 * purpose: borrowing it would mean following `items[].recipe`, which is the
 * array reference the engine's scalar-only machinery cannot address (D3/F32).
 * Doing it here costs cached reads and gets invalidation for free in both
 * directions — a recipe's image change fires `item:recipes:<slug>`, a group's
 * membership or image change fires `item:groups:<slug>`, and both tags are on
 * the entries this walk reads.
 *
 * Async, which is why it arrives at `GroupList` as a prop: that component is
 * rendered from `GroupResults` on the client too, so it cannot itself be a
 * server component (fact 12).
 *
 * Pass `image` when the caller already holds it — every list card does, since
 * 22h put it on `GroupListEntry` (D14) — and the group read is skipped
 * entirely. Passing `items` alone saves only the *walk*'s reads: the record is
 * still what says whether the group has a picture of its own.
 *
 * `data-group-image` on the wrapper says which rung won, so a test can tell an
 * own image from a borrowed member one without matching on the file name.
 */
export async function GroupThumbnail({
  slug,
  name,
  image,
  items,
  className,
}: {
  slug: string;
  name: string;
  /** The group's own image, when the caller already has it. */
  image?: string;
  items?: GroupItem[];
  /** Replaces the default `h-full w-full` box, for a fixed-size header crop. */
  className?: string;
}) {
  const box = className ?? "h-full w-full";

  const ownImage = (file: string) => (
    <div data-testid="group-thumbnail" data-group-image="own" className={box}>
      <GroupImage
        slug={slug}
        image={file}
        alt={name}
        className={recipeCardImageClassName}
        {...standardRecipeImageProps}
      />
    </div>
  );

  if (image) return ownImage(image);

  const group = await groupItems.read(slug);
  if (group?.image) return ownImage(group.image);

  const groupItemList = items ?? group?.items ?? [];

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
  const memberImage = index === -1 ? undefined : recipes[index]?.image;

  if (memberImage) {
    return (
      <div
        data-testid="group-thumbnail"
        data-group-image="member"
        className={box}
      >
        <RecipeImage
          slug={candidates[index]}
          image={memberImage}
          alt={name}
          className={recipeCardImageClassName}
          {...standardRecipeImageProps}
        />
      </div>
    );
  }

  return <GroupThumbnailPlaceholder className={box} />;
}

export default GroupThumbnail;
