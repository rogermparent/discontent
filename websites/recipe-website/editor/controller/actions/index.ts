"use server";

import { auth } from "@/auth";
import slugify from "@sindresorhus/slugify";
import { deleteContent } from "@discontent/cms/content/deleteContent";
import { derivedContentPaths } from "@discontent/cms/content/derivedPaths";
import { rebuildIndex } from "@discontent/cms/content/rebuildIndex";
import { revalidateDerivedState } from "@discontent/cms/content/next/revalidateDerived";
import type { UploadSpec } from "@discontent/cms/content/types";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { directoryIsGitRepo } from "@discontent/cms/git/commit";
import { writeIndexedHead } from "@discontent/cms/git/indexStamp";
import { writeFile } from "fs-extra";
import { revalidatePath } from "next/cache";
import { join } from "node:path";
import createDefaultSlug from "recipe-website-common/controller/createSlug";
import { getRecipeBySlug } from "recipe-website-common/controller/data/read";
import type {
  RecipeFormData,
  RecipeFormState,
} from "recipe-website-common/controller/formState";
import { featuredRecipeContentConfig } from "recipe-website-common/controller/featuredRecipeContentConfig";
import { recipeContentConfig } from "recipe-website-common/controller/recipeContentConfig";
import type {
  Recipe,
  RecipeEntryKey,
} from "recipe-website-common/controller/types";
import simpleGit, { SimpleGit } from "simple-git";
import { z } from "zod";
import parseRecipeFormData, { ParsedRecipeFormData } from "../parseFormData";
import { recipeContentTypes } from "../contentTypes";
import { ImportError } from "../curation/errors";
import { reindex } from "../curation/reindex";
import { fetchImageFile } from "../imageImport";
import type { EditorContentConfig } from "@discontent/cms/content/editorContentConfig";
import { createGenericActions } from "@discontent/cms/content/genericActions";
import { authenticateUser } from "./shared";
import {
  recipeDeleteSuccessConfig,
  recipeSuccessConfig,
} from "../successConfigs";

const INITIAL_COMMIT_MESSAGE = "Initial commit";

function formDataFromParsed(parsed: ParsedRecipeFormData): RecipeFormData {
  return {
    name: parsed.name,
    description: parsed.description,
    slug: parsed.slug,
    date: parsed.date || undefined,
    ingredients: parsed.ingredients,
    instructions: parsed.instructions,
    timelines: parsed.timelines,
    prepTime: parsed.prepTime,
    cookTime: parsed.cookTime,
    totalTime: parsed.totalTime,
    recipeYield: parsed.recipeYield,
    tags: parsed.tags,
    source: parsed.source,
    drink: parsed.drink,
    videoUrl: parsed.videoUrl || undefined,
  };
}

/**
 * The image an `imageImportUrl` names, downloaded and checked (26a), or
 * `undefined` when the form sends no import URL or something that beats it.
 *
 * Memoized per parsed submission: the generic actions call `buildCreateData`
 * and `buildCreateUploads` separately, and both reach `buildRecipeData`, so
 * without this every save would download the image twice.
 */
const importedImages = new WeakMap<
  ParsedRecipeFormData,
  Promise<File | undefined>
>();

function importedImage(
  parsed: ParsedRecipeFormData,
): Promise<File | undefined> {
  const { image, clearImage, imageImportUrl } = parsed;
  if ((image && image.size > 0) || clearImage || !imageImportUrl) {
    return Promise.resolve(undefined);
  }
  let pending = importedImages.get(parsed);
  if (!pending) {
    pending = fetchImageFile(imageImportUrl);
    importedImages.set(parsed, pending);
  }
  return pending;
}

async function buildRecipeData(
  parsed: ParsedRecipeFormData,
  date: number,
  currentRecipeData?: Recipe | null,
): Promise<{
  data: Recipe;
  uploads: Record<string, UploadSpec>;
}> {
  const {
    name,
    description,
    ingredients,
    instructions,
    clearImage,
    image,
    video,
    clearVideo,
    videoUrl,
    videoImportUrl,
    prepTime,
    cookTime,
    totalTime,
    recipeYield,
    timelines,
    tags,
    source,
    drink,
  } = parsed;

  // Determine final video value with priority handling
  const videoValue =
    video && video.size > 0
      ? undefined
      : videoUrl
        ? videoUrl
        : videoImportUrl
          ? videoImportUrl
          : clearVideo
            ? undefined
            : currentRecipeData?.video;

  /*
   * The import URL is fetched here, not by the engine: `fetchImageFile` checks
   * the status, the type and the size, and names the file with a real
   * extension (T9). The engine then streams it like any other upload.
   */
  const imported = await importedImage(parsed);

  const uploads: Record<string, UploadSpec> = {
    image: {
      file: image && image.size > 0 ? image : imported,
      clearFile: clearImage,
      existingFile: currentRecipeData?.image,
    },
    video: {
      file: video && video.size > 0 ? video : undefined,
      clearFile: clearVideo && !videoUrl && !videoImportUrl,
      existingFile:
        currentRecipeData?.video && !currentRecipeData.video.startsWith("http")
          ? currentRecipeData.video
          : undefined,
    },
  };

  const imageFileName =
    image && image.size > 0
      ? image.name
      : clearImage
        ? undefined
        : imported
          ? imported.name
          : currentRecipeData?.image;
  const videoFileName = video && video.size > 0 ? video.name : videoValue;

  const data: Recipe = {
    name,
    description,
    ingredients,
    instructions,
    image: imageFileName,
    video: videoFileName,
    date,
    prepTime,
    cookTime,
    totalTime,
    recipeYield,
    timelines,
    tags: tags && tags.length > 0 ? tags : undefined,
    source,
    drink,
  };

  return { data, uploads };
}

