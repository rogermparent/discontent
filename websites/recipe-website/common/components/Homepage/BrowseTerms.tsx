import Link from "next/link";
import { Badge } from "@discontent/component-library/components/ui/badge";
import type {
  HomepageFacet,
  HomepageFacetChild,
} from "../../controller/homepageFacets";
import { TermImage } from "../TermImage";

/** A child term as a chip: its picture when it has one, its label, its total. */
function FacetChip({ term }: { term: HomepageFacetChild }) {
  return (
    <Badge asChild variant="secondary" className="h-7 gap-1.5 text-sm">
      <Link href={`/tags/${term.slug}`}>
        {term.image && (
          <span className="-ml-1 size-5 shrink-0 overflow-hidden rounded-sm">
            <TermImage
              slug={term.slug}
              image={term.image}
              alt=""
              width={40}
              height={40}
              sizes="20px"
              className="h-full w-full object-cover"
            />
          </span>
        )}
        {term.label}{" "}
        <span className="font-mono text-[0.7em] tabular-nums opacity-70">
          {term.total}
        </span>
      </Link>
    </Badge>
  );
}

/**
 * One facet root: its heading links to the root's page (which lists the
 * whole subtree, 34a), then its biggest children, then "More →" when the cap
 * left some out.
 */
function FacetCard({ facet }: { facet: HomepageFacet }) {
  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground"
      data-testid="home-facet"
    >
      <div className="flex flex-row items-center gap-3">
        {facet.image && (
          <span className="size-9 shrink-0 overflow-hidden rounded-md">
            <TermImage
              slug={facet.slug}
              image={facet.image}
              alt=""
              width={72}
              height={72}
              sizes="36px"
              className="h-full w-full object-cover"
            />
          </span>
        )}
        <h3 className="flex min-w-0 flex-row items-baseline gap-2 font-display text-lg font-semibold leading-tight">
          <Link
            href={`/tags/${facet.slug}`}
            className="underline-offset-4 hover:text-primary hover:underline"
          >
            {facet.label}
          </Link>{" "}
          <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
            {facet.total}
          </span>
        </h3>
      </div>
      <div className="flex flex-row flex-wrap items-center gap-2">
        {facet.children.map((term) => (
          <FacetChip key={term.slug} term={term} />
        ))}
        {facet.hidden > 0 && (
          <Link
            href={`/tags/${facet.slug}`}
            className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            More<span className="sr-only"> {facet.label}</span> →
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * The homepage's "Browse" section (homepage redesign, 2026-10-15): the facet
 * roots of the tag vocabulary, each a card of its biggest children.
 *
 * Which roots and in what order is `homepageFacets`' decision, made in the
 * route; this only draws them. The caller renders `BrowseChips` instead when
 * there are no facets, so a corpus without term records still gets a row of
 * ways in.
 *
 * Every link goes to a term page (`/tags/<slug>`), not to a `tag:` search: a
 * term page lists the term's whole subtree and leads with its pinned recipes,
 * which is the curated view the records exist for. The labels are the
 * records', never the slugs.
 */
export function BrowseTerms({ facets }: { facets: HomepageFacet[] }) {
  if (facets.length === 0) return null;
  return (
    <section aria-labelledby="home-browse" className="mb-10">
      <div className="mb-4 flex flex-row items-baseline justify-between gap-4">
        <h2 id="home-browse" className="font-display text-2xl font-bold">
          Browse
        </h2>
        <Link
          href="/tags"
          className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          All tags →
        </Link>
      </div>
      <ul
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="home-facets"
      >
        {facets.map((facet) => (
          <FacetCard key={facet.slug} facet={facet} />
        ))}
      </ul>
    </section>
  );
}

export default BrowseTerms;
