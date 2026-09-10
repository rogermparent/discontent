"use server";

import updateMenuAction from "@discontent/menus-collection/controller/actions/update";
import deleteMenuAction from "@discontent/menus-collection/controller/actions/delete";
import type { MenuFormState } from "@discontent/menus-collection/controller/formState";
import { authenticateUser } from "./shared";

/*
 * Menus' write path.
 *
 * The collection's actions are plain functions now; these thin `"use server"`
 * wrappers are the only exported endpoints, and they are what supplies
 * `authenticateUser` (which needs `@/auth`, a per-app alias).
 */

export async function updateMenu(
  currentSlug: string,
  prevState: MenuFormState,
  formData: FormData,
): Promise<MenuFormState> {
  return updateMenuAction(authenticateUser, currentSlug, prevState, formData);
}

export async function deleteMenu(slug: string): Promise<void> {
  return deleteMenuAction(authenticateUser, slug);
}
