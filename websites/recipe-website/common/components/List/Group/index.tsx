import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import type { GroupListEntry } from "../../../controller/groupPaginationConfig";
import { groupKindLabel } from "../../../util/groupKindLabel";
import { highlightText } from "../../SearchList";
import {
  RecipeCard,
  RecipeCardDate,
  RecipeCardImageContainer,
  RecipeCardName,
} from "../shared";

/**
 * What a *search* surface adds to the plain card (22f). Both optional and both
 * unused by the two server call sites (`/groups`, the homepage strip), so this
 * component stays renderable from a server component: `onSelect` only ever
 * arrives from `GroupResults`, which is a client component itself.
 */
interface GroupListDecorations {
  /** Free text to `<mark>` inside the name. Never a filter value. */
  highlightQuery?: string;
  /** Fires before navigation — search uses it to record the committed query. */
  onSelect?: () => void;
}

/**
 * One group card: the name links to the group, the badge names the kind, and
 * the count says how much is in it.
 *
 * **The picture is a prop, not a read.** A group's member thumbnail is picked
 * by walking `items[].recipe` through the cached item reads — an async
 * server-only walk, which this component cannot do because `GroupResults`
 * renders it on the client (fact 12). So every caller hands a rendered node in:
 * the server ones a `GroupThumbnail`, and `GroupResults` since 22h either a
 * `PureStaticImage` of the group's own picture (which the search corpus
 * carries, D14) or the placeholder — the one thing it cannot produce is the
 * member fallback.
 */
function GroupListItem({
  slug,
  date,
  name,
  kind,
  itemCount,
  highlightQuery,
  onSelect,
  thumbnail,
}: GroupListEntry & GroupListDecorations & { thumbnail?: ReactNode }) {
  /*
   * Two shapes of the same card. With a picture the padding moves off the card
   * and onto the text, so the image can run to the edges the way a recipe
   * card's does; without one the markup is byte-for-byte what 22f shipped,
   * which is what keeps `GroupResults` and the group specs still.
   */
  return (
    <RecipeCard
      className={
        thumbnail
          ? "flex flex-col flex-nowrap gap-2 pb-2"
          : "flex flex-col flex-nowrap gap-2 p-3"
      }
    >
      <Link
        href={`/group/${slug}`}
        onClick={onSelect}
        className={
          thumbnail ? "block group hover:underline" : "block hover:underline"
        }
        data-testid="group-card-link"
      >
        {thumbnail && (
          <RecipeCardImageContainer>{thumbnail}</RecipeCardImageContainer>
        )}
        <RecipeCardName
          className={
            thumbnail ? "mx-3 mb-0 mt-2 line-clamp-2" : "mx-0 my-0 line-clamp-2"
          }
        >
          {(highlightQuery && highlightText(name, highlightQuery)) || name}
        </RecipeCardName>
      </Link>
      <div
        className={
          thumbnail
            ? "flex flex-row flex-wrap items-center gap-2 px-3"
            : "flex flex-row flex-wrap items-center gap-2"
        }
      >
        <Badge variant="secondary">{groupKindLabel(kind)}</Badge>
        <span
          className="font-mono text-xs tabular-nums text-muted-foreground"
          data-testid="group-item-count"
        >
          {itemCount} {itemCount === 1 ? "recipe" : "recipes"}
        </span>
      </div>
      <RecipeCardDate date={date} />
    </RecipeCard>
  );
}

/**
 * The group grid.
 *
 * Its own `<ul>` rather than `RecipeGrid`, for two reasons that are really one:
 * the text-only grid is three-up rather than six-up because those cards are
 * text and not portraits, and `RecipeGrid` stamps `data-testid="recipe-list"`,
 * which `checkNamesInOrder` and a dozen specs resolve unscoped — a page of
 * groups answering to it would be a lie the suite could act on.
 *
 * The column count follows the card shape rather than the surface: with
 * `renderThumbnail` the cards are portraits, so the grid becomes the recipe
 * grid's six-up, and without it the three-up stays.
 */
export default function GroupList({
  groups,
  highlightQuery,
  onSelect,
  renderThumbnail,
}: {
  groups: GroupListEntry[];
  /**
   * A rendered thumbnail per entry (22g). The server callers return a
   * `GroupThumbnail`, which can walk to a member's photo; `GroupResults`
   * returns the group's own picture or the placeholder (22h), because a client
   * component cannot run that walk.
   *
   * Unset still means the wide text-only card this was before 22g — nothing
   * renders it that way today, and the shape is what the ⌘K rows would want.
   */
  renderThumbnail?: (entry: GroupListEntry) => ReactNode;
} & GroupListDecorations) {
  return (
    <ul
      data-testid="group-list"
      className={
        renderThumbnail
          ? "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
          : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      }
    >
      {groups.map((entry) => (
        <li key={entry.slug}>
          <GroupListItem
            {...entry}
            highlightQuery={highlightQuery}
            onSelect={onSelect}
            thumbnail={renderThumbnail?.(entry)}
          />
        </li>
      ))}
    </ul>
  );
}
