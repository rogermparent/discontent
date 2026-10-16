import { Suspense } from "react";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { auth } from "@/auth";
import { MakePage } from "recipe-website-common/components/MakePage";
import { readTagOptions } from "recipe-website-common/controller/data/readTermPage";
import {
  SAVED_INVENTORY_LABEL,
  secondaryInventory,
} from "recipe-website-common/controller/secondaryInventory";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { SearchSkeleton } from "recipe-website-common/components/SearchForm/SearchSkeleton";
import { saveInventoryChanges } from "recipe-editor/controller/actions/inventory";
import { readInventory } from "recipe-editor/controller/curation/inventory";

/**
 * The editor's `/make` (U6): this browser's list leads, as on the export.
 * A signed-in session also gets the operator's saved inventory (25d's
 * committed list) as a secondary group — "Also makeable with your saved
 * inventory" — and the tools to edit it. A guest gets exactly the export's
 * page, with no saved list read and nothing about it in the payload: the
 * list is private to the content repo's remote, and this is a page that
 * would otherwise leak it.
 */
export default async function Make() {
  const session = await auth();
  const signedIn = !!session?.user?.email;
  const [saved, secondary, tags] = await Promise.all([
    signedIn
      ? readInventory({ contentDirectory: getContentDirectory() }).then(
          (inventory) => inventory.items,
        )
      : undefined,
    /* A guest's secondary group is the export's: the house snapshot when
     * this process was built with one, which by default it is not. */
    signedIn ? undefined : secondaryInventory(),
    readTagOptions(),
  ]);
  return (
    <PageMain>
      <PageSection grow maxWidth="none" className="max-w-7xl mx-auto">
        {/* `useSearchParams` reads `?q=`: without a boundary the static
            export's `next build` refuses the page. */}
        <Suspense fallback={<SearchSkeleton />}>
          <MakePage
            tags={tags}
            secondary={secondary}
            saved={
              saved
                ? {
                    items: saved,
                    label: SAVED_INVENTORY_LABEL,
                    save: saveInventoryChanges,
                  }
                : undefined
            }
          />
        </Suspense>
      </PageSection>
    </PageMain>
  );
}