const recipeEditorConfig: EditorContentConfig<
  Recipe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  RecipeEntryKey,
  RecipeFormState,
  ParsedRecipeFormData
> = {
  contentConfig: recipeContentConfig,
  successConfig: recipeSuccessConfig,
  deleteSuccessConfig: recipeDeleteSuccessConfig,
  label: "recipe",
  // Auth is injected rather than imported: the factory lives in
  // @discontent/cms and cannot reach this app\'s `@/auth` alias. Required by
  // the type, so a content type cannot ship an unauthenticated write path.
  authenticate: authenticateUser,

  parseFormData(formData: FormData) {
    const formResult = parseRecipeFormData(formData);
    if (!formResult.success) {
      return {
        success: false as const,
        state: {
          errors: z.flattenError(formResult.error).fieldErrors,
          message: "Error parsing recipe",
        },
      };
    }
    return { success: true as const, parsed: formResult.data };
  },

  async buildCreateData(parsed) {
    const date: number = parsed.date || Date.now();
    const slug = slugify(parsed.slug || createDefaultSlug(parsed));
    const { data } = await buildRecipeData(parsed, date);
    return { slug, data };
  },

  async buildUpdateData(parsed, currentSlug, currentDate, contentDirectory) {
    const currentRecipeData = await getRecipeBySlug({
      slug: currentSlug,
      contentDirectory,
    });
    const slug = slugify(parsed.slug || createDefaultSlug(parsed));
    const date = parsed.date || currentDate || Date.now();
    const { data } = await buildRecipeData(parsed, date, currentRecipeData);
    return { slug, data };
  },

  async buildCreateUploads(parsed) {
    const { uploads } = await buildRecipeData(parsed, 0);
    return uploads;
  },

  async buildUpdateUploads(parsed, currentSlug, contentDirectory) {
    const currentRecipeData = await getRecipeBySlug({
      slug: currentSlug,
      contentDirectory,
    });
    const { uploads } = await buildRecipeData(parsed, 0, currentRecipeData);
    return uploads;
  },

  buildCurrentIndexKey(currentDate, currentSlug) {
    return [currentDate, currentSlug];
  },

  extractFormData: formDataFromParsed,

  async checkSlugConflict(slug, contentDirectory) {
    try {
      const existing = await getRecipeBySlug({ slug, contentDirectory });
      return !!existing;
    } catch {
      return false;
    }
  },

  async deleteConflictingContent(slug, contentDirectory, email) {
    try {
      const existingRecipe = await getRecipeBySlug({ slug, contentDirectory });
      if (existingRecipe) {
        const indexKey: RecipeEntryKey = [existingRecipe.date, slug];
        await deleteContent({
          config: recipeContentConfig,
          slug,
          indexKey,
          contentDirectory,
          author: { name: email, email },
          commitMessage: `Delete recipe before overwrite: ${slug}`,
        });
      }
    } catch {
      // Recipe doesn't exist at target slug — nothing to delete
    }
  },
};

const recipeActions = createGenericActions(recipeEditorConfig);

/**
 * An image import that fails (`fetchImageFile`'s `ImportError`) as a form
 * message rather than a crashed action.
 *
 * The generic actions build the data and uploads *outside* their own
 * try/catch, and they live in `@discontent/cms`, which portfolio shares; so the
 * catch is here, around the four recipe writes, with the submitted values
 * handed back so nothing typed is lost.
 */
