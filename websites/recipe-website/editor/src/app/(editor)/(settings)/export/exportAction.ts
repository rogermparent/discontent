"use server";

import { commandAction } from "@/app/(recipes)/scriptAction";
import { readSettings } from "@/settings";
import { rebuildAllIndexes } from "recipe-editor/controller/actions";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { ensureSymlink } from "fs-extra";
import { resolve } from "path";

export async function buildExport() {
  const contentDirectory = getContentDirectory();
  const exportDirectory = resolve("..", "export");

  /*
   * The export reads the pagination index and nothing self-heals it: a content
   * directory that predates the index, or one restored from a backup taken
   * before it, would otherwise ship an empty `/recipes` with no error at all.
   * `rebuildIndex` forces a pagination rebuild alongside the content index.
   *
   * **Every** type, not just recipes (T9/22b). This called `rebuildRecipeIndex`,
   * whose blast radius is deliberately recipes plus the featured recipes its
   * cascade reaches — and groups are nobody's dependent (D3), so an unbuilt
   * groups index survived the rebuild and the export shipped an empty `/groups`
   * in exactly the way the paragraph above says it must not. Pages were in the
   * same position and had been since they landed; nothing noticed because
   * pages declare no index to be empty.
   */
  await rebuildAllIndexes();

  await ensureSymlink(
    resolve(contentDirectory, "transformed-images"),
    resolve(exportDirectory, "public", "image"),
  );
  await ensureSymlink(
    resolve(contentDirectory, "uploads"),
    resolve(exportDirectory, "public", "uploads"),
  );

  // Bake the owner's site-default theme + footer content into the static build.
  // The export layout reads SITE_THEME via getSiteTheme() and
  // SITE_FOOTER_NOTE / SITE_CONTACT via getSiteFooter(); absent → built-in
  // defaults. The deploy path is unaffected (it redeploys the already-built
  // out/).
  const { theme, footerNote, contact } = await readSettings();
  const extraEnv: Record<string, string> = {};
  if (theme) extraEnv.SITE_THEME = JSON.stringify(theme);
  if (footerNote) extraEnv.SITE_FOOTER_NOTE = footerNote;
  if (contact) extraEnv.SITE_CONTACT = JSON.stringify(contact);

  return commandAction(
    "build",
    Object.keys(extraEnv).length > 0 ? extraEnv : undefined,
  );
}
