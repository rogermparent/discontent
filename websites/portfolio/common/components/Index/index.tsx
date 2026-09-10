"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProjectIndexEntry } from "@discontent/projects-collection/controller/data/readIndex";
import { getProjectUploadUrl } from "@discontent/projects-collection/controller/uploadUrl";
import { useIndexSearch } from "./SearchContext";
import { highlightMatch } from "./highlight";

/*
 * The index — the site's signature.
 *
 * Two decisions are load-bearing here:
 *
 * 1. **The index doubles as the search surface.** Typing filters rows in place:
 *    no results page, no modal, no route change. The count line is an
 *    aria-live region, so a screen-reader user is told the list changed under
 *    them rather than discovering it by arrowing into a shorter list.
 *
 * 2. **The structural device is the year rail, not numbering.** `01 / 02 / 03`
 *    would encode a sequence, and a portfolio's works are not a sequence. Dates
 *    encode recency, which is what a reader actually wants from the left margin.
 *
 * Motion budget: the plate cross-fade and nothing else. No load-in stagger — it
 * would delay the content that *is* the hero, and a staggered list reveal is the
 * single most recognizable templated-design tic.
 */

function yearOf(date: number): string {
  return String(new Date(date).getUTCFullYear());
}

function IndexRow({
  project,
  query,
  onFocus,
}: {
  project: ProjectIndexEntry;
  query: string;
  onFocus: () => void;
}) {
  return (
    <Link
      href={`/project/${project.slug}`}
      data-slot="index-row"
      onMouseEnter={onFocus}
      onFocus={onFocus}
      className="group grid grid-cols-[3.5rem_1fr] items-baseline gap-x-4 border-b border-border py-4 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:grid-cols-[4.5rem_1fr]"
    >
      <span
        data-testid="project-date"
        className="font-mono text-xs tabular-nums text-muted-foreground"
      >
        {yearOf(project.date)}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-xl leading-tight tracking-tight sm:text-2xl">
          {/*
            `featured`'s one and only reader.
            It was editable in the form, parsed, stored, indexed and shipped to
            the client, and nothing anywhere rendered it — five layers to no
            effect. The mark belongs here because the index is the catalog, and
            "selected work" is a curatorial claim about the list.
            An accent square, per the annotation-colour rule: accent marks, it
            never fills. Colour is not the only channel — the visually-hidden
            label says the same thing, so the distinction survives greyscale and
            a screen reader both.
          */}
          {project.featured && (
            <>
              <span className="sr-only">Selected work: </span>
              <span
                aria-hidden
                data-testid="featured-mark"
                className="mr-2 inline-block size-2 shrink-0 translate-y-[-0.15em] rounded-[0.15rem] bg-primary align-middle"
              />
            </>
          )}
          {highlightMatch(project.name, query)}
        </span>
        {project.summary && (
          <span className="mt-1 block text-sm text-muted-foreground">
            {highlightMatch(project.summary, query)}
          </span>
        )}
        {project.tags && project.tags.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </span>
        )}
      </span>
    </Link>
  );
}

/** The plate: the focused entry's cover. Cross-fade only. */
function Plate({ project }: { project?: ProjectIndexEntry }) {
  return (
    <div
      aria-hidden
      className="sticky top-[calc(var(--header-height)+2rem)] hidden aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-muted lg:block"
    >
      {project?.image ? (
        // `project.image` is a bare filename — "cover.png", not a path — so
        // using it as `src` directly, which is what this did, requested
        // `/cover.png` from the site root and 404'd for every project that had
        // one. The URL is built from the collection's uploads layout instead.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getProjectUploadUrl(project.slug, project.image)}
          alt=""
          className="size-full object-cover transition-opacity duration-200"
          key={project.slug}
        />
      ) : (
        <div className="flex size-full items-center justify-center p-6 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {project?.name ?? ""}
        </div>
      )}
    </div>
  );
}

export function IndexPosture({ statement }: { statement?: string }) {
  const { query, all, results } = useIndexSearch();
  const [focused, setFocused] = useState<ProjectIndexEntry | undefined>(
    () => all[0],
  );

  return (
    <>
      {statement && (
        <h1 className="max-w-2xl text-balance font-display text-3xl leading-[1.15] tracking-tight sm:text-4xl">
          {statement}
        </h1>
      )}

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_18rem] lg:gap-14">
        {/* Plain divs, not a <ul>: role="listitem" here would pollute unscoped
            getByRole("listitem") counts across the suite. */}
        <div data-testid="project-index">
          {results.length > 0 ? (
            results.map((project) => (
              <IndexRow
                key={project.slug}
                project={project}
                query={query}
                onFocus={() => setFocused(project)}
              />
            ))
          ) : (
            <p className="py-12 text-sm text-muted-foreground">
              Nothing matches “{query}”.
            </p>
          )}
        </div>
        <Plate project={results.includes(focused!) ? focused : results[0]} />
      </div>
    </>
  );
}

export default IndexPosture;
