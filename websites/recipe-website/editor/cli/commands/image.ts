/**
 * `recipes image <slug> (--url U | --file P | --clear)` — set or clear one
 * recipe's image, one commit (26b).
 *
 * `--file` is read here, in this process, and sent as a `File` — over
 * `--remote` that is a multipart upload, so a picture on this machine can land
 * in a remote editor's content.
 */
import { UsageError } from "../../controller/curation/errors";
import { readImageFile } from "../../controller/imageImport";
import type { RecipeImageResult } from "../backend/types";
import { resolveUserPath } from "../input";
import { booleanOption, stringOption, type CommandDef } from "./types";

export const imageCommand: CommandDef<RecipeImageResult> = {
  name: "image",
  usage: "recipes image <slug> (--url <image-url> | --file <path> | --clear)",
  options: {
    url: { type: "string" },
    file: { type: "string" },
    clear: { type: "boolean" },
  },
  write: true,
  async run({ backend, positionals, options }) {
    const slug = positionals[0];
    if (!slug) throw new UsageError("image needs a recipe slug.");
    const url = stringOption(options, "url");
    const file = stringOption(options, "file");
    const clear = booleanOption(options, "clear");
    if ([url, file, clear || undefined].filter(Boolean).length !== 1) {
      throw new UsageError("Pass exactly one of --url, --file or --clear.");
    }
    if (url) return backend.setRecipeImage(slug, { url });
    if (file) {
      return backend.setRecipeImage(slug, {
        file: await readImageFile(resolveUserPath(file)),
      });
    }
    return backend.setRecipeImage(slug, { clear: true });
  },
  format(result) {
    return result.image
      ? `Set image for ${result.slug}: ${result.image}${result.previous ? ` (was ${result.previous})` : ""}`
      : `Cleared image for ${result.slug}${result.previous ? ` (was ${result.previous})` : ""}`;
  },
};

export default imageCommand;
