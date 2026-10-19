import { Fragment } from "react";
import Link from "next/link";
import type {
  HomepageFacet,
  HomepageFacetChild,
} from "../../controller/homepageFacets";
import { HomeSection } from "./HomeSection";

/** How many children each facet shows on the homepage (42f, canvas B). */
export const BROWSE_CHILD_LIMIT = 3;

/** A child term as a link: its label, then its subtree total in mono. */
function FacetLink({ term }: { term: HomepageFacetChild }) {
  return (
    <Link
      href={`/tags/${term.slug}`}
      className="inline-flex min-h-6 items-baseline gap-1 underline-offset-4 hover:underline"
    >
      {term.label}{" "}
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {term.total}
      </span>
    </Link>
  );
}

/**
 * One facet root as a cell: the root's name in the mono label face, linking
 * to its page (which lists the whole subtree, 34a), then its biggest
 * children on one line.
 *
 * The root is an `h3` so the cells are navigable by heading.
 */
function FacetCell({ facet }: { facet: HomepageFacet }) {
  return (
    <li
      className="flex flex-col gap-0.5 border-b border-border py-2.5"
      data-testid="home-facet"
    >
      <h3 className="font-mono text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
        <Link
          href={`/tags/${facet.slug}`}
          className="inline-flex min-h-6 items-center underline-offset-4 hover:text-foreground hover:underline"
        >
          {facet.label}
        </Link>
      </h3>
      <p className="flex flex-row flex-wrap items-baseline gap-x-1.5 text-[0.8125rem] leading-5">
        {facet.children.map((term, index) => (
          <Fragment key={term.slug}>
            {index > 0 && (
              <span aria-hidden className="text-muted-foreground">
                ·
              </span>
            )}
            <FacetLink term={term} />
          </Fragment>
        ))}
      </p>
    </li>
  );
}

/**
 * The homepage's "Browse" section: one cell per facet root of the tag
 * vocabulary, three to a row on a laptop, each the root and its three
 * biggest children (42f, canvas B — six wrapping rows of chips until then).
 *
 * Which roots and in what order is `homepageFacets`' decision, made in the
 * route; this only draws them. The caller renders `BrowseChips` instead when
 * there are no facets, so a corpus without term records still gets a row of
 * ways in.
 *
 * Every link goes to a term page (`/tags/<slug>`), not to a `tag:` search: a
 * term page lists the term's whole subtree and leads with its pinned recipes,
 * which is the curated view the records exist for. The root's page is where
 * the children past the first three are. The labels are the records', never
 * the slugs.
 */
export function BrowseTerms({ facets }: { facets: HomepageFacet[] }) {
  if (facets.length === 0) return null;
  return (
    <HomeSection
      id="home-browse"
      title="Browse"
      link={{ href: "/tags", label: "Every tag" }}
      className="gap-2"
    >
      <ul
        className="grid grid-cols-1 gap-x-6 border-t border-border sm:grid-cols-2 md:grid-cols-3"
        data-testid="home-facets"
      >
        {facets.map((facet) => (
          <FacetCell key={facet.slug} facet={facet} />
        ))}
      </ul>
    </HomeSection>
  );
}

export default BrowseTerms;
