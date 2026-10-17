"use server";

import { auth, signIn } from "@/auth";
import { commandAction } from "@/app/(recipes)/scriptAction";
import { readSettings } from "@/settings";
import { rebuildAllIndexes } from "recipe-editor/controller/actions";
import { readInventory } from "recipe-editor/controller/curation/inventory";
import { exportBuildEnv } from "recipe-editor/controller/exportEnv";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { RepositoryBusyError } from "@discontent/cms/git/writeLock";
import { readHead } from "@discontent/cms/git/indexStamp";
import { writeExportStamp } from "recipe-editor/controller/exportStamp";
import { ensureSymlink } from "fs-extra";
import { resolve } from "path";
import { exportUnavailableReason, getExportDirectory } from "./availability";

export async function buildExport() {
  /*
   * Signed in before anything else: a server action is a public POST, and
   * everything below — a full reindex, the settings, the saved inventory —
   * is the owner's to start. (`commandAction` checks again; by then the
   * reindex would already have run.)
   */
  if (!(await auth())) {
    return signIn();
  }
  /* Before the rebuild below, which would otherwise run for nothing. */
  const unavailable = await exportUnavailableReason();
  if (unavailable) {
    return unavailable;
  }
  const contentDirectory = getContentDirectory();
  const exportDirectory = getExportDirectory();

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
  try {
    await rebuildAllIndexes();
  } catch (error) {
    /* Another write held the lock past the wait (34d): say so, don't crash. */
    if (error instanceof RepositoryBusyError) return error.message;
    throw error;
  }

  await ensureSymlink(
    resolve(contentDirectory, "transformed-images"),
    resolve(exportDirectory, "public", "image"),
  );
  await ensureSymlink(
    resolve(contentDirectory, "uploads"),
    resolve(exportDirectory, "public", "uploads"),
  );

  // Bake the owner's site-default theme, footer content and — only when the
  // owner opted in (U6) — a snapshot of the saved inventory into the static
  // build. The export reads SITE_THEME via getSiteTheme(), SITE_FOOTER_NOTE /
  // SITE_CONTACT via getSiteFooter() and SITE_HOUSE_INVENTORY via
  // secondaryInventory(); absent or empty → built-in defaults. The deploy
  // path is unaffected (it redeploys the already-built out/).
  const extraEnv = await exportBuildEnv(
    await readSettings(),
    async () => (await readInventory({ contentDirectory })).items,
  );

  /*
   * Epic 39, D6: the commit this build reads, recorded once it succeeds, so
   * the page can say how many commits the export is behind. Read after the
   * rebuild, as the build's indexes describe it.
   */
  const head = await readHead(contentDirectory);
  return commandAction(
    "build",
    extraEnv,
    head
      ? () =>
          writeExportStamp(contentDirectory, {
            head,
            at: new Date().toISOString(),
          })
      : undefined,
  );
}
