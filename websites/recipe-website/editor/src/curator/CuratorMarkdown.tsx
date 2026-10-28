"use client";

import Link from "next/link";
import Markdown from "markdown-to-jsx/react";
import { useMemo, type ReactNode } from "react";
import {
  NOTHING_KNOWN,
  fixedSitePath,
  sitePath,
  type LinkKnown,
} from "./links";

/**
 * A curator turn's words as Markdown (44d). The model's text can carry a
 * page's words (it read them), so **no raw HTML is parsed** — a `<script>`
 * or an `<img onerror>` in it stays text — and a link is one of four
 * things: a page of this site (`/recipe/<slug>`, or an absolute URL on this
 * origin) opens in the app with Next's `Link`; this site's page — a slug
 * its tools answered with — on a host the model made up (46d,
 * `fixedSitePath`) opens in the app too, marked
 * "link fixed"; an `http(s)` URL opens in a new tab, `noopener noreferrer`;
 * anything else (`javascript:`, `data:`) is its words, not a link.
 */
function CuratorLink({
  href,
  children,
  known = NOTHING_KNOWN,
}: {
  href?: string;
  children?: ReactNode;
  known?: LinkKnown;
}) {
  const inApp = sitePath(href);
  if (inApp) {
    return <Link href={inApp}>{children}</Link>;
  }
  const fixed = fixedSitePath(href, known);
  if (fixed) {
    return (
      <Link
        href={fixed}
        title={`Link fixed: the curator wrote ${href}`}
        data-link-fixed=""
      >
        {children}
        <span className="text-xs text-muted-foreground"> (link fixed)</span>
      </Link>
    );
  }
  if (href && /^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <span>{children}</span>;
}

/** Pictures in the model's words are not loaded: its alt text shows. */
function CuratorImage({ alt }: { alt?: string }) {
  return alt ? <span>[{alt}]</span> : null;
}

/** A model's heading is a strong line, not the page's outline. */
const STRONG_LINE = {
  component: "p" as const,
  props: { className: "font-semibold" },
};

export function CuratorMarkdown({
  children,
  known = NOTHING_KNOWN,
}: {
  children: string;
  /**
   * The hosts the conversation has seen and the slugs this site's tools
   * answered with (46d): only a link to one of those slugs, on a host never
   * seen, is "fixed" into the app.
   */
  known?: LinkKnown;
}) {
  const options = useMemo(
    () => ({
      disableParsingRawHTML: true,
      overrides: {
        a: { component: CuratorLink, props: { known } },
        img: { component: CuratorImage },
        h1: STRONG_LINE,
        h2: STRONG_LINE,
        h3: STRONG_LINE,
        h4: STRONG_LINE,
        h5: STRONG_LINE,
        h6: STRONG_LINE,
      },
    }),
    [known],
  );
  return (
    <Markdown
      className="markdown-body min-w-0 text-sm leading-6 break-words [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2"
      options={options}
    >
      {children}
    </Markdown>
  );
}
