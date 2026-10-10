import Markdown, { MarkdownToJSX } from "markdown-to-jsx/react";
import Link from "next/link";
import { ReactNode, ElementType } from "react";
import { Url } from "url";
import { normalizeLineEndings } from "./normalize";

function MarkdownLink({
  href,
  children,
}: {
  href?: Url | string;
  children?: ReactNode;
}) {
  if (!href) {
    throw new Error("Link given no URL");
  }
  return (
    <Link href={href} target="_blank">
      {children}
    </Link>
  );
}

/**
 * A table in its own sideways scroller (epic 31): a wide chart scrolls inside
 * the column instead of pushing the page past the viewport on a phone.
 */
function MarkdownTable({ children }: { children?: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  );
}

export default function StyledMarkdown({
  children,
  components,
  forceWrapper,
  forceInline,
  forceBlock,
  className = "markdown-body",
  wrapper,
}: {
  children: string;
  components?: MarkdownToJSX.Overrides;
  forceWrapper?: boolean;
  forceInline?: boolean;
  forceBlock?: boolean;
  className?: string;
  wrapper?: ElementType;
}) {
  return (
    <Markdown
      className={className}
      options={{
        overrides: {
          a: {
            component: MarkdownLink,
          },
          table: {
            component: MarkdownTable,
          },
          ...components,
        },
        forceWrapper,
        forceInline,
        forceBlock,
        wrapper,
      }}
    >
      {/*
       * Only a string is normalised. Content can reach here with no text at
       * all — 38 recipes carry an ingredient-style `{type: "heading", name}`
       * entry in `instructions`, which renders its step with `text`
       * undefined — and markdown-to-jsx renders that as nothing, which is what
       * those pages did before the CRLF fix made it a `.replace` on undefined
       * and every one of them a 500 (found by epic 30a's export gate).
       */}
      {typeof children === "string" ? normalizeLineEndings(children) : children}
    </Markdown>
  );
}
