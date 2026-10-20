import { groupItems } from "../../controller/data/readGroupItem";
import { recipeItems } from "../../controller/data/readRecipeItem";
import { collectThumbnailCandidates } from "../../controller/groupThumbnailCandidates";
import type { Group } from "../../controller/types";
import { GroupImage } from "../GroupImage";
import { RecipeImage } from "../RecipeImage";
import { standardRecipeImageProps } from "../List/shared";
import { GroupThumbnailPlaceholder } from "./Placeholder";

const CELL = "aspect-square overflow-hidden rounded-sm bg-muted";
const IMAGE = "h-full w-full object-cover";

/**
 * A plan's row on /groups (43p1, canvas B): a strip of its members' photos
 * — up to six, in the plan's order, a sub-plan standing in with its own
 * picture — rather than one card picture.
 *
 * The same precedence `GroupThumbnail` keeps (22g/22h), so its testids and
 * `data-group-image` still say whose picture this is: the plan's own image
 * (one picture, the strip's width), else the members' (`member`, the first
 * cell the one `GroupThumbnail` would have picked), else the placeholder.
 * Decorative (`alt=""`): the plan's name is beside it.
 */
export async function PlanStrip({
  slug,
  group,
}: {
  slug: string;
  group: Group | null;
}) {
  if (group?.image) {
    return (
      <div
        data-testid="group-thumbnail"
        data-group-image="own"
        className="aspect-[3/2] w-full overflow-hidden rounded-md bg-muted"
      >
        <GroupImage
          slug={slug}
          image={group.image}
          alt=""
          className={IMAGE}
          {...standardRecipeImageProps}
        />
      </div>
    );
  }
  const candidates = await collectThumbnailCandidates(
    slug,
    group?.items ?? [],
    (child) => groupItems.read(child),
  );
  const images = await Promise.all(
    candidates.map(async (candidate) =>
      candidate.kind === "group"
        ? candidate.image
        : (await recipeItems.read(candidate.slug))?.image,
    ),
  );
  const cells = candidates
    .map((candidate, i) => ({ candidate, image: images[i] }))
    .filter((cell): cell is typeof cell & { image: string } =>
      Boolean(cell.image),
    );
  if (cells.length === 0) {
    return (
      <GroupThumbnailPlaceholder className="aspect-[3/2] w-full rounded-md" />
    );
  }
  return (
    <div
      data-testid="group-thumbnail"
      data-group-image="member"
      aria-hidden
      className="grid grid-cols-6 gap-1 sm:grid-cols-3"
    >
      {cells.map(({ candidate, image }) => (
        <div key={`${candidate.kind}:${candidate.slug}`} className={CELL}>
          {candidate.kind === "group" ? (
            <GroupImage
              slug={candidate.slug}
              image={image}
              alt=""
              className={IMAGE}
              {...standardRecipeImageProps}
            />
          ) : (
            <RecipeImage
              slug={candidate.slug}
              image={image}
              alt=""
              className={IMAGE}
              {...standardRecipeImageProps}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default PlanStrip;
