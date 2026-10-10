/**
 * Set or clear one recipe's image, as its own commit (26b).
 *
 * `updateRecipe` could already replace an image from a URL, but only as a
 * field in a patch, and there was no way to hand it a local file. This seat
 * takes exactly one of a URL, a `File` or `clear`, and commits
 * `Update recipe image: <slug>` — so a wrong picture is one `git revert` away,
 * which is why the agent's seat for it is pre-approved.
 *
 * A URL goes through `fetchImageFile` (status, type, size, filename — 26a/D5).
 * A `File` arrives from three places — the CLI's `--file`, the MCP tool's
 * `path` (both read with `readImageFile`), and the API's multipart upload — and
 * is checked here the same way whichever it was.
 */
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { updateContent } from "@discontent/cms/content/updateContent";
import type { UploadSpec } from "@discontent/cms/content/types";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type {
  Recipe,
  RecipeEntryKey,
  RecipeEntryValue,
} from "recipe-website-common/controller/types";
import {
  checkImageFile,
  fetchImageFile,
  largeImageWarning,
} from "../imageImport";
import { recipePath, recipeUrl, type CurationContext } from "./context";
import { NotFoundError, ValidationError } from "./errors";

export type RecipeImageInput =
  | { url: string; file?: never; clear?: never }
  | { file: File; url?: never; clear?: never }
  | { clear: true; url?: never; file?: never };

export interface RecipeImageResult {
  slug: string;
  /** The stored filename, or `null` once cleared. */
  image: string | null;
  /** The filename that was replaced or removed, if there was one. */
  previous?: string;
  path: string;
  url: string;
  /** Stored, but over 2 MB (epic 31). */
  warnings?: string[];
}

function chosen(input: Partial<Record<"url" | "file" | "clear", unknown>>) {
  return (["url", "file", "clear"] as const).filter(
    (key) => input[key] !== undefined && input[key] !== false,
  );
}

export async function setRecipeImage(
  ctx: CurationContext,
  slug: string,
  input: RecipeImageInput,
): Promise<RecipeImageResult> {
  const given = chosen(input);
  if (given.length !== 1) {
    throw new ValidationError(
      "Pass exactly one of an image URL, a file, or clear.",
    );
  }

  const current = await readContentFileOrNull<
    Recipe,
    RecipeEntryValue,
    RecipeEntryKey
  >({
    config: recipeContentConfig,
    slug,
    contentDirectory: ctx.contentDirectory,
  });
  if (!current) throw new NotFoundError(`No recipe at slug "${slug}"`, slug);

  /* Clearing nothing commits nothing: an empty commit would be noise in the
   * history this seat exists to keep revertable. */
  if (input.clear && !current.image) {
    return {
      slug,
      image: null,
      path: recipePath(ctx, slug),
      url: recipeUrl(slug),
    };
  }

  let upload: UploadSpec;
  const data: Recipe = { ...current };
  if (input.url !== undefined) {
    const file = await fetchImageFile(input.url);
    upload = { file, existingFile: current.image };
    data.image = file.name;
  } else if (input.file !== undefined) {
    const file = checkImageFile(input.file);
    upload = { file, existingFile: current.image };
    data.image = file.name;
  } else {
    upload = { clearFile: true, existingFile: current.image };
    delete data.image;
  }
  const warning = upload.file && largeImageWarning(upload.file.size, input.url);

  const result = await updateContent<Recipe, RecipeEntryValue, RecipeEntryKey>({
    config: recipeContentConfig,
    slug,
    currentSlug: slug,
    currentIndexKey: [current.date, slug],
    data,
    uploads: { image: upload },
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Update recipe image: ${slug}`,
  });
  ctx.onWrite?.({
    contentType: recipeContentConfig.contentType,
    kind: "update",
    result,
    slug,
  });

  return {
    slug,
    image: data.image ?? null,
    ...(current.image ? { previous: current.image } : {}),
    path: recipePath(ctx, slug),
    url: recipeUrl(slug),
    ...(warning ? { warnings: [warning] } : {}),
  };
}