function reportImageImportErrors<Args extends [...unknown[], FormData]>(
  action: (...args: Args) => Promise<RecipeFormState>,
) {
  return async (...args: Args): Promise<RecipeFormState> => {
    try {
      return await action(...args);
    } catch (error) {
      if (!(error instanceof ImportError)) throw error;
      const formData = args[args.length - 1] as FormData;
      const parsed = parseRecipeFormData(formData);
      return {
        message: `Could not import the image: ${error.message}`,
        errors: {},
        ...(parsed.success
          ? { formData: formDataFromParsed(parsed.data) }
          : {}),
      } as RecipeFormState;
    }
  };
}

export const createRecipe = reportImageImportErrors(recipeActions.create);
export const overwriteRecipe = reportImageImportErrors(
  recipeActions.overwriteCreate,
);
export const updateRecipe = reportImageImportErrors(recipeActions.update);
export const overwriteUpdateRecipe = reportImageImportErrors(
  recipeActions.overwriteUpdate,
);
export const deleteRecipe = recipeActions.delete;

const remoteSchema = z.object({
  remoteName: z.string().min(1, "Remote Name is required"),
  remoteUrl: z.string().min(1, "Remote URL is required"),
});

export async function rebuildRecipeIndex() {
  const contentDirectory = getContentDirectory();
  await rebuildIndex({
    config: recipeContentConfig,
    contentDirectory,
  });
  /*
   * A P3 gap, found while giving featured recipes the same seat: this fired
   * only `revalidatePath("/")` and no tags at all, so a rebuild reprojected
   * every page and the site went on serving the old ones. Worst on the git
   * branch-switch path, which called this until 27b moved it to
   * `rebuildAllIndexes`.
   *
   * The argument is the blast radius, stated once: **the two configs this
   * rebuild moves.** `rebuildIndex` cascades to dependents by default (D1), so
   * a recipe rebuild really does move featured recipes too. What that expands
   * to — one tag per keyspace, one per aggregate, plus each type's item
   * catch-all — is `derivedTagsOf`'s business, and it stays right when a config
   * gains an index. The five hand-written `revalidateTag` calls this replaces
   * were correct on the day they were written and had no way to stay correct;
   * that is the third seat of §11.4, and F22 is the entry that derives it.
   *
   * A repair seat is also the one place the item catch-all belongs. A *write*
   * must never fire it — it knows which slugs it touched, and expiring the type
   * would be the over-invalidation §6.4 exists to prevent — but a rebuild knows
   * nothing and wants everything, which matters most on the branch-switch path:
   * without it every record cached under the old branch survives the checkout.
   *
   * No `revalidatePath("/")`. These tags are exactly what the homepage reads
   * through (see `successConfig`), so the path call was the same redundancy
   * `paginationOnly` removes from the write path.
   */
  revalidateDerivedState([recipeContentConfig, featuredRecipeContentConfig]);
}

/**
 * Rebuild **every** index this site owns, then invalidate everything derived
 * from any of them.
 *
 * The seat `rebuildRecipeIndex` could not become. That one is pinned by
 * `test/revalidateDerived.test.ts` as a *narrow* seat — recipes and the
 * featured recipes its cascade reaches, and deliberately nothing else. It used
 * to be what the git branch-switch path called, on the argument that widening
 * it would drop the whole cache on every checkout for no reason; but a checkout
 * swaps groups and term records too, and a cache that survives it is the wrong
 * one (D2). Nothing in the app calls it since 27b; the test still pins its
 * shape.
 *
 * What needed a wider one was the export (T9/22b): `buildExport` called
 * `rebuildRecipeIndex` to self-heal a content directory that predates an index,
 * and groups are not recipe dependents, so a directory with unbuilt groups
 * shipped a `/groups` that was silently empty with no error at all. That is the
 * same class of bug §13 keeps producing, and the fix is to ask the registry
 * rather than to name two more configs here.
 *
 * Since 27b it is also what every tree-moving path calls — pull, sync, merge,
 * abort, commit-working-changes, branch checkout and Settings → Maintenance.
 * Those used to call the narrow seat, so a pull that brought in groups or term
 * records left those indexes describing the old tree (`agent-epic-27.md` D2).
 * The loop is `reindex`'s all-types pass, which also stamps the HEAD it
 * indexed — the stamp the stale-index banner reads.
 */
export async function rebuildAllIndexes() {
  await reindex({ contentDirectory: getContentDirectory() });
  /* One call over the whole registry: everything moved, so everything expires. */
  revalidateDerivedState(recipeContentTypes);
}

