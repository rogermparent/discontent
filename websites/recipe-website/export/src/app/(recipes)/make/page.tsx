import { Suspense } from "react";
import { MakePage } from "recipe-website-common/components/MakePage";
import { readTagOptions } from "recipe-website-common/controller/data/readTermPage";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { SearchSkeleton } from "recipe-website-common/components/SearchForm/SearchSkeleton";

/**
 * Browser-only here, by decision (25c/D10): the export has no shared list and
 * never reads one — no route or file on this site exposes the editor's
 * inventory. What this browser has lives in its `localStorage`. The tag
 * vocabulary (28g) is read at build time, like `/tags`.
 */
export default async function Make() {
  const tags = await readTagOptions();
  return (
    <PageMain>
      <PageSection grow maxWidth="none" className="max-w-7xl mx-auto">
        {/* `useSearchParams` reads `?q=`: without a boundary `next build`
            refuses the page. */}
        <Suspense fallback={<SearchSkeleton />}>
          <MakePage tags={tags} />
        </Suspense>
      </PageSection>
    </PageMain>
  );
}
