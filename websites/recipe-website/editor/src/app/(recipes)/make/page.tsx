import { Suspense } from "react";
import { MakePage } from "recipe-website-common/components/MakePage";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { SearchSkeleton } from "recipe-website-common/components/SearchForm/SearchSkeleton";

export default function Make() {
  return (
    <PageMain>
      <PageSection grow maxWidth="none" className="max-w-7xl mx-auto">
        {/* `useSearchParams` reads `?q=`: without a boundary the static
            export's `next build` refuses the page. */}
        <Suspense fallback={<SearchSkeleton />}>
          <MakePage />
        </Suspense>
      </PageSection>
    </PageMain>
  );
}
