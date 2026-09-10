import { Skeleton } from "@discontent/component-library/components/ui/skeleton";

/**
 * Placeholder grid shown while the search index builds or a query runs.
 * Renders plain divs (no list items) so pages asserting an empty result list
 * stay at zero list items during loading.
 */
export function SearchSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg bg-card overflow-hidden">
          <Skeleton className="w-full aspect-[2/3] rounded-none" />
          <Skeleton className="h-4 my-2 mx-2 w-3/4" />
          <Skeleton className="h-3 mb-2 mx-2 w-1/3" />
          <div className="flex flex-row gap-1 mx-2 mb-2">
            <Skeleton className="h-4 w-10 rounded-md" />
            <Skeleton className="h-4 w-8 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
