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
import type {
  GroupItem,
  GroupItemRef,
} from "recipe-website-common/controller/types";
import {
  addPlanItem,
  deleteGroup,
  savePlanItems,
} from "recipe-editor/controller/actions/groups";
import {
  addToShoppingList,
  updateShoppingList,
} from "recipe-editor/controller/actions/shopping";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import { readInventory } from "recipe-editor/controller/curation/inventory";
import { readShopping } from "recipe-editor/controller/curation/shopping";
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
 * how many are ticked — `null` when none are. A failed read says nothing
 * rather than failing the page.
 */
async function shoppingSummary(
  email: string,
  slug: string,
): Promise<PlanShoppingSummary | null> {
  try {
    const { items, settings } = await readShopping(curationContextFor(email));
    const mine = items.filter((item) => (item.via ?? []).includes(slug));
    if (mine.length === 0) return null;
    return {
      lines: mine.length,
      rows: buildShoppingView(mine, settings).counts.rows,
      ticked: mine.filter((item) => item.checked).length,
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
    const [shopping, saved] = await Promise.all([
      shoppingSummary(email, slug),
      readInventory(curationContextFor(email)).catch(() => ({ items: [] })),
    ]);
    second = { kind: "saved" as const, items: saved.items };
    editor = {
      saveItems: async (next: GroupItem[], base: string) => {
        "use server";
        return savePlanItems(slug, next, base);
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
        const result = await updateShoppingList({
          removeSource: { group: slug },
        });
        return "error" in result
          ? { error: result.error }
          : { ok: true as const };
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
