import type { ReactNode } from "react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import type { GroupKind } from "../../../controller/types";
import { groupKindLabel } from "../../../util/groupKindLabel";
import { GroupThumbnail } from "../../GroupThumbnail";
import {
  RecipeCard,
  RecipeCardDate,
  RecipeCardImageContainer,
  RecipeCardLink,
  RecipeCardName,
} from "../shared";

/**
 * A featured **group**, as a card in the strip (22g).
 *
 * The same silhouette as a featured recipe card — portrait crop, name, date —
 * so the mixed strip reads as one row rather than two lists that happen to
 * share a heading. What it deliberately does *not* carry is a bookmark button:
 * bookmarks are a per-recipe store keyed by slug, and a group is not a recipe.
 *
 * The link goes to `/group/<slug>`, not to the feature — the feature's own page
 * is reached through the "View Feature" line the index page passes as `footer`,
 * exactly as the recipe card does, and the homepage passes no footer at all.
 *
 * **A missing name is rendered, not hidden.** Deleting a group clears the
 * borrowed values and leaves the reference (fact 2), which is an ordinary state
 * for a feature to be in; a card that vanished would make the deletion look
 * like it had taken the feature with it.
 */
export function GroupCard({
  slug,
  name,
  kind,
  date,
  footer,
}: {
  slug: string;
  name?: string;
  kind?: GroupKind;
  date: number;
  footer?: ReactNode;
}) {
  return (
    <RecipeCard testId="featured-group-card">
      <RecipeCardLink href={`/group/${slug}`}>
        <RecipeCardImageContainer>
          <GroupThumbnail slug={slug} name={name ?? slug} />
        </RecipeCardImageContainer>
        <RecipeCardName
          className={
            name ? "line-clamp-2" : "line-clamp-2 text-muted-foreground"
          }
        >
          {name ?? "Group not found"}
        </RecipeCardName>
        {kind && (
          <div className="mx-2 mb-1">
            <Badge variant="secondary">{groupKindLabel(kind)}</Badge>
          </div>
        )}
        <RecipeCardDate date={date} showTime />
      </RecipeCardLink>
      {footer}
    </RecipeCard>
  );
}

export default GroupCard;
