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
    videoUrl: parsed.videoUrl || undefined,
  };
}

function buildRecipeData(
  parsed: ParsedRecipeFormData,
  date: number,
  currentRecipeData?: Recipe | null,
): {
  data: Recipe;
  uploads: Record<string, UploadSpec>;
} {
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
    imageImportUrl,
    prepTime,
    cookTime,
    totalTime,
    recipeYield,
    timelines,
    tags,
    source,
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

  const uploads: Record<string, UploadSpec> = {
    image: {
      file: image ?? undefined,
      clearFile: clearImage,
      fileImportUrl: imageImportUrl,
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
        : imageImportUrl
          ? new URL(imageImportUrl).pathname.split("/").pop()
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
    const { data } = buildRecipeData(parsed, date);
    return { slug, data };
  },

  async buildUpdateData(parsed, currentSlug, currentDate, contentDirectory) {
    const currentRecipeData = await getRecipeBySlug({
      slug: currentSlug,
      contentDirectory,
    });
    const slug = slugify(parsed.slug || createDefaultSlug(parsed));
    const date = parsed.date || currentDate || Date.now();
    const { data } = buildRecipeData(parsed, date, currentRecipeData);
    return { slug, data };
  },

  async buildCreateUploads(parsed) {
    const { uploads } = buildRecipeData(parsed, 0);
    return uploads;
  },

  async buildUpdateUploads(parsed, currentSlug, contentDirectory) {
    const currentRecipeData = await getRecipeBySlug({
      slug: currentSlug,
      contentDirectory,
    });
    const { uploads } = buildRecipeData(parsed, 0, currentRecipeData);
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
export const createRecipe = recipeActions.create;
export const overwriteRecipe = recipeActions.overwriteCreate;
export const updateRecipe = recipeActions.update;
export const overwriteUpdateRecipe = recipeActions.overwriteUpdate;
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
   * branch-switch path, where `rebuildRecipeIndex` is how the whole corpus is
   * meant to change over.
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
 * featured recipes its cascade reaches, and deliberately nothing else — and it
 * is what the git branch-switch path calls, where widening it would drop the
 * whole cache on every checkout for no reason.
 *
 * What needed a wider one was the export (T9/22b): `buildExport` called
 * `rebuildRecipeIndex` to self-heal a content directory that predates an index,
 * and groups are not recipe dependents, so a directory with unbuilt groups
 * shipped a `/groups` that was silently empty with no error at all. That is the
 * same class of bug §13 keeps producing, and the fix is to ask the registry
 * rather than to name two more configs here.
 *
 * `cascadeDependents: false` because the loop already covers every type. The
 * default is true, and leaving it on would rebuild featured recipes twice —
 * once as the recipe rebuild's cascade, once on its own pass.
 */
export async function rebuildAllIndexes() {
  const contentDirectory = getContentDirectory();
  for (const config of recipeContentTypes) {
    await rebuildIndex({ config, contentDirectory, cascadeDependents: false });
  }
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
    await git.checkout(branch);
    await rebuildRecipeIndex();
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
  await rebuildRecipeIndex();
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
  }
  revalidatePath("/git");
}
