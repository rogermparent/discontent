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
 * How many levels of sub-group the walk descends through (23c/D18).
 *
 * Four, with `MEMBERS_WALKED` still capping the candidates: the two bounds
 * multiply, so the worst case is a fixed handful of cached reads however a
 * curator has nested things. The visited set below is the other half — it is
 * what makes a cycle *on disk* (hand-edited, or written before the write-time
 * check existed) terminate rather than hang a render (T35).
 */
const GROUPS_DEEP = 4;

/** What the walk found to draw: a member recipe, or a sub-group's own picture. */
type Candidate =
  | { kind: "recipe"; slug: string }
  | { kind: "group"; slug: string; image: string };

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

  const candidates = await collectCandidates(groupItemList, 1, {
    candidates: [],
    seenRecipes: new Set<string>(),
    /* Seeded with this group, so a plan that lists itself stops immediately. */
    visitedGroups: new Set<string>([slug]),
  });

  /*
   * Concurrent, then chosen positionally — `Promise.all` resolves in order, so
   * "the first member with a photo" stays the group's own first, not whichever
   * read settled first. A sub-group candidate already carries its picture: the
   * walk only kept it *because* it had one.
   */
  const images = await Promise.all(
    candidates.map(async (candidate) =>
      candidate.kind === "group"
        ? candidate.image
        : (await recipeItems.read(candidate.slug))?.image,
    ),
  );
  const index = images.findIndex(Boolean);

  if (index !== -1) {
    const candidate = candidates[index];
    const memberImage = images[index] as string;
    return (
      <div
        data-testid="group-thumbnail"
        /*
         * "member" for both kinds. The distinction the attribute exists to make
         * is *whose* picture this is — the group's own, or one it borrowed —
         * and a picture borrowed from a sub-group is still borrowed.
         */
        data-group-image="member"
        className={box}
      >
        {candidate.kind === "group" ? (
          <GroupImage
            slug={candidate.slug}
            image={memberImage}
            alt={name}
            className={recipeCardImageClassName}
            {...standardRecipeImageProps}
          />
        ) : (
          <RecipeImage
            slug={candidate.slug}
            image={memberImage}
            alt={name}
            className={recipeCardImageClassName}
            {...standardRecipeImageProps}
          />
        )}
      </div>
    );
  }

  return <GroupThumbnailPlaceholder className={box} />;
}

/**
 * The members worth reading a picture from, depth-first in the group's order
 * (23c/D18).
 *
 * Depth-first rather than level-by-level because the order *is* the answer: the
 * first row of a collection whose first entry is a meal plan should show that
 * meal plan's picture, not the collection's third recipe. A sub-group with its
 * own image is a candidate as it stands; one without is descended into, which
 * is what lets a collection of plans of recipes still find a photo.
 *
 * Recipes are deduped (a plan may cook one twice) and groups are visited once
 * (two plans may share a child, and a hand-written file may loop).
 */
async function collectCandidates(
  items: GroupItem[],
  depth: number,
  state: {
    candidates: Candidate[];
    seenRecipes: Set<string>;
    visitedGroups: Set<string>;
  },
): Promise<Candidate[]> {
  for (const item of items) {
    if (state.candidates.length >= MEMBERS_WALKED) break;

    if (item?.recipe) {
      if (state.seenRecipes.has(item.recipe)) continue;
      state.seenRecipes.add(item.recipe);
      state.candidates.push({ kind: "recipe", slug: item.recipe });
      continue;
    }

    if (!item?.group || state.visitedGroups.has(item.group)) continue;
    state.visitedGroups.add(item.group);
    if (depth >= GROUPS_DEEP) continue;

    const child = await groupItems.read(item.group);
    if (!child) continue;
    if (child.image) {
      state.candidates.push({
        kind: "group",
        slug: item.group,
        image: child.image,
      });
      continue;
    }
    await collectCandidates(child.items ?? [], depth + 1, state);
  }
  return state.candidates;
}

export default GroupThumbnail;
