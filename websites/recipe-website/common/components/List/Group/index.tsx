import Link from "next/link";
import { Badge } from "@discontent/component-library/components/ui/badge";
import type { GroupListEntry } from "../../../controller/groupPaginationConfig";
import { groupKindLabel } from "../../../util/groupKindLabel";
import { highlightText } from "../../SearchList";
import { RecipeCard, RecipeCardDate, RecipeCardName } from "../shared";

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
 * No image. A group has none of its own, and borrowing its first recipe's
 * thumbnail is exactly the array-reference capability the engine does not have
 * (D3/F32) — a card that read one would be a value nothing invalidates. So the
 * card is text, and it is wider than a recipe card because it has no portrait
 * to be the shape of.
 */
function GroupListItem({
  slug,
  date,
  name,
  kind,
  itemCount,
  highlightQuery,
  onSelect,
}: GroupListEntry & GroupListDecorations) {
  return (
    <RecipeCard className="flex flex-col flex-nowrap gap-2 p-3">
      <Link
        href={`/group/${slug}`}
        onClick={onSelect}
        className="block hover:underline"
        data-testid="group-card-link"
      >
        <RecipeCardName className="mx-0 my-0 line-clamp-2">
          {(highlightQuery && highlightText(name, highlightQuery)) || name}
        </RecipeCardName>
      </Link>
      <div className="flex flex-row flex-wrap items-center gap-2">
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
 * the grid is three-up rather than six-up because these cards are text and not
 * portraits, and `RecipeGrid` stamps `data-testid="recipe-list"`, which
 * `checkNamesInOrder` and a dozen specs resolve unscoped — a page of groups
 * answering to it would be a lie the suite could act on.
 */
export default function GroupList({
  groups,
  highlightQuery,
  onSelect,
}: { groups: GroupListEntry[] } & GroupListDecorations) {
  return (
    <ul
      data-testid="group-list"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {groups.map((entry) => (
        <li key={entry.slug}>
          <GroupListItem
            {...entry}
            highlightQuery={highlightQuery}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  );
}
