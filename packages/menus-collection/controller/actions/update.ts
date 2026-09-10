import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import parseMenuFormData from "../parseFormData";
import { MenuFormState } from "../formState";
import { getMenuDirectory, getMenuFilePath } from "../filesystemDirectories";
import { Menu } from "../types";
import { outputJson } from "fs-extra";
import z from "zod";

/**
 * Write a menu.
 *
 * Deliberately **not** converted to `createGenericActions`: menus are two or
 * three fixed-slug singletons with no `date`, so an index key of `[date, slug]`
 * has nothing to order by, and this action doubles as create — writing a menu
 * that does not exist yet is the normal path, which the factory's
 * create/update split would break.
 *
 * `authenticate` is injected rather than imported because auth is per-app
 * (`@/auth` is a path alias resolved by each Next app), and it is a **required**
 * positional parameter so a caller cannot forget it. Until now this was a bare
 * `"use server"` function with no check at all — i.e. anyone who could POST to
 * either site could rewrite its header and footer navigation.
 */
export default async function updateMenu(
  authenticate: () => Promise<string | null>,
  currentSlug: string,
  _prevState: MenuFormState,
  formData: FormData,
): Promise<MenuFormState> {
  const email = await authenticate();
  if (!email) {
    return { message: "Authentication required" };
  }

  const validatedFields = parseMenuFormData(formData);

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Failed to update Menu.",
    };
  }

  const { items } = validatedFields.data;

  // Throws on a traversing slug rather than sanitizing it.
  const baseDirectory = getMenuDirectory(currentSlug);

  const data: Menu = {
    items,
  };

  await outputJson(getMenuFilePath(baseDirectory), data);

  // Menus render in the *layout*, not at a route of their own. The old
  // `revalidatePath("/" + currentSlug)` revalidated "/header" — a path that does
  // not exist — so an edited menu kept serving the stale nav everywhere.
  revalidatePath("/", "layout");
  redirect("/menus");
}
