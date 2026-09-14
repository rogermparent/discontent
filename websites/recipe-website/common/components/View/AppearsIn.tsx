import Link from "next/link";
import { Badge } from "@discontent/component-library/components/ui/badge";
import type { AppearsInEntry } from "../../controller/groupAggregateConfigs";
import { groupsByRecipeReads } from "../../controller/data/readGroupsByRecipe";
import { groupKindLabel } from "../../util/groupKindLabel";

/**
 * The list itself, given the entries — synchronous, so both the recipe page's
 * block and the group page's (23c) render the same markup and answer to the
 * same testids.
 *
 * Split out rather than parameterised by a reader, because the two callers
 * differ only in *which* aggregate they read and both are async server
 * components; a component that took a reader would be the same split with the
 * seam in a worse place.
 *
 * Renders nothing at all for an empty list, including the `null` an unfolded
 * aggregate answers with — a content directory predating the aggregate has to
 * read as "in no group", not as an empty section with a heading and nothing
 * under it.
 */
export function AppearsInList({
  groups,
}: {
  groups?: AppearsInEntry[] | null;
}) {
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
             * By position: a meal plan may list this member twice, under two
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

/**
 * The groups this recipe is in — one O(1) aggregate read, no walk of anything.
 *
 * The direction is what makes this cheap. Asking "which groups list me?" from
 * the recipe would mean scanning every group on every recipe render; the
 * `groupsByRecipe` fold answers it once per group write instead, and a *recipe*
 * write leaves the value identical, so the aggregate layer reports
 * `changed: false` and fires no tag (D4).
 *
 * Direct parents only, and since 23c that is a decision rather than a fact
 * about the data: a recipe inside a meal plan inside a collection lists the
 * meal plan, because that is the row a reader can click and have explained
 * (D16). Both apps get this because `RecipeView` is shared.
 */
export async function AppearsIn({ slug }: { slug: string }) {
  const map = (await groupsByRecipeReads.read()) ?? {};
  return <AppearsInList groups={map[slug]} />;
}

export default AppearsIn;
