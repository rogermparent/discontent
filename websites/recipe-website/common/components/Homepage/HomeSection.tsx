import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@discontent/component-library/lib/utils";

/**
 * One homepage section: an `h2` with an optional link on its right, then the
 * content. A `section` labelled by its heading, so each is a named region —
 * `featured-recipes.spec.ts` finds the strip as the region "Featured".
 *
 * The link is text, not a button, as direction A draws it: the sections are
 * the content and the link is where more of it is.
 */
export function HomeSection({
  id,
  title,
  link,
  children,
  className,
}: {
  id: string;
  title: string;
  link?: { href: string; label: string };
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id={id}
          className="font-display text-2xl font-semibold tracking-tight"
        >
          {title}
        </h2>
        {link && (
          <Link
            href={link.href}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default HomeSection;
