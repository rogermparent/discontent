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
          ...components,
        },
        forceWrapper,
        forceInline,
        forceBlock,
        wrapper,
      }}
    >
      {normalizeLineEndings(children)}
    </Markdown>
  );
}
