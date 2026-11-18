import Link from "next/link";
import type { HomepageFacet } from "../../controller/homepageFacets";

/**
 * How many children `homepageFacets` keeps per root (42f). The index line
 * (48e) prints none, but the totals and order still come from the same call.
 */
export const BROWSE_CHILD_LIMIT = 3;

/**
 * The homepage's "Browse" (48e, canvas B: "Browse as one index line"): one
 * link per facet root of the tag vocabulary — Course, Main ingredient,
 * Cuisine, Speed & effort, Drinks… — each with its subtree's total, then
 * "Every tag". Until 48e each root was a cell with its three biggest
 * children; the root's page (`/tags/<slug>`, 34a) lists its whole subtree,
 * and `/tags`' board narrows it.
 *
 * Which roots and in what order is `homepageFacets`' decision, made in the
 * route; this only draws them. The caller renders `BrowseChips` instead when
 * there are no facets, so a corpus without term records still gets a row of
 * ways in. The labels are the records', never the slugs.
 */
export function BrowseTerms({ facets }: { facets: HomepageFacet[] }) {
  if (facets.length === 0) return null;
  return (
    <nav
      aria-labelledby="home-browse"
      className="flex flex-row flex-wrap items-baseline gap-x-5 gap-y-1.5 border-t border-border pt-4"
      data-testid="home-facets"
    >
      <h2
        id="home-browse"
        className="mr-1 font-display text-lg font-semibold tracking-tight"
      >
        Browse
      </h2>
      {facets.map((facet) => (
        <Link
          key={facet.slug}
          href={`/tags/${facet.slug}`}
          className="inline-flex min-h-8 items-baseline gap-1 text-sm underline-offset-4 hover:underline"
          data-testid="home-facet"
        >
          {facet.label}{" "}
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {facet.total}
          </span>
        </Link>
      ))}
      <Link
        href="/tags"
        className="inline-flex min-h-8 items-baseline text-sm text-primary underline-offset-4 hover:underline"
      >
        Every tag
      </Link>
    </nav>
  );
}

export default BrowseTerms;
