"use client";

import Link from "next/link";
import { getProjectUploadUrl } from "@discontent/projects-collection/controller/uploadUrl";
import { useIndexSearch } from "./SearchContext";
import { highlightMatch } from "./highlight";

/*
 * The two alternate postures.
 *
 * Same components, same data, same search — different order and weight. This is
 * what lets one template serve a developer, a designer and a job-seeker without
 * anyone forking it, which was the whole "audience: all of them" decision.
 *
 * `Index` (the default) lives in ./index.tsx; these are the other two.
 */

function yearOf(date: number): string {
  return String(new Date(date).getUTCFullYear());
}

/**
 * **Studio** — plates lead, as a grid. For work that is looked at rather than
 * read about: the image is the argument, so the row's job is to get out of its
 * way. The name and year sit under the plate, not beside it.
 */
export function StudioPosture({ statement }: { statement?: string }) {
  const { query, results } = useIndexSearch();

  return (
    <>
      {statement && (
        <h1 className="max-w-2xl text-balance font-display text-3xl leading-[1.15] tracking-tight sm:text-4xl">
          {statement}
        </h1>
      )}
      <div
        data-testid="project-index"
        className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3"
      >
        {results.map((project) => (
          <Link
            key={project.slug}
            href={`/project/${project.slug}`}
            data-slot="index-row"
            className="group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <div className="aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-muted">
              {project.image ? (
                // Same bare-filename fix as the Index plate: `project.image` is
                // "cover.png", not a path.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getProjectUploadUrl(project.slug, project.image)}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                // The fallback the Index plate has always had and this tile did
                // not. Studio is the image-forward posture, so an imageless work
                // was an anonymous grey rectangle — the one posture where a
                // missing image costs the most was the one that said nothing.
                <div className="flex size-full items-center justify-center p-4 text-center font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {project.name}
                </div>
              )}
            </div>
            <p className="mt-3 font-display text-lg leading-tight tracking-tight">
              {highlightMatch(project.name, query)}
            </p>
            <p
              data-testid="project-date"
              className="mt-1 font-mono text-xs tabular-nums text-muted-foreground"
            >
              {yearOf(project.date)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}

/**
 * **Résumé** — credentials forward. The statement leads, then roles and skills
 * distilled from the corpus, then a compact list. Someone scanning this is
 * answering "can they do the job", not "what does their work look like", so the
 * works are a reference list rather than the display.
 */
export function ResumePosture({ statement }: { statement?: string }) {
  const { query, results, all } = useIndexSearch();

  // Derived from the corpus rather than a second hand-maintained field — a
  // skills list that can disagree with the work is worse than none.
  const skills = Array.from(new Set(all.flatMap((p) => p.tags ?? []))).sort();
  const roles = Array.from(
    new Set(all.map((p) => p.role).filter(Boolean) as string[]),
  );

  return (
    <>
      {statement && (
        <h1 className="max-w-2xl text-balance font-display text-3xl leading-[1.15] tracking-tight sm:text-4xl">
          {statement}
        </h1>
      )}

      {roles.length > 0 && (
        <section className="mt-8">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Roles
          </h2>
          <p className="mt-2 text-sm">{roles.join(" · ")}</p>
        </section>
      )}

      {skills.length > 0 && (
        <section className="mt-6">
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Skills
          </h2>
          <p className="mt-2 text-sm">{skills.join(" · ")}</p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Selected work
        </h2>
        <div data-testid="project-index" className="mt-3">
          {results.map((project) => (
            <Link
              key={project.slug}
              href={`/project/${project.slug}`}
              data-slot="index-row"
              className="grid grid-cols-[3.5rem_1fr] items-baseline gap-x-4 border-b border-border py-2.5 last:border-b-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            >
              <span
                data-testid="project-date"
                className="font-mono text-xs tabular-nums text-muted-foreground"
              >
                {yearOf(project.date)}
              </span>
              <span className="min-w-0">
                <span className="font-display text-base leading-tight">
                  {highlightMatch(project.name, query)}
                </span>
                {project.role && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {project.role}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
