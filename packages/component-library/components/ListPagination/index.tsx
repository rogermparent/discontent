import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@discontent/component-library/components/ui/pagination";

/** `basePath` for page 1, `basePath?page=N` after it. */
export function listPageHref(basePath: string, page: number): string {
  return page > 1 ? `${basePath}?page=${page}` : basePath;
}

/**
 * Newer / page number / Older links for an editor list read with
 * `readListPage` (`@discontent/cms/content/listPage`): page 1 is the newest
 * rows, at `basePath`; later pages are `?page=N`. A search param rather than a
 * `[page]` segment, because the editors serve content pages at nested slugs
 * through a root catch-all, and `/pages/2` would shadow a page slugged
 * `pages/2`. Renders nothing when there is only one page.
 */
export function ListPagination({
  basePath,
  page,
  newerPage,
  olderPage,
}: {
  basePath: string;
  page: number;
  newerPage: number | null;
  olderPage: number | null;
}) {
  if (newerPage === null && olderPage === null) return null;
  return (
    <Pagination className="my-2">
      <PaginationContent>
        {newerPage !== null && (
          <PaginationItem>
            <PaginationLink asChild size="default">
              <Link href={listPageHref(basePath, newerPage)}>
                <ChevronLeftIcon aria-hidden="true" />
                Newer
              </Link>
            </PaginationLink>
          </PaginationItem>
        )}
        <PaginationItem>
          <span
            data-testid="pagination-page-number"
            className="text-muted-foreground px-2 text-xs tabular-nums"
          >
            {page}
          </span>
        </PaginationItem>
        {olderPage !== null && (
          <PaginationItem>
            <PaginationLink asChild size="default">
              <Link href={listPageHref(basePath, olderPage)}>
                Older
                <ChevronRightIcon aria-hidden="true" />
              </Link>
            </PaginationLink>
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );
}
