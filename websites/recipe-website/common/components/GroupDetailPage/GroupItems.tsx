import type { ReactNode } from "react";
import { Badge } from "@discontent/component-library/components/ui/badge";
import type { GroupItem } from "../../controller/types";
import { formatScale, parseScale } from "../../util/scale";
import { RecipeListItem } from "../List";
import { GroupCard } from "../List/FeaturedRecipe/GroupCard";
import type { ResolvedGroupItem } from ".";

/**
 * A group's members as cards, in the group's order (22f; sub-groups since 23c).
 *
 * Cards rather than the line of links this was in 22b: a collection is
 * something you *read* — the user's case is a pie-iron batter collection they
 * want to flip through — and a list of blue names carries no image, no date and
 * no tags to recognise a recipe by. The label and note survive above and below
 * each card, because for a meal plan the label ("Wed · Dinner") is the row's
 * subject and the card is its answer.
 *
 * A nested group renders the **featured group card's** silhouette rather than a
 * recipe card: same portrait crop, name and date, no bookmark button (bookmarks
 * are a per-recipe store keyed by slug and a group is not a recipe), plus the
 * kind badge, which is the one thing that tells the reader this row opens
 * another list rather than a recipe.
 *
 * Not `RecipeGrid`, deliberately: that stamps `data-testid="recipe-list"`,
 * which a dozen specs resolve unscoped to count recipes on a page. A group page
 * answering to it would be a lie the suite could act on — the same reason
 * `List/Group` rolls its own `<ul>`.
 *
 * A recipe row with a `scale` (epic 32, D4) wears a "2×" badge beside its
 * label, and its card links to `/recipe/<slug>?scale=2`, which opens the
 * recipe already scaled. A 1× scale, or one the parser refuses (a hand-edited
 * file), shows nothing and links plainly.
 *
 * Its own module because 22g renders the same items inside a featured strip.
 */
export function GroupItems({ items }: { items: ResolvedGroupItem[] }) {
  return (
    <ol className="my-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {items.map(({ item, recipe, group }, index) => {
        const scale = scaleOf(item);
        return (
          <li
            /*
             * By position, not by slug: a meal plan may legitimately list the
             * same recipe twice, so the slug is not a key.
             */
            key={`${index}-${item.group ?? item.recipe}`}
            data-testid="group-item"
            className="flex flex-col flex-nowrap gap-1"
          >
            {(item.label || scale) && (
              <div className="flex flex-row flex-nowrap items-center justify-between gap-2">
                {item.label && (
                  <p
                    className="font-mono text-xs uppercase tracking-wide text-muted-foreground"
                    data-testid="group-item-label"
                  >
                    {item.label}
                  </p>
                )}
                {scale && (
                  <Badge
                    variant="secondary"
                    className="ml-auto font-mono tabular-nums"
                    data-testid="group-item-scale"
                  >
                    <span className="sr-only">Scale </span>
                    {scale.label}
                  </Badge>
                )}
              </div>
            )}
            {item.group !== undefined ? (
              group ? (
                <GroupCard
                  slug={item.group}
                  name={group.name}
                  kind={group.kind}
                  date={group.date}
                  image={group.image}
                  items={group.items}
                  testId="group-item-group"
                />
              ) : (
                <MissingCard>Group not found: {item.group}</MissingCard>
              )
            ) : recipe ? (
              <RecipeListItem
                slug={item.recipe}
                date={recipe.date}
                name={recipe.name}
                image={recipe.image}
                tags={recipe.tags}
                href={
                  scale
                    ? `/recipe/${item.recipe}?scale=${encodeURIComponent(scale.value)}`
                    : undefined
                }
              />
            ) : (
              <MissingCard>Recipe not found: {item.recipe}</MissingCard>
            )}
            {item.note && (
              <p className="text-sm text-muted-foreground">{item.note}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A recipe row's multiplier, as the badge says it and as the link carries it
 * — or `null` for a sub-group, no scale, 1×, or a value the parser refuses.
 */
export function scaleOf(
  item: GroupItem,
): { label: string; value: string } | null {
  if (item.recipe === undefined || !item.scale) return null;
  const scale = parseScale(item.scale);
  if (!scale || scale.equals(1)) return null;
  return { label: formatScale(scale), value: item.scale.trim() };
}

/**
 * A dangling item keeps its slot rather than being skipped. Nothing rewrites
 * `items[].recipe` or `items[].group` when the thing it names is renamed or
 * deleted (D3/T31), so a dangle is an ordinary state, and a meal plan quietly
 * losing a day would be the worse failure. Card-shaped, so the grid does not
 * develop a hole where the member used to be.
 */
function MissingCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-card p-3 text-center text-card-foreground">
      <p
        className="text-sm text-muted-foreground"
        data-testid="group-item-missing"
      >
        {children}
      </p>
    </div>
  );
}

export default GroupItems;
