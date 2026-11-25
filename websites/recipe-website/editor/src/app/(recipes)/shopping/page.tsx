import { notFound } from "next/navigation";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { auth, redirectToLogin } from "@/auth";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import {
  addShoppingListLayer,
  addToShoppingList,
  createSavedShoppingList,
  decideShoppingListMerge,
  editSavedShoppingList,
  loadShoppingList,
  promoteShoppingListLayer,
  removeShoppingListLayer,
  removeShoppingListRule,
  setShoppingListLayer,
  setShoppingListLeaveOff,
  setShoppingListRule,
  splitShoppingListMerge,
  updateShoppingList,
  updateShoppingListSettings,
} from "recipe-editor/controller/actions/shopping";
import { readInventory } from "recipe-editor/controller/curation/inventory";
import {
  readShopping,
  readShoppingLists,
  readShoppingPlanNames,
  readTidyRuns,
  resolveShoppingList,
} from "recipe-editor/controller/curation/shopping";
import { listGroups } from "recipe-editor/controller/curation/groups";
import { NotFoundError } from "recipe-editor/controller/curation/errors";
import { readTidyModels } from "recipe-editor/controller/llm/shoppingTidy";
import {
  TIDY_RUNS_SHOWN,
  tidyRunView,
} from "recipe-website-common/util/shoppingTidy";
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
 *
 * 50d: `?list=<id>` is the list shown (the main list without one, unless
 * this browser used another last — the page itself goes there, Dd5). Every
 * action is bound to that list's id; the switcher reads every list.
 */
export default async function ShoppingListPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string | string[] }>;
}) {
  const session = await auth();
  const { list: asked } = await searchParams;
  const named = typeof asked === "string" && asked.trim() ? asked : undefined;
  if (!session?.user?.email) {
    return redirectToLogin(
      named ? `/shopping?list=${encodeURIComponent(named)}` : "/shopping",
    );
  }
  const base = { contentDirectory: getContentDirectory() };
  let scope;
  try {
    scope = await resolveShoppingList(base, named);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const listId = scope.id;
  const ctx = { ...base, shoppingList: listId };
  const [{ items, settings, merges, layers, rules, list }, inventory] =
    await Promise.all([readShopping(ctx), readInventory(ctx)]);
  const [plans, tidyModels, tidyRuns, lists, groups] = await Promise.all([
    readShoppingPlanNames(ctx, items),
    readTidyModels(),
    readTidyRuns(ctx),
    readShoppingLists(ctx),
    listGroups(ctx, { limit: 100 }).catch(() => ({ groups: [] })),
  ]);
  const models = editModels();
  return (
    <PageMain>
      <PageSection maxWidth="none" grow className="print:p-0">
        <ShoppingWithModel
          key={listId}
          list={listId}
          listNamed={named !== undefined}
          lists={lists}
          mealPlans={groups.groups.map(({ slug, name }) => ({
            slug,
            name: name || slug,
          }))}
          listActions={{
            create: createSavedShoppingList,
            edit: editSavedShoppingList,
          }}
          initial={{
            items,
            settings,
            inventory: inventory.items,
            plans,
            merges,
            layers,
            rules,
            list,
          }}
          actions={{
            load: loadShoppingList.bind(null, listId),
            add: addToShoppingList.bind(null, listId),
            update: updateShoppingList.bind(null, listId),
            saveSettings: updateShoppingListSettings,
            decideMerge: decideShoppingListMerge.bind(null, listId),
            splitMerge: splitShoppingListMerge,
            addLayer: addShoppingListLayer.bind(null, listId),
            setLayer: setShoppingListLayer.bind(null, listId),
            removeLayer: removeShoppingListLayer.bind(null, listId),
            leaveOff: setShoppingListLeaveOff,
            setRule: setShoppingListRule.bind(null, listId),
            removeRule: removeShoppingListRule.bind(null, listId),
            promoteLayer: promoteShoppingListLayer.bind(null, listId),
          }}
          patchUrl={
            listId === "main"
              ? "/api/shopping"
              : `/api/shopping?list=${encodeURIComponent(listId)}`
          }
          tidyModels={tidyModels.choices}
          tidyRuns={tidyRuns
            .slice(0, TIDY_RUNS_SHOWN)
            .map((run) => tidyRunView(run, items))}
          models={{
            ...(models.local ? { local: readerLabel(models.local) } : {}),
            ...(models.claude ? { claude: readerLabel(models.claude) } : {}),
          }}
        />
      </PageSection>
    </PageMain>
  );
}
