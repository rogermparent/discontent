"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  PageHeading,
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";

/**
 * `/tags/<alias>` in the static export (32i, D5): a page that sends the reader
 * on to the canonical term, because a static file cannot answer with a 3xx.
 *
 * Three ways, so every arrival is covered: the `<meta http-equiv="refresh">`
 * for a full page load (React hoists it into `<head>`), `router.replace` for a
 * client-side navigation (a meta tag inserted after load is not acted on), and
 * a plain link for anyone with neither. The canonical link tells a crawler
 * which URL is the term's. The editor never renders this: it answers an alias
 * with a real redirect.
 */
export function TagAliasRedirect({
  alias,
  target,
}: {
  alias: string;
  target: { slug: string; label: string };
}) {
  const href = `/tags/${target.slug}`;
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);

  return (
    <PageMain>
      <PageSection grow>
        <meta httpEquiv="refresh" content={`0;url=${href}`} />
        <link rel="canonical" href={href} />
        <PageHeading>{target.label}</PageHeading>
        <p data-testid="tag-alias-redirect">
          &ldquo;{alias}&rdquo; is another name for{" "}
          <Link href={href} className="underline underline-offset-4">
            {target.label}
          </Link>
          .
        </p>
      </PageSection>
    </PageMain>
  );
}
