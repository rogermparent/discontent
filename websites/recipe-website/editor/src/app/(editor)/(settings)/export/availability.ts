import { pathExists } from "fs-extra";
import { resolve } from "path";
import { isMirror, mirrorRefusal } from "recipe-website-common/config/role";

/*
 * The Export page builds and deploys the static site by running `pnpm run …`
 * in the sibling `export` package. Two things rule it out, checked in order:
 *
 * - the role (epic 28, D2): a mirror never exports; the workstation does;
 * - the package itself: the Pi's editor image (deploy/editor.Dockerfile) ships
 *   the editor alone, so even a misconfigured role could not run it, and the
 *   buttons would only fail with a missing-directory error halfway through.
 */
export function getExportDirectory() {
  return resolve("..", "export");
}

/** Why exporting can't run here, or `null` when it can. */
export async function exportUnavailableReason(): Promise<string | null> {
  if (isMirror()) return mirrorRefusal("exporting the static site");
  if (!(await pathExists(resolve(getExportDirectory(), "package.json")))) {
    return "Exporting isn't available in this deployment — run it from a full checkout.";
  }
  return null;
}
