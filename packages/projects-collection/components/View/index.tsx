import { Project } from "../../controller/types";
import { getProjectUploadUrl } from "../../controller/uploadUrl";

import Markdown from "@discontent/component-library/components/Markdown";

/**
 * A work's case study.
 *
 * This used to destructure `{ name, content }` and render nothing else, while
 * the form collected — and the write path stored, indexed and shipped —
 * `summary`, `role`, `client`, `status`, `tags` and `links`. `links` in
 * particular had URL validation, an empty-list sentinel and a full repeatable
 * editing UI behind it, and no reader anywhere in the site. Editing a field
 * that changes nothing you can see is worse than not having the field.
 *
 * The design rule the layout serves: **accent marks, it never fills.** The
 * masthead carries the personality; a case study is the thing on the wall, so
 * the chrome around it is mono labels and rules, and the accent appears only on
 * the focus ring and the one status mark. No tinted callouts, no filled chips.
 */

const STATUS_LABELS: Record<NonNullable<Project["status"]>, string> = {
  shipped: "Shipped",
  wip: "In progress",
  archived: "Archived",
};

/** A mono label over its value — the case study's whole metadata idiom. */
function MetaItem({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export const ProjectView = ({
  project,
  slug,
}: {
  project?: Project;
  /**
   * The project's slug. Optional only because the image is: `project.image` is
   * a bare filename, so without the slug there is no URL to build and the
   * image is skipped rather than rendered broken.
   */
  slug?: string;
}) => {
  if (!project) {
    throw new Error("Project data not found!");
  }

  const {
    name,
    summary,
    content,
    role,
    client,
    status,
    tags,
    date,
    links,
    image,
  } = project;

  const year = date ? String(new Date(date).getUTCFullYear()) : undefined;
  const hasMeta = Boolean(role || client || status || year);

  return (
    <article className="flex h-full w-full max-w-3xl grow flex-col flex-nowrap p-2 print:p-0">
      <header>
        <h1 className="mt-4 font-display text-3xl leading-[1.15] tracking-tight sm:text-4xl">
          {name}
        </h1>

        {summary && (
          <p className="mt-3 max-w-2xl text-balance text-lg text-muted-foreground">
            {summary}
          </p>
        )}

        {hasMeta && (
          // A definition list, not a row of chips: these are labelled values,
          // and a screen reader should hear "Role: Design & build" rather than
          // two unrelated strings.
          <dl className="mt-6 flex flex-row flex-wrap gap-x-10 gap-y-4 border-t border-border pt-5">
            {role && <MetaItem label="Role">{role}</MetaItem>}
            {client && <MetaItem label="Client">{client}</MetaItem>}
            {year && <MetaItem label="Year">{year}</MetaItem>}
            {status && (
              <div>
                <dt className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                  Status
                </dt>
                <dd className="mt-1 flex items-center gap-2 text-sm">
                  {/* The accent's one appearance in the body: a mark, not a
                      fill, and not a coloured pill. Shipped work earns the
                      accent; everything else takes the muted dot, so colour is
                      never the only channel carrying the meaning — the label
                      beside it says the same thing. */}
                  <span
                    aria-hidden
                    className={
                      status === "shipped"
                        ? "size-2 shrink-0 rounded-[0.15rem] bg-primary"
                        : "size-2 shrink-0 rounded-[0.15rem] bg-muted-foreground/50"
                    }
                  />
                  {STATUS_LABELS[status]}
                </dd>
              </div>
            )}
          </dl>
        )}

        {tags && tags.length > 0 && (
          <ul
            aria-label="Tags"
            className="mt-5 flex flex-row flex-wrap gap-x-3 gap-y-1"
          >
            {tags.map((tag) => (
              <li
                key={tag}
                className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
      </header>

      {image && slug && (
        // Plain <img>, deliberately. next/image would want intrinsic dimensions
        // this record does not carry, and the responsive-webp pipeline
        // (@discontent/next-static-image) resizes with sharp at render time —
        // which is a cost per project page for one hero image. `loading="lazy"`
        // and the aspect box keep it from shifting the layout.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getProjectUploadUrl(slug, image)}
          alt=""
          loading="lazy"
          className="mt-8 aspect-[3/2] w-full rounded-md border border-border bg-muted object-cover"
        />
      )}

      {content && (
        <div className="mt-8 border-t border-border pt-8">
          <Markdown>{content}</Markdown>
        </div>
      )}

      {links && links.length > 0 && (
        <nav
          aria-label="Project links"
          className="mt-10 flex flex-row flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 print:hidden"
        >
          {/*
            `rel="noopener noreferrer"` for the same reason the footer's contact
            links carry it: these are owner-authored outbound URLs. The href is
            zod-validated as a URL at the form boundary, which is what keeps a
            `javascript:` scheme out of this attribute.
          */}
          {links.map(({ label, url }) => (
            <a
              key={`${label}-${url}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {label}
            </a>
          ))}
        </nav>
      )}
    </article>
  );
};
