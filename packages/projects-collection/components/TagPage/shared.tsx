import Link from "next/link";
import type { ProjectListEntry } from "../../controller/paginationConfigs";

/*
 * Portfolio's tag pages.
 *
 * They live **in the collection**, not in the site (D4): the content type that
 * declares the vocabulary is here, and a package reaching into a site that
 * consumes it inverts the dependency. They also cannot borrow the recipe site's
 * `TagPage` — a collection importing `websites/recipe-website` would be the
 * same inversion, one workspace further out.
 *
 * So the markup is portfolio's own, deliberately small: the page shell is the
 * one `project/[slug]/page.tsx` uses, and the rows restate `IndexRow`'s three
 * class strings rather than reusing it. `IndexRow` is private to `Index` and
 * bound to its search context — it is a client component that reads
 * `useIndexSearch` — so there is nothing here to reuse, and a tag page has no
 * search to be part of.
 */

function yearOf(date: number): string {
  return String(new Date(date).getUTCFullYear());
}

/** The shell both pages share — the same one a case study renders in. */
function TagPageMain({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl grow px-4 py-12 sm:px-6 sm:py-16">
      {children}
    </main>
  );
}

/** `/tags/<slug>` — every project carrying one term, newest first. */
export function ProjectTagPage({
  label,
  projects,
}: {
  label: string;
  projects: ProjectListEntry[];
}) {
  return (
    <TagPageMain>
      <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
        {label}
      </h1>
      <ul className="mt-8" data-testid="tag-projects">
        {projects.map((project) => (
          <li key={project.slug}>
            <Link
              href={`/project/${project.slug}`}
              data-slot="index-row"
              className="group grid grid-cols-[3.5rem_1fr] items-baseline gap-x-4 border-b border-border py-4 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:grid-cols-[4.5rem_1fr]"
            >
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {yearOf(project.date)}
              </span>
              <span className="min-w-0">
                <span className="block font-display text-xl leading-tight tracking-tight sm:text-2xl">
                  {project.name}
                </span>
                {project.summary && (
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {project.summary}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </TagPageMain>
  );
}

/** `/tags` — every term with how many projects carry it. */
export function ProjectTagIndexPage({
  tags,
}: {
  tags: Array<{ slug: string; label: string; count: number }>;
}) {
  return (
    <TagPageMain>
      <h1 className="font-display text-3xl tracking-tight sm:text-4xl">Tags</h1>
      {tags.length > 0 ? (
        <ul className="mt-8" data-testid="tag-index">
          {tags.map((tag) => (
            <li key={tag.slug}>
              <Link
                href={`/tags/${tag.slug}`}
                className="group flex flex-row items-baseline justify-between gap-x-4 border-b border-border py-3 transition-colors last:border-b-0 hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
              >
                <span className="font-mono text-sm uppercase tracking-widest">
                  {tag.label}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {tag.count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">
          No projects have tags yet.
        </p>
      )}
    </TagPageMain>
  );
}
