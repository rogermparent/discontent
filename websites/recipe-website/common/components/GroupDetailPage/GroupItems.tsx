import { RecipeListItem } from "../List";
import type { ResolvedGroupItem } from ".";

/**
 * A group's items as recipe cards, in the group's order (22f).
 *
 * Cards rather than the line of links this was in 22b: a collection is
 * something you *read* — the user's case is a pie-iron batter collection they
 * want to flip through — and a list of blue names carries no image, no date and
 * no tags to recognise a recipe by. The label and note survive above and below
 * each card, because for a meal plan the label ("Wed · Dinner") is the row's
 * subject and the card is its answer.
 *
 * Not `RecipeGrid`, deliberately: that stamps `data-testid="recipe-list"`,
 * which a dozen specs resolve unscoped to count recipes on a page. A group page
 * answering to it would be a lie the suite could act on — the same reason
 * `List/Group` rolls its own `<ul>`.
 *
 * Its own module because 22g renders the same items inside a featured strip.
 */
export function GroupItems({ items }: { items: ResolvedGroupItem[] }) {
  return (
    <ol className="my-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {items.map(({ item, recipe }, index) => (
        <li
          /*
           * By position, not by slug: a meal plan may legitimately list the
           * same recipe twice, so the slug is not a key.
           */
          key={`${index}-${item.recipe}`}
          data-testid="group-item"
          className="flex flex-col flex-nowrap gap-1"
        >
          {item.label && (
            <p
              className="font-mono text-xs uppercase tracking-wide text-muted-foreground"
              data-testid="group-item-label"
            >
              {item.label}
            </p>
          )}
          {recipe ? (
            <RecipeListItem
              slug={item.recipe}
              date={recipe.date}
              name={recipe.name}
              image={recipe.image}
              tags={recipe.tags}
            />
          ) : (
            /*
             * A dangling item keeps its slot rather than being skipped. Nothing
             * rewrites `items[].recipe` when a recipe is renamed or deleted
             * (D3), so a dangle is an ordinary state, and a meal plan quietly
             * losing a day would be the worse failure. Card-shaped, so the grid
             * does not develop a hole where the recipe used to be.
             */
            <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-card p-3 text-center text-card-foreground">
              <p
                className="text-sm text-muted-foreground"
                data-testid="group-item-missing"
              >
                Recipe not found: {item.recipe}
              </p>
            </div>
          )}
          {item.note && (
            <p className="text-sm text-muted-foreground">{item.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

export default GroupItems;
