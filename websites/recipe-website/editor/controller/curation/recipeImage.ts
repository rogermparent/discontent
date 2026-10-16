/**
 * Set or clear one recipe's (26b) or one term record's (32c) image, as its own
 * commit.
 *
 * `updateRecipe` could already replace an image from a URL, but only as a
 * field in a patch, and there was no way to hand it a local file. This seat
 * takes exactly one of a URL, a `File` or `clear`, and commits
 * `Update recipe image: <slug>` (or `Update term image: <slug>`) — so a wrong
 * picture is one `git revert` away, which is why the agent's seats for it are
 * pre-approved.
 *
 * A URL goes through `fetchImageFilePaced` (status, type, size, filename —
 * 26a/D5 — on the site's queue, 38b).
 * A `File` arrives from three places — the CLI's `--file`, the MCP tool's
 * `path` (both read with `readImageFile`), and the API's multipart upload — and
 * is checked here the same way whichever it was.
 *
 * One body, two targets (32c, D2 "term image parity"): the content type, the
 * noun in the commit message and the paths are all that differ between a
 * recipe and a term record — both are keyed `[date, slug]` and both store the
 * picture as an `image` upload — so `setImage` is written once over an
 * `ImageTarget` and the two seats are a line each.
 */
import { readContentFileOrNull } from "@discontent/cms/content/readContentFile";
import { updateContent } from "@discontent/cms/content/updateContent";
import type {
  ContentTypeConfig,
  UploadSpec,
} from "@discontent/cms/content/types";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import { tagTermContentConfig } from "recipe-website-common/controller/tagTermContentConfig";
import type {
  Recipe,
  RecipeEntryValue,
  TagTerm,
  TagTermIndexValue,
} from "recipe-website-common/controller/types";
import {
  checkImageFile,
  fetchImageFilePaced,
  largeImageWarning,
} from "../imageImport";
import {
  recipePath,
  recipeUrl,
  termPath,
  termUrl,
  type CurationContext,
} from "./context";
import { NotFoundError, ValidationError } from "./errors";

export type ImageSeatInput =
  | { url: string; file?: never; clear?: never }
  | { file: File; url?: never; clear?: never }
  | { clear: true; url?: never; file?: never };

export interface ImageSeatResult {
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

export type RecipeImageInput = ImageSeatInput;
export type RecipeImageResult = ImageSeatResult;
export type TermImageInput = ImageSeatInput;
export type TermImageResult = ImageSeatResult;

/** What differs between a recipe's picture and a term record's. */
interface ImageTarget<TData extends { date: number; image?: string }, TIndex> {
  config: ContentTypeConfig<TData, TIndex, [number, string]>;
  /** The commit message's noun: `Update <noun> image: <slug>`. */
  noun: string;
  notFound(slug: string): string;
  path(ctx: CurationContext, slug: string): string;
  url(slug: string): string;
}

const RECIPE_TARGET: ImageTarget<Recipe, RecipeEntryValue> = {
  config: recipeContentConfig,
  noun: "recipe",
  notFound: (slug) => `No recipe at slug "${slug}"`,
  path: recipePath,
  url: recipeUrl,
};

const TERM_TARGET: ImageTarget<TagTerm, TagTermIndexValue> = {
  config: tagTermContentConfig,
  noun: "term",
  /* A term with carriers but no record has nowhere to keep a picture. */
  notFound: (slug) =>
    `No term record at slug "${slug}" — term_create writes one.`,
  path: termPath,
  url: termUrl,
};

function chosen(input: Partial<Record<"url" | "file" | "clear", unknown>>) {
  return (["url", "file", "clear"] as const).filter(
    (key) => input[key] !== undefined && input[key] !== false,
  );
}

async function setImage<TData extends { date: number; image?: string }, TIndex>(
  target: ImageTarget<TData, TIndex>,
  ctx: CurationContext,
  slug: string,
  input: ImageSeatInput,
): Promise<ImageSeatResult> {
  const given = chosen(input);
  if (given.length !== 1) {
    throw new ValidationError(
      "Pass exactly one of an image URL, a file, or clear.",
    );
  }

  const current = await readContentFileOrNull<TData, TIndex, [number, string]>({
    config: target.config,
    slug,
    contentDirectory: ctx.contentDirectory,
  });
  if (!current) throw new NotFoundError(target.notFound(slug), slug);

  /* Clearing nothing commits nothing: an empty commit would be noise in the
   * history this seat exists to keep revertable. */
  if (input.clear && !current.image) {
    return {
      slug,
      image: null,
      path: target.path(ctx, slug),
      url: target.url(slug),
    };
  }

  let upload: UploadSpec;
  const data: TData = { ...current };
  if (input.url !== undefined) {
    /* Before the write and its lock, on the site's queue (38b, Tb1). */
    const file = await fetchImageFilePaced(input.url);
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

  const result = await updateContent<TData, TIndex, [number, string]>({
    config: target.config,
    slug,
    currentSlug: slug,
    currentIndexKey: [current.date, slug],
    data,
    uploads: { image: upload },
    contentDirectory: ctx.contentDirectory,
    author: ctx.author,
    commitMessage: `Update ${target.noun} image: ${slug}`,
  });
  ctx.onWrite?.({
    contentType: target.config.contentType,
    kind: "update",
    result,
    slug,
  });

  return {
    slug,
    image: data.image ?? null,
    ...(current.image ? { previous: current.image } : {}),
    path: target.path(ctx, slug),
    url: target.url(slug),
    ...(warning ? { warnings: [warning] } : {}),
  };
}

export function setRecipeImage(
  ctx: CurationContext,
  slug: string,
  input: RecipeImageInput,
): Promise<RecipeImageResult> {
  return setImage(RECIPE_TARGET, ctx, slug, input);
}

/**
 * A term record's picture (32c). The record must exist — a term that lives
 * only on its carriers is `not_found` here, as it is for `term_update`. The
 * write goes through `updateContent` like every other record update, so the
 * indexes and the term's dependents are the engine's, not this seat's.
 */
export function setTermImage(
  ctx: CurationContext,
  slug: string,
  input: TermImageInput,
): Promise<TermImageResult> {
  return setImage(TERM_TARGET, ctx, slug, input);
}
