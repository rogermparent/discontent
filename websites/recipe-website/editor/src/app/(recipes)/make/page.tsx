import { access } from "node:fs/promises";
import { Suspense } from "react";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { auth } from "@/auth";
import { MakePage } from "recipe-website-common/components/MakePage";
import { readTagOptions } from "recipe-website-common/controller/data/readTermPage";
import { secondaryInventory } from "recipe-website-common/controller/secondaryInventory";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { SearchSkeleton } from "recipe-website-common/components/SearchForm/SearchSkeleton";
import { saveInventoryChanges } from "recipe-editor/controller/actions/inventory";
import { saveMakeStaples } from "recipe-editor/controller/actions/makeStaples";
import { readSettings } from "@/settings";
import { readInventory } from "recipe-editor/controller/curation/inventory";
import {
  ASK_MAX_ITEMS,
  ASK_SCOPE_PARAM,
} from "recipe-editor/controller/ask/urls";

/**
 * The editor's `/make` (U6, 41h): this browser's list leads, as on the
 * export. A signed-in session also gets the operator's saved inventory
 * (25d's committed list) as the page's second list — "Count from" offers it
 * alone or with this browser's, and "Save to editor" writes this browser's
 * list to it as one commit; its labels' × and "Add to saved list" edit it
 * item by item, one commit each (42a). A guest gets exactly the export's
 * page, with no
 * saved list read and nothing about it in the payload: the list is private
 * to the content repo's remote, and this is a page that would otherwise
 * leak it.
 *
 * A signed-in session also gets its saved "Assume I always have" list
 * (38a, `settings.makeStaples`), which seeds a browser still on the default
 * list and is saved on every change; a guest's staples are its browser's.
 */
export default async function Make({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
   * 43q: an Ask's temporary scope (`?with=`, pattern items). A new Ask on
   * this page (a new `?ask=`) resets the page's query and scope inside
   * `MakePage` (Dq13) — never a `key` here, which would remount the page
   * mid-edit once Dismiss had dropped `?ask=` and a save revalidated.
   */
  const params = await searchParams;
  const scopeParam = params[ASK_SCOPE_PARAM];
  const askScope = (
    Array.isArray(scopeParam) ? scopeParam : scopeParam ? [scopeParam] : []
  ).slice(0, ASK_MAX_ITEMS);
  const session = await auth();
  const signedIn = !!session?.user?.email;
  const [saved, secondary, tags, settings] = await Promise.all([
    signedIn
      ? readInventory({ contentDirectory: getContentDirectory() }).then(
          async ({ items, path }) => ({
            items,
            /* No file yet: a pre-U6 overlay waits rather than migrating
             * over a list it can't see (`SavedInventoryProps.missing`). */
            missing: await access(path).then(
              () => false,
              () => true,
            ),
          }),
        )
      : undefined,
    /* A guest's secondary group is the export's: the house snapshot when
     * this process was built with one, which by default it is not. */
    signedIn ? undefined : secondaryInventory(),
    readTagOptions(),
    /* 38a: the saved "Assume I always have" list — signed in only. */
    signedIn ? readSettings() : undefined,
  ]);
  return (
    <PageMain>
      <PageSection grow maxWidth="none" className="max-w-7xl mx-auto">
        {/* `useSearchParams` reads `?q=`: without a boundary the static
            export's `next build` refuses the page. */}
        <Suspense fallback={<SearchSkeleton />}>
          <MakePage
            askScope={askScope.length > 0 ? askScope : undefined}
            tags={tags}
            secondary={secondary}
            saved={saved ? { ...saved, save: saveInventoryChanges } : undefined}
            savedStaples={
              settings
                ? { items: settings.makeStaples, save: saveMakeStaples }
                : undefined
            }
          />
        </Suspense>
      </PageSection>
    </PageMain>
  );
}
