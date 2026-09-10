import { rm } from "fs-extra";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getMenuDirectory } from "../filesystemDirectories";

/**
 * Delete a menu.
 *
 * This is the unguarded recursive `rm` the rebuild set out to close: no auth
 * check, and a slug that went straight into `resolve()`, so `../../` walked out
 * of the menus tree before deleting. `getMenuDirectory` now throws on a
 * traversing slug, and `authenticate` is a required injected parameter.
 */
export default async function deleteMenu(
  authenticate: () => Promise<string | null>,
  slug: string,
): Promise<void> {
  const email = await authenticate();
  if (!email) {
    throw new Error("Authentication required");
  }

  const menuDirectory = getMenuDirectory(slug);
  await rm(menuDirectory, { recursive: true, force: true });
  revalidatePath("/", "layout");
  revalidatePath("/menus");
  redirect("/menus");
}
