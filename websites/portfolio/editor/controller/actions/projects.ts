"use server";

import { createGenericActions } from "@discontent/cms/content/genericActions";
import type { EditorContentConfig } from "@discontent/cms/content/editorContentConfig";
import type { UploadSpec } from "@discontent/cms/content/types";
import createDefaultSlug from "@discontent/projects-collection/controller/createSlug";
import { projectContentConfig } from "@discontent/projects-collection/controller/projectContentConfig";
import parseProjectFormData, {
  type ParsedProjectFormData,
} from "@discontent/projects-collection/controller/parseFormData";
import type {
  ProjectFormData,
  ProjectFormState,
} from "@discontent/projects-collection/controller/formState";
import type {
  Project,
  ProjectEntryKey,
} from "@discontent/projects-collection/controller/types";
import { getProjectBySlug } from "@discontent/projects-collection/controller/data/read";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";
import { authenticateUser } from "./shared";

/*
 * Projects' write path.
 *
 * What this replaces is the point of the change. The three previous actions in
 * @discontent/projects-collection were "use server" functions with **no auth
 * check at all** — a server action is a POST endpoint, so anyone who could reach
 * the app could create, overwrite or recursively delete any project. They also
 * wrote with a bare outputJson/rename/rm, so there was no git commit, no LMDB
 * index, no uploads, and no slug-conflict handling.
 *
 * Everything here now rides createGenericActions, which is the same factory
 * recipe uses, behind a required `authenticate`.
 */

function formDataFromParsed(parsed: ParsedProjectFormData): ProjectFormData {
  return {
    name: parsed.name,
    summary: parsed.summary,
    content: parsed.content,
    slug: parsed.slug,
    date: parsed.date || undefined,
    role: parsed.role,
    client: parsed.client,
    status: parsed.status,
    featured: parsed.featured,
    tags: parsed.tags,
    links: parsed.links,
  };
}

/**
 * Build the record and its uploads.
 *
 * `current` is the stored record on update, absent on create. It is what makes
 * "leave the image alone" expressible: posting no file is not the same as
 * clearing one, and without the current record there is no third state to
 * preserve.
 *
 * This function used to return `uploads: {}` and omit `image` from `data`
 * entirely, which was worse than "images are unsupported" — it meant any
 * project that somehow *had* an image lost it on the next save of any other
 * field, silently. Model is recipe's buildRecipeData.
 */
function buildProjectData(
  parsed: ParsedProjectFormData,
  date: number,
  current?: Project,
): { data: Project; uploads: Record<string, UploadSpec> } {
  const {
    name,
    summary,
    content,
    role,
    client,
    status,
    featured,
    tags,
    links,
    image,
    clearImage,
    imageImportUrl,
  } = parsed;

  const uploads: Record<string, UploadSpec> = {
    image: {
      // A file input that was left alone still posts an empty File, so size is
      // the only honest test of "did they choose something".
      file: image && image.size > 0 ? image : undefined,
      clearFile: clearImage,
      fileImportUrl: imageImportUrl,
      existingFile: current?.image,
    },
  };

  // Resolved in precedence order: a new upload wins, then an explicit clear,
  // then an import URL, and failing all three the image already on the record.
  // That last branch is the one whose absence was the data-loss bug.
  const imageFileName =
    image && image.size > 0
      ? image.name
      : clearImage
        ? undefined
        : imageImportUrl
          ? new URL(imageImportUrl).pathname.split("/").pop()
          : current?.image;

  return {
    data: {
      name,
      date,
      summary: summary || undefined,
      content: content ?? "",
      image: imageFileName,
      role: role || undefined,
      client: client || undefined,
      status: status || undefined,
      featured: featured || undefined,
      tags: tags && tags.length > 0 ? tags : undefined,
      links: links && links.length > 0 ? links : undefined,
    },
    uploads,
  };
}

/** The stored record for a slug, or undefined if it cannot be read. */
async function readCurrentProject(
  slug: string,
  contentDirectory?: string,
): Promise<Project | undefined> {
  try {
    return await getProjectBySlug(slug, contentDirectory);
  } catch {
    return undefined;
  }
}

const projectEditorConfig: EditorContentConfig<
  Project,
  ReturnType<typeof projectContentConfig.buildIndexValue>,
  ProjectEntryKey,
  ProjectFormState,
  ParsedProjectFormData
> = {
  contentConfig: projectContentConfig,
  successConfig: {
    // Deliberately "/project/<slug>", not "/<slug>". create.ts and update.ts
    // used to redirect to "/" + slug, which lands on the *pages* catch-all —
    // which is why creating a project appeared to be broken.
    itemBasePath: "/project",
    // `/projects` as a **layout**, not a page: that revalidates the whole
    // subtree, which is what reaches `/projects/edit/<slug>`. Revalidating it
    // as a page leaves the edit form's cached render in place, so saving and
    // then returning to the form showed the values you had just replaced —
    // reliably within the router cache's TTL, and not at all after it, which is
    // why the suite only saw it sometimes.
    listPaths: [
      { path: "/projects", type: "layout" },
      { path: "/", type: "page" },
    ],
  },

  parseFormData: (formData: FormData) => {
    const validated = parseProjectFormData(formData);
    if (!validated.success) {
      return {
        success: false as const,
        state: {
          errors: z.flattenError(validated.error).fieldErrors,
          message: "Failed to save project.",
        } as ProjectFormState,
      };
    }
    return { success: true as const, parsed: validated.data };
  },

  buildCreateData: async (parsed) => {
    const date = parsed.date || Date.now();
    const slug = slugify(parsed.slug || createDefaultSlug(parsed));
    return { slug, data: buildProjectData(parsed, date).data };
  },

  buildUpdateData: async (
    parsed,
    currentSlug,
    currentDate,
    contentDirectory,
  ) => {
    const date = parsed.date || currentDate || Date.now();
    const slug = slugify(parsed.slug || createDefaultSlug(parsed));
    const current = await readCurrentProject(currentSlug, contentDirectory);
    return { slug, data: buildProjectData(parsed, date, current).data };
  },

  // The two upload hooks the config always supported and this action never
  // implemented — which is why a posted file had nowhere to go even once the
  // schema stopped discarding it.
  buildCreateUploads: async (parsed) => {
    return buildProjectData(parsed, 0).uploads;
  },

  buildUpdateUploads: async (parsed, currentSlug, contentDirectory) => {
    const current = await readCurrentProject(currentSlug, contentDirectory);
    return buildProjectData(parsed, 0, current).uploads;
  },

  buildCurrentIndexKey: (currentDate, currentSlug): ProjectEntryKey => [
    currentDate,
    currentSlug,
  ],

  checkSlugConflict: async (slug, contentDirectory) => {
    try {
      await getProjectBySlug(slug, contentDirectory);
      return true;
    } catch {
      return false;
    }
  },

  extractFormData: formDataFromParsed,

  label: "project",
  authenticate: authenticateUser,
};

const projectActions = createGenericActions(projectEditorConfig);

export async function createProject(
  prevState: ProjectFormState | null,
  formData: FormData,
): Promise<ProjectFormState> {
  return projectActions.create(prevState, formData);
}

export async function updateProject(
  currentDate: number,
  currentSlug: string,
  prevState: ProjectFormState | null,
  formData: FormData,
): Promise<ProjectFormState> {
  return projectActions.update(currentDate, currentSlug, prevState, formData);
}

export async function deleteProject(date: number, slug: string): Promise<void> {
  return projectActions.delete(date, slug);
}
