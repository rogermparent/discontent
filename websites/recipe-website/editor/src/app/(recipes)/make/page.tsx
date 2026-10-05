import { Suspense } from "react";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { auth } from "@/auth";
import { MakePage } from "recipe-website-common/components/MakePage";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { SearchSkeleton } from "recipe-website-common/components/SearchForm/SearchSkeleton";
import { saveInventoryChanges } from "recipe-editor/controller/actions/inventory";
import { readInventory } from "recipe-editor/controller/curation/inventory";

/**
 * The editor's `/make`: the browser inventory of 25c, layered over the
 * content repository's shared list (25d) — but **only for a signed-in
 * session**. A guest gets exactly the export's page, with no shared list read
 * and nothing about it in the payload: the list is private to the content
 * repo's remote, and this is the one page that would otherwise leak it.
 */
export default async function Make() {
  const session = await auth();
  const shared = session?.user?.email
    ? (await readInventory({ contentDirectory: getContentDirectory() })).items
    : undefined;
  return (
    <PageMain>
      <PageSection grow maxWidth="none" className="max-w-7xl mx-auto">
        {/* `useSearchParams` reads `?q=`: without a boundary the static
            export's `next build` refuses the page. */}
        <Suspense fallback={<SearchSkeleton />}>
          <MakePage
            shared={shared}
            saveShared={shared ? saveInventoryChanges : undefined}
          />
        </Suspense>
      </PageSection>
    </PageMain>
  );
}
