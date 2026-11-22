import { notFound } from "next/navigation";
import { getGroupBySlug } from "recipe-website-common/controller/data/readGroups";
import { resolveGroupItems } from "recipe-website-common/controller/data/resolveGroupItems";
import GroupDetailPage from "recipe-website-common/components/GroupDetailPage";
import type {
  PlanEditor,
  PlanShoppingSummary,
} from "recipe-website-common/components/GroupDetailPage/types";
import { secondaryInventory } from "recipe-website-common/controller/secondaryInventory";
import { buildShoppingView } from "recipe-website-common/util/shoppingView";
import { planDocket } from "recipe-website-common/util/planSheet";
import type {
  GroupItem,
  GroupItemRef,
} from "recipe-website-common/controller/types";
import {
  addPlanItem,
  deleteGroup,
  readPlanItems,
  savePlanItems,
} from "recipe-editor/controller/actions/groups";
import {
  addToShoppingList,
  createSavedShoppingList,
  updateShoppingList,
} from "recipe-editor/controller/actions/shopping";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import { readInventory } from "recipe-editor/controller/curation/inventory";
import {
  createShoppingList,
  readShopping,
  readShoppingLists,
} from "recipe-editor/controller/curation/shopping";
import { toErrorObject } from "recipe-editor/controller/curation/errors";
import type { ShoppingListSummary } from "recipe-website-common/util/shoppingLists";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  try {
    const group = await getGroupBySlug({ slug });
    return { title: group.name || slug };
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }
}

/**
 * What of this plan is on the shopping list: the lines that came through it
 * (`via`, nested plans included), the rows /shopping merges them into, and
 * how many are ticked — `null` when none are — and the run sheet's docket
 * (43p2: rows by aisle, the big ones) from the same view, read-only. A
 * failed read says nothing rather than failing the page.
 *
 * 50d: on the plan's own list when it has one (the newest made from it),
 * else on the main list, as before.
 */
async function shoppingSummary(
  email: string,
  slug: string,
  planList: ShoppingListSummary | undefined,
): Promise<PlanShoppingSummary | null> {
  try {
    const ctx = curationContextFor(email);
    const { items, settings, list } = await readShopping(
      planList ? { ...ctx, shoppingList: planList.id } : ctx,
    );
    const mine = items.filter((item) => (item.via ?? []).includes(slug));
    if (mine.length === 0) return null;
    const view = buildShoppingView(mine, settings);
    return {
      lines: mine.length,
      rows: view.counts.rows,
      ticked: mine.filter((item) => item.checked).length,
      docket: planDocket(view),
      list: {
        id: list.id,
        name: list.name,
        ...(list.main ? { main: true as const } : {}),
      },
    };
  } catch {
    return null;
  }
}

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
}) {
  const { slug } = await params;
  /* `?mode=cook` from /groups' Cook button: rendered Cook from the start. */
  const { mode } = await searchParams;
  let group;
  try {
    group = await getGroupBySlug({ slug });
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }

  /*
   * Each item's recipe, through the *cached* item read — which is what makes a
   * retitle show here without groups declaring a reference (D3). Lifted into
   * `resolveGroupItems` in 22g, when the featured-recipe routes needed the same
   * four lines; that module documents the order and dangling properties.
   */
  const items = await resolveGroupItems(group);

  /*
   * The writes are the signed-in editor's (43p1, 42j's finding): a guest gets
   * the export's page — no Save, no Add, no More menu, no shopping list. The
   * server actions check the session themselves; this is what is offered.
   */
  const email = (await auth())?.user?.email;
  let editor: PlanEditor | undefined;
  let second;
  if (email) {
    const lists = await readShoppingLists(curationContextFor(email)).catch(
      () => undefined,
    );
    /* 50d: the list made from this plan, newest first. */
    const planList = lists?.find((list) => list.plan === slug);
    const summaryList = planList?.id ?? "main";
    const [shopping, saved] = await Promise.all([
      shoppingSummary(email, slug, planList),
      readInventory(curationContextFor(email)).catch(() => ({ items: [] })),
    ]);
    second = { kind: "saved" as const, items: saved.items };
    editor = {
      saveItems: async (next: GroupItem[], base: string) => {
        "use server";
        return savePlanItems(slug, next, base);
      },
      readItems: async () => {
        "use server";
        return readPlanItems(slug);
      },
      addItem: async (ref: GroupItemRef) => {
        "use server";
        return addPlanItem(slug, ref);
      },
      deleteAction: deleteGroup.bind(null, group.date, slug),
      shopping,
      addToShopping: addToShoppingList,
      removeFromShopping: async () => {
        "use server";
        const result = await updateShoppingList(summaryList, {
          removeSource: { group: slug },
        });
        return "error" in result
          ? { error: result.error }
          : { ok: true as const };
      },
      ...(lists ? { lists } : {}),
      createList: createSavedShoppingList,
      ...(planList ? { planList } : {}),
      makeShoppingList: async () => {
        "use server";
        const signed = (await auth())?.user?.email;
        if (!signed) return { error: "Sign in to make a shopping list." };
        try {
          const made = await createShoppingList(curationContextFor(signed), {
            plan: slug,
          });
          return { ok: true as const, list: made.list.id };
        } catch (error) {
          return { error: toErrorObject(error).error.message };
        }
      },
    };
  } else {
    /* The house list, when this process was built with one (as on /make). */
    const house = await secondaryInventory();
    second = house ? { kind: "house" as const, items: house.items } : undefined;
  }

  return (
    <GroupDetailPage
      group={group}
      slug={slug}
      items={items}
      editor={editor}
      second={second}
      mode={typeof mode === "string" ? mode : undefined}
    />
  );
}
