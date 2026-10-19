import type { ReactNode } from "react";
import type { GroupItem, GroupItemRef } from "../../controller/types";
import type { ShoppingPageActions } from "../ShoppingPage/useShoppingList";
import type { SecondList } from "../MakePage/InventoryPanel";
import type { PlanPageData } from "../../util/planPage";

/** A write's answer, as the page's server actions give it. */
export type PlanWriteResult = { ok: true } | { error: string };

/** The plan's lines on the shopping list (the editor, signed in). */
export interface PlanShoppingSummary {
  /** Stored lines that came through this plan. */
  lines: number;
  /** The rows they merge into, as /shopping shows them. */
  rows: number;
  /** Lines ticked. */
  ticked: number;
}

/**
 * What a signed-in editor can do on a plan page (43p1). Absent on the export
 * and for a guest: the page is then read-only — no Save, no Add, no More.
 */
export interface PlanEditor {
  /** D5: reorder, scale and remove, as one commit (`setItems`). */
  saveItems: (items: GroupItem[]) => Promise<PlanWriteResult>;
  /** "Add a recipe or a plan by name": one commit (`addItem`). */
  addItem: (ref: GroupItemRef) => Promise<PlanWriteResult>;
  /** The delete form's action (`deleteGroup`, bound to the plan). */
  deleteAction: () => Promise<void>;
  /** On the shopping list, or `null` when none of its lines are. */
  shopping: PlanShoppingSummary | null;
  addToShopping: ShoppingPageActions["add"];
  /** Take every line that came through this plan off the list. */
  removeFromShopping: () => Promise<PlanWriteResult>;
}

/** The page's server-rendered pieces, handed to the client page. */
export interface PlanSlots {
  /** The plan's own description, rendered (Markdown). */
  description?: ReactNode;
  /** The plan's own picture, rendered. */
  media?: ReactNode;
  /** "Appears in": the plans this one is part of. */
  appearsIn?: ReactNode;
  /** Each recipe's picture by slug, rendered on the server (both apps). */
  images: Record<string, ReactNode>;
}

export interface PlanPageProps extends PlanSlots {
  data: PlanPageData;
  editor?: PlanEditor;
  /** The page's second list for From your shelf, as /make's and /drinks'. */
  second?: SecondList;
}
