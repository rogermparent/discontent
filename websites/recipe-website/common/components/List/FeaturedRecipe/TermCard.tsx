import type { ReactNode } from "react";
import { GroupThumbnailPlaceholder } from "../../GroupThumbnail/Placeholder";
import { TermImage } from "../../TermImage";
import {
  RecipeCard,
  RecipeCardDate,
  RecipeCardImageContainer,
  RecipeCardLink,
  RecipeCardMeta,
  RecipeCardName,
} from "../shared";

/**
 * A featured **term**, as a card in the strip (24c).
 *
 * `GroupCard`'s silhouette — portrait crop, name, date — so a strip mixing all
 * three kinds reads as one row rather than three lists sharing a heading. Like
 * that card it carries no bookmark button: bookmarks are a per-recipe store
 * keyed by slug, and a term is not a recipe.
 *
 * **No kind badge**, where a group card prints "Meal plan" or "Collection".
 * There is only one kind of term, so a badge would print the same word on every
 * card — and the term's own page is where its place in the hierarchy is shown.
 *
 * The link goes to `/tags/<slug>`, not to the feature: the feature's own page
 * is reached through the "View Feature" line the index page passes as `footer`,
 * exactly as the other two cards do, and the homepage passes no footer at all.
 *
 * The picture is the record's own, with the group placeholder when it has none
 * — there is no member walk to fall back on, because a term carries strings
 * rather than members.
 *
 * **A missing label is rendered, not hidden**, for the reason `GroupCard`
 * gives: deleting the record clears the borrowed values and leaves the
 * reference, and a card that vanished would make the deletion look like it had
 * taken the feature with it.
 */
export function TermCard({
  slug,
  label,
  date,
  image,
  picture,
  meta,
  footer,
  testId = "featured-term-card",
}: {
  slug: string;
  label?: string;
  date: number;
  image?: string;
  /**
   * A rendered picture in place of the image-or-placeholder rule — the
   * homepage passes its term picture (image › newest recipe photo ›
   * monogram); `/featured-recipes` passes none and keeps the old rule.
   */
  picture?: ReactNode;
  /** A line in place of the date (the homepage's "Tag · N recipes"). */
  meta?: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  return (
    <RecipeCard testId={testId}>
      <RecipeCardLink href={`/tags/${slug}`}>
        <RecipeCardImageContainer>
          {picture ? (
            picture
          ) : image ? (
            <TermImage
              slug={slug}
              image={image}
              alt="Term thumbnail"
              width={320}
              height={320}
              sizes="(max-width: 640px) 50vw, 320px"
              className="object-cover h-full w-full"
            />
          ) : (
            <GroupThumbnailPlaceholder />
          )}
        </RecipeCardImageContainer>
        <RecipeCardName
          className={
            label ? "line-clamp-2" : "line-clamp-2 text-muted-foreground"
          }
        >
          {label ?? "Term not found"}
        </RecipeCardName>
        {meta !== undefined ? (
          <RecipeCardMeta>{meta}</RecipeCardMeta>
        ) : (
          <RecipeCardDate date={date} showTime />
        )}
      </RecipeCardLink>
      {footer}
    </RecipeCard>
  );
}

export default TermCard;
