"use client";

import Link from "next/link";
import Markdown from "markdown-to-jsx/react";
import type { ReactNode } from "react";
import { sitePath } from "./links";

/**
 * A curator turn's words as Markdown (44d). The model's text can carry a
 * page's words (it read them), so **no raw HTML is parsed** — a `<script>`
 * or an `<img onerror>` in it stays text — and a link is one of three
 * things: a page of this site (`/recipe/<slug>`, or an absolute URL on this
 * origin) opens in the app with Next's `Link`; an `http(s)` URL opens in a
 * new tab, `noopener noreferrer`; anything else (`javascript:`, `data:`)
 * is its words, not a link.
 */
function CuratorLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  const inApp = sitePath(href);
  if (inApp) {
    return <Link href={inApp}>{children}</Link>;
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

export function CuratorMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      className="markdown-body min-w-0 text-sm leading-6 break-words [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2"
      options={{
        disableParsingRawHTML: true,
        overrides: {
          a: { component: CuratorLink },
          img: { component: CuratorImage },
          /* A model's heading is a strong line, not the page's outline. */
          h1: { component: "p", props: { className: "font-semibold" } },
          h2: { component: "p", props: { className: "font-semibold" } },
          h3: { component: "p", props: { className: "font-semibold" } },
          h4: { component: "p", props: { className: "font-semibold" } },
          h5: { component: "p", props: { className: "font-semibold" } },
          h6: { component: "p", props: { className: "font-semibold" } },
        },
      }}
    >
      {children}
    </Markdown>
  );
}
