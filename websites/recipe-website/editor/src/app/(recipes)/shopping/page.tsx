import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { auth, redirectToLogin } from "@/auth";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import {
  addShoppingListLayer,
  addToShoppingList,
  decideShoppingListMerge,
  loadShoppingList,
  removeShoppingListLayer,
  setShoppingListLayer,
  setShoppingListLeaveOff,
  splitShoppingListMerge,
  updateShoppingList,
  updateShoppingListSettings,
} from "recipe-editor/controller/actions/shopping";
import { readInventory } from "recipe-editor/controller/curation/inventory";
import {
  readShopping,
  readShoppingPlanNames,
  readTidyRuns,
} from "recipe-editor/controller/curation/shopping";
import { readTidyModels } from "recipe-editor/controller/llm/shoppingTidy";
import { tidyRunView } from "recipe-website-common/util/shoppingTidy";
import { editModels } from "recipe-editor/controller/llm/askEdit";
import { readerLabel } from "recipe-editor/controller/llm/readerLabel";
import ShoppingWithModel from "./ShoppingWithModel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Shopping list" };

/**
 * `/shopping` (epic 35, 35d): the shared shopping list, signed-in only — the
 * list lives in the content repository and nothing else serves it. The page
 * reads the stored items, the settings and the on-hand list; the browser
 * builds the view (D3) and batches ticks to `PATCH /api/shopping` (D9).
 * 49b: where this editor has a model (Edit with AI's), the page can ask it
 * about the merges (`ShoppingWithModel`).
 */
export default async function ShoppingListPage() {
  const session = await auth();
  if (!session?.user?.email) {
    return redirectToLogin("/shopping");
  }
  const ctx = { contentDirectory: getContentDirectory() };
  const [{ items, settings, merges, layers, rules }, inventory] =
    await Promise.all([readShopping(ctx), readInventory(ctx)]);
  const [plans, tidyModels, tidyRuns] = await Promise.all([
    readShoppingPlanNames(ctx, items),
    readTidyModels(),
    readTidyRuns(ctx),
  ]);
  const models = editModels();
  return (
    <PageMain>
      <PageSection maxWidth="none" grow className="print:p-0">
        <ShoppingWithModel
          initial={{
            items,
            settings,
            inventory: inventory.items,
            plans,
            merges,
            layers,
            rules,
          }}
          actions={{
            load: loadShoppingList,
            add: addToShoppingList,
            update: updateShoppingList,
            saveSettings: updateShoppingListSettings,
            decideMerge: decideShoppingListMerge,
            splitMerge: splitShoppingListMerge,
            addLayer: addShoppingListLayer,
            setLayer: setShoppingListLayer,
            removeLayer: removeShoppingListLayer,
            leaveOff: setShoppingListLeaveOff,
          }}
          patchUrl="/api/shopping"
          tidyModels={tidyModels.choices}
          {...(tidyRuns[0] ? { tidyRun: tidyRunView(tidyRuns[0], items) } : {})}
          models={{
            ...(models.local ? { local: readerLabel(models.local) } : {}),
            ...(models.claude ? { claude: readerLabel(models.claude) } : {}),
          }}
        />
      </PageSection>
    </PageMain>
  );
}
