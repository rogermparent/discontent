import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { auth, redirectToLogin } from "@/auth";
import { ShoppingPage } from "recipe-website-common/components/ShoppingPage";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import {
  addToShoppingList,
  decideShoppingListMerge,
  loadShoppingList,
  splitShoppingListMerge,
  updateShoppingList,
  updateShoppingListSettings,
} from "recipe-editor/controller/actions/shopping";
import { readInventory } from "recipe-editor/controller/curation/inventory";
import {
  readShopping,
  readShoppingPlanNames,
} from "recipe-editor/controller/curation/shopping";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shopping list" };

/**
 * `/shopping` (epic 35, 35d): the shared shopping list, signed-in only — the
 * list lives in the content repository and nothing else serves it. The page
 * reads the stored items, the settings and the on-hand list; the browser
 * builds the view (D3) and batches ticks to `PATCH /api/shopping` (D9).
 */
export default async function ShoppingListPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return redirectToLogin("/shopping");
  }
  const ctx = { contentDirectory: getContentDirectory() };
  const [{ items, settings, merges }, inventory] = await Promise.all([
    readShopping(ctx),
    readInventory(ctx),
  ]);
  const plans = await readShoppingPlanNames(ctx, items);
  return (
    <PageMain>
      <PageSection maxWidth="none" grow className="print:p-0">
        <ShoppingPage
          initial={{
            items,
            settings,
            inventory: inventory.items,
            plans,
            merges,
          }}
          actions={{
            load: loadShoppingList,
            add: addToShoppingList,
            update: updateShoppingList,
            saveSettings: updateShoppingListSettings,
            decideMerge: decideShoppingListMerge,
            splitMerge: splitShoppingListMerge,
          }}
          patchUrl="/api/shopping"
        />
      </PageSection>
    </PageMain>
  );
}
