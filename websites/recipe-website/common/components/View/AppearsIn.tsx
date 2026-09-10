import Link from "next/link";
import { Badge } from "@discontent/component-library/components/ui/badge";
import { groupsByRecipeReads } from "../../controller/data/readGroupsByRecipe";
import { groupKindLabel } from "../../util/groupKindLabel";

/**
 * The groups this recipe is in — one O(1) aggregate read, no walk of anything.
 *
 * The direction is what makes this cheap. Asking "which groups list me?" from
 * the recipe would mean scanning every group on every recipe render; the
 * `groupsByRecipe` fold answers it once per group write instead, and a *recipe*
 * write leaves the value identical, so the aggregate layer reports
 * `changed: false` and fires no tag (D4).
 *
 * Renders nothing at all when the recipe is in no group — including when the
 * aggregate has never been folded (`null`), which is what a content directory
 * predating groups looks like. Both apps get this because `RecipeView` is
 * shared.
 */
export async function AppearsIn({ slug }: { slug: string }) {
  const map = (await groupsByRecipeReads.read()) ?? {};
  const groups = map[slug];
  if (!groups || groups.length === 0) return null;

  return (
    <section
      data-testid="appears-in"
      aria-labelledby="appears-in-heading"
      className="container mx-auto p-2 print:hidden"
    >
      <h2
        id="appears-in-heading"
        className="mb-2 font-display text-lg font-semibold"
      >
        Appears in
      </h2>
      <ul className="flex flex-col flex-nowrap gap-2">
        {groups.map((group, index) => (
          <li
            /*
             * By position: a meal plan may list this recipe twice, under two
             * labels, and both lines are real.
             */
            key={`${index}-${group.slug}`}
            data-testid="appears-in-item"
            className="flex flex-row flex-wrap items-center gap-2 text-sm"
          >
            <Link
              href={`/group/${group.slug}`}
              className="text-primary hover:underline"
            >
              {group.name}
            </Link>
            <Badge variant="secondary">{groupKindLabel(group.kind)}</Badge>
            {group.label && (
              <span className="text-muted-foreground">{group.label}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AppearsIn;
