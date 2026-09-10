"use server";

import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { pageContentConfig } from "@discontent/pages-collection/controller/pageContentConfig";
import { projectContentConfig } from "@discontent/projects-collection/controller/projectContentConfig";
import { ensureSymlink } from "fs-extra";
import { resolve } from "path";
import { readSettings } from "@/settings";
import { portfolioContentTypes } from "../../../../../controller/contentTypes";
import { commandAction } from "./scriptAction";

/**
 * Build the static site.
 *
 * Three things happen here that the deleted `/build` route did not do:
 *
 * 1. **The index is rebuilt first.** The homepage *is* the index — it reads
 *    LMDB, not the JSON files — so a stale index does not merely mis-sort a
 *    list, it publishes a stale *homepage*. Rebuilding is cheap and derived
 *    state should never be the thing a publish depends on being fresh.
 * 2. **Uploads and images are symlinked into the export's `public/`.** Next
 *    stats everything under `public/`, and a *dangling* symlink there fails the
 *    build with a bare ENOENT naming neither the link nor its target — so these
 *    are ensured immediately before the build rather than left to setup.
 * 3. **The owner's settings are baked in.** The export app has no settings
 *    store; it reads `SITE_THEME`, `SITE_LAYOUT` and the `NEXT_PUBLIC_SITE_*`
 *    vars at build time. Without this the published site would ignore
 *    everything set in the editor — which is exactly what made the posture a
 *    developer-only feature.
 */
export async function buildExport() {
  const contentDirectory = getContentDirectory();
  const exportDirectory = resolve("..", "export");

  await ensureSymlink(
    resolve(contentDirectory, "transformed-images"),
    resolve(exportDirectory, "public", "image"),
  );
  await ensureSymlink(
    resolve(contentDirectory, "uploads"),
    resolve(exportDirectory, "public", "uploads"),
  );

  await rebuildIndex({ config: projectContentConfig, contentDirectory });
  await rebuildIndex({ config: pageContentConfig, contentDirectory });
  /*
   * The third of §11.4's three invalidation seats, which this one had simply
   * never had. It expired **nothing** when it was written — portfolio declared
   * no pagination index and no aggregate, so it expanded to the two item
   * catch-alls, which no entry carried. F29 is the day §11.2 gave it some:
   * `projects` declares `projectsByDate`, and this line started expiring that
   * index's tags without an edit here, because it reads the registry rather
   * than a hand-written list. That is the whole payoff of writing the seat
   * before the derived state existed — the adoption was a `paginationConfigs.ts`
   * and a line on the content config, with no seat left to remember.
   *
   * `portfolioContentTypes` rather than a hand-written pair because this
   * rebuilds every type the site owns, so "what it touched" and "what exists"
   * are the same list here — unlike the featured-recipe seat, where they are
   * not.
   */
  revalidateDerivedState(portfolioContentTypes);

  const { theme, posture, title, description, statement, contactLinks } =
    await readSettings();
  const extraEnv: Record<string, string> = {};
  if (theme) extraEnv.SITE_THEME = JSON.stringify(theme);
  if (posture) extraEnv.SITE_LAYOUT = posture;
  if (title) extraEnv.NEXT_PUBLIC_SITE_TITLE = title;
  if (description) extraEnv.NEXT_PUBLIC_SITE_DESCRIPTION = description;
  if (statement) extraEnv.NEXT_PUBLIC_SITE_STATEMENT = statement;
  if (contactLinks?.length)
    extraEnv.SITE_CONTACT = JSON.stringify(contactLinks);

  return commandAction(
    "build",
    Object.keys(extraEnv).length > 0 ? extraEnv : undefined,
  );
}
