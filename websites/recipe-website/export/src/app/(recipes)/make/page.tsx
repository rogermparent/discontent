import { Suspense } from "react";
import { MakePage } from "recipe-website-common/components/MakePage";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { SearchSkeleton } from "recipe-website-common/components/SearchForm/SearchSkeleton";

/**
 * Browser-only here, by decision (25c/D10): the export has no shared list and
 * never reads one — no route or file on this site exposes the editor's
 * inventory. What this browser has lives in its `localStorage`.
 */
export default function Make() {
  return (
    <PageMain>
      <PageSection grow maxWidth="none" className="max-w-7xl mx-auto">
        {/* `useSearchParams` reads `?q=`: without a boundary `next build`
            refuses the page. */}
        <Suspense fallback={<SearchSkeleton />}>
          <MakePage />
        </Suspense>
      </PageSection>
    </PageMain>
  );
}
