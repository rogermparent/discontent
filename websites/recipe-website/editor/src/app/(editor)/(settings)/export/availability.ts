import { pathExists } from "fs-extra";
import { resolve } from "path";

/*
 * The Export page builds and deploys the static site by running `pnpm run …`
 * in the sibling `export` package. A full checkout has it; the Pi's editor
 * image (deploy/editor.Dockerfile) ships the editor alone, so there the
 * buttons would only fail with a missing-directory error halfway through.
 */
export const EXPORT_UNAVAILABLE_MESSAGE =
  "Exporting isn't available in this deployment — run it from a full checkout.";

export function getExportDirectory() {
  return resolve("..", "export");
}

export async function isExportAvailable() {
  return pathExists(resolve(getExportDirectory(), "package.json"));
}