export async function createRemote(
  _state: string | undefined,
  formData: FormData,
) {
  // Auth check
  const session = await auth();
  if (!session?.user?.email) {
    return "Authentication required";
  }

  const contentDirectory = getContentDirectory();
  const result = remoteSchema.safeParse({
    remoteName: formData.get("remoteName"),
    remoteUrl: formData.get("remoteUrl"),
  });

  if (!result.success) {
    const flattenedErrors = z.flattenError(result.error);

    return (
      flattenedErrors.fieldErrors.remoteName?.[0] ??
      flattenedErrors.fieldErrors.remoteUrl?.[0]
    );
  }

  if (await directoryIsGitRepo(contentDirectory)) {
    try {
      const git = simpleGit({
        baseDir: contentDirectory,
      });
      await git.addRemote(result.data.remoteName, result.data.remoteUrl);
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "message" in e &&
        typeof e.message === "string"
      ) {
        return e.message;
      } else {
        throw e;
      }
    }
  }
  revalidatePath("/git");
}

export async function createBranch(
  _state: string | undefined,
  formData: FormData,
) {
  // Auth check
  const session = await auth();
  if (!session?.user?.email) {
    return "Authentication required";
  }

  const contentDirectory = getContentDirectory();
  const branchName = formData.get("branchName") as string;
  if (!branchName) {
    return "Branch Name is required";
  }
  if (await directoryIsGitRepo(contentDirectory)) {
    try {
      await simpleGit(contentDirectory).checkout(["-b", branchName]);
    } catch (e) {
      if (
        e &&
        typeof e === "object" &&
        "message" in e &&
        typeof e.message === "string"
      ) {
        return e.message;
      } else {
        throw e;
      }
    }
  }
  revalidatePath("/git");
}

const commandHandlers: Record<
  string,
  (args: { git: SimpleGit; branch: string }) => Promise<void>
> = {
  async checkout({ git, branch }) {
    if (!branch) {
      throw new Error("Invalid branch");
    }
    /* The rebuild follows in `branchCommandAction`, once, for checkout only. */
    await git.checkout(branch);
  },
  async delete({ git, branch }) {
    if (!branch) {
      throw new Error("Invalid branch");
    }
    await git.deleteLocalBranch(branch);
  },
  async forceDelete({ git, branch }) {
    if (!branch) {
      throw new Error("Invalid branch");
    }
    await git.deleteLocalBranch(branch, true);
  },
};

export async function branchCommandAction(
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  // Auth check
  const session = await auth();
  if (!session?.user?.email) {
    return "Authentication required";
  }

  const contentDirectory = getContentDirectory();
  const command = formData.get("command");
  if (typeof command !== "string") {
    return "No command provided!";
  }
  const commandHandler = commandHandlers[command];
  if (!commandHandler) {
    return `Invalid command: ${command}`;
  }
  const branch = formData.get("branch");
  if (typeof branch !== "string") {
    return `Invalid branch`;
  }
  if (!(await directoryIsGitRepo(contentDirectory))) {
    return "Content directory is not a Git repository.";
  }
  try {
    const git = simpleGit({
      baseDir: contentDirectory,
    });
    await commandHandler({ git, branch });
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "message" in e &&
      typeof e.message === "string"
    ) {
      return e.message;
    } else {
      throw e;
    }
  }
  /*
   * A checkout swaps the whole tree, so every index is stale (D2). Deleting a
   * branch moves nothing on disk; it used to rebuild anyway, and twice for a
   * checkout (once in the handler, once here).
   */
  if (command === "checkout") await rebuildAllIndexes();
  revalidatePath("/git");
  return null;
}

export async function initializeContentGit() {
  // Auth check
  const session = await auth();
  if (!session?.user?.email) {
    throw new Error("Authentication required");
  }
  const {
    user: { email },
  } = session;

  const contentDirectory = getContentDirectory();
  if (!(await directoryIsGitRepo(contentDirectory))) {
    const git = simpleGit({
      baseDir: contentDirectory,
    });
    await git.init();
    await writeFile(
      join(contentDirectory, ".gitignore"),
      /*
       * The pagination keyspace and its dirty-page artifact are derived from
       * the content index, which is itself derived from the data files — all
       * three rebuild from what is tracked. `git.add(".")` just below would
       * otherwise sweep LMDB binaries into the initial commit.
       *
       * Derived from the registry rather than typed out (F21). The list this
       * replaced had drifted twice in the direction its own comment predicted:
       * the featured-recipes pair went missing until D2a, and `/pages/index`
       * was still absent here after the Playwright equivalent gained it. The
       * harness writes its own `.gitignore` and never exercises this one, so
       * nothing goes red — which is why the fix is a single owner rather than
       * a third careful reading.
       */
      derivedContentPaths(recipeContentTypes),
    );
    await git.add(".");
    await git.commit(INITIAL_COMMIT_MESSAGE, {
      "--author": `${email} <${email}>`,
    });
    /*
     * The indexes already described these files before there was a
     * repository; the first commit names them, so stamp it (27b) rather than
     * greet a freshly initialized repo with the stale-index banner.
     */
    await writeIndexedHead(contentDirectory);
  }
  revalidatePath("/git");
}
