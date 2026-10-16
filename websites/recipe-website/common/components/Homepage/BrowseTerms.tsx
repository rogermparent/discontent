import Link from "next/link";
import type {
  HomepageFacet,
  HomepageFacetChild,
} from "../../controller/homepageFacets";
import { TermImage } from "../TermImage";
import { HomeSection } from "./HomeSection";

const CHIP =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-card-foreground transition-colors hover:border-primary/50";

/** A child term as a chip: its picture when it has one, its label, its total. */
function FacetChip({ term }: { term: HomepageFacetChild }) {
  return (
    <Link href={`/tags/${term.slug}`} className={CHIP}>
      {term.image && (
        <span className="-ml-1.5 size-6 shrink-0 overflow-hidden rounded-full">
          <TermImage
            slug={term.slug}
            image={term.image}
            alt=""
            width={48}
            height={48}
            sizes="24px"
            className="h-full w-full object-cover"
          />
        </span>
      )}
      {term.label}{" "}
      <span className="font-mono text-[0.6875rem] tabular-nums text-muted-foreground">
        {term.total}
      </span>
    </Link>
  );
}

/**
 * One facet root as a row: the root's name in the mono label face, linking
 * to its page (which lists the whole subtree, 34a), then its biggest children
 * as chips, then "More" when the cap left some out.
 *
 * The root is an `h3` so the rows are navigable by heading, styled as the
 * small caps label direction A draws.
 */
function FacetRow({ facet }: { facet: HomepageFacet }) {
  return (
    <li
      className="flex flex-row flex-wrap items-baseline gap-x-5 gap-y-2.5 border-b border-border py-3.5"
      data-testid="home-facet"
    >
      <h3 className="flex-[0_0_9.5rem] font-mono text-xs font-normal uppercase tracking-[0.12em] text-muted-foreground">
        <Link
          href={`/tags/${facet.slug}`}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          {facet.label}
        </Link>
      </h3>
      <div className="flex min-w-0 flex-[1_1_25rem] flex-row flex-wrap gap-2">
        {facet.children.map((term) => (
          <FacetChip key={term.slug} term={term} />
        ))}
        {facet.hidden > 0 && (
          <Link
            href={`/tags/${facet.slug}`}
            className="inline-flex min-h-9 items-center px-2 text-sm text-primary underline-offset-4 hover:underline"
          >
            More<span className="sr-only"> {facet.label}</span>
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * The homepage's "Browse" section: one row per facet root of the tag
 * vocabulary (direction A's rows, usability pass 2026-10-15; the structure is
 * the homepage redesign's).
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
    <HomeSection
      id="home-browse"
      title="Browse"
      link={{ href: "/tags", label: "Every tag" }}
    >
      <ul
        className="flex flex-col border-t border-border"
        data-testid="home-facets"
      >
        {facets.map((facet) => (
          <FacetRow key={facet.slug} facet={facet} />
        ))}
      </ul>
    </HomeSection>
  );
}

export default BrowseTerms;
