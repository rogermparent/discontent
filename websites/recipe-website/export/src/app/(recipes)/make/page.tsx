import { Suspense } from "react";
import { MakePage } from "recipe-website-common/components/MakePage";
import { readTagOptions } from "recipe-website-common/controller/data/readTermPage";
import { secondaryInventory } from "recipe-website-common/controller/secondaryInventory";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { SearchSkeleton } from "recipe-website-common/components/SearchForm/SearchSkeleton";

/**
 * Browser-first here, by decision (25c/D10, U6): what this visitor has lives
 * in their `localStorage`, and that list is what the page judges. The
 * export never reads the editor's inventory file. The one exception is
 * opt-in: with "Share my saved inventory on the export" on, the editor's
 * build bakes a snapshot into `SITE_HOUSE_INVENTORY`, and `secondaryInventory()`
 * turns it into a separate "Also makeable from the house inventory" group.
 * Off — the default — it answers nothing. The tag vocabulary (28g) is read
 * at build time, like `/tags`.
 */
export default async function Make() {
  const [tags, secondary] = await Promise.all([
    readTagOptions(),
    secondaryInventory(),
  ]);
  return (
    <PageMain>
      <PageSection grow maxWidth="none" className="max-w-7xl mx-auto">
        {/* `useSearchParams` reads `?q=`: without a boundary `next build`
            refuses the page. */}
        <Suspense fallback={<SearchSkeleton />}>
          <MakePage tags={tags} secondary={secondary} />
        </Suspense>
      </PageSection>
    </PageMain>
  );
}
