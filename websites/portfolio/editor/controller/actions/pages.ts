"use server";

import { createGenericActions } from "@discontent/cms/content/genericActions";
import type { EditorContentConfig } from "@discontent/cms/content/editorContentConfig";
import createDefaultSlug from "@discontent/pages-collection/controller/createSlug";
import { pageContentConfig } from "@discontent/pages-collection/controller/pageContentConfig";
import parsePageFormData, {
  type ParsedPageFormData,
} from "@discontent/pages-collection/controller/parseFormData";
import type {
  PageFormData,
  PageFormState,
} from "@discontent/pages-collection/controller/formState";
import type {
  Page,
  PageEntryKey,
} from "@discontent/pages-collection/controller/types";
import getPageBySlug from "@discontent/pages-collection/controller/data/read";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";
import { authenticateUser } from "./shared";

/*
 * Pages' write path.
 *
 * These actions live in the app rather than in @discontent/pages-collection for
 * one reason: they need `@/auth`, which is a per-app path alias. That is also
 * what the package could not express, and why its three `"use server"` actions
 * shipped with **no auth check at all** — unauthenticated create, overwrite and
 * recursive delete, reachable by anyone who could POST to either site.
 *
 * Everything now rides createGenericActions, the same factory recipes and
 * projects use, behind a required `authenticate`.
 */

function formDataFromParsed(parsed: ParsedPageFormData): PageFormData {
  return {
    name: parsed.name,
    content: parsed.content,
    slug: parsed.slug,
    date: parsed.date || undefined,
  };
}

function buildPageData(parsed: ParsedPageFormData, date: number): Page {
  const { name, content } = parsed;
  return { name, date, content: content ?? "" };
}

const pageEditorConfig: EditorContentConfig<
  Page,
  ReturnType<typeof pageContentConfig.buildIndexValue>,
  PageEntryKey,
  PageFormState,
  ParsedPageFormData
> = {
  contentConfig: pageContentConfig,
  successConfig: {
    // Pages render at the site root ("/about"), not under a prefix, so
    // itemBasePath is empty and the redirect target is "/" + slug. Keeping that
    // exact target matters: `pages.spec.ts` asserts the rendered page
    // immediately after creating it.
    itemBasePath: "",
    listPaths: [{ path: "/pages" }],
    redirectTo: (slug: string) => "/" + slug,
  },
  deleteSuccessConfig: {
    itemBasePath: "",
    listPaths: [{ path: "/pages" }],
    redirectTo: () => "/pages",
  },

  parseFormData: (formData: FormData) => {
    const validated = parsePageFormData(formData);
    if (!validated.success) {
      return {
        success: false as const,
        state: {
          errors: z.flattenError(validated.error).fieldErrors,
          message: "Failed to save page.",
        } as PageFormState,
      };
    }
    return { success: true as const, parsed: validated.data };
  },

  buildCreateData: async (parsed) => {
    const date = parsed.date || Date.now();
    const slug = slugify(parsed.slug || createDefaultSlug(parsed));
    return { slug, data: buildPageData(parsed, date) };
  },

  buildUpdateData: async (parsed, _currentSlug, currentDate) => {
    const date = parsed.date || currentDate || Date.now();
    const slug = slugify(parsed.slug || createDefaultSlug(parsed));
    return { slug, data: buildPageData(parsed, date) };
  },

  buildCurrentIndexKey: (currentDate, currentSlug): PageEntryKey => [
    currentDate,
    currentSlug,
  ],

  checkSlugConflict: async (slug, contentDirectory) => {
    try {
      await getPageBySlug(slug, contentDirectory);
      return true;
    } catch {
      return false;
    }
  },

  extractFormData: formDataFromParsed,

  label: "page",
  authenticate: authenticateUser,
};

const pageActions = createGenericActions(pageEditorConfig);

export async function createPage(
  prevState: PageFormState | null,
  formData: FormData,
): Promise<PageFormState> {
  return pageActions.create(prevState, formData);
}

export async function updatePage(
  currentDate: number,
  currentSlug: string,
  prevState: PageFormState | null,
  formData: FormData,
): Promise<PageFormState> {
  return pageActions.update(currentDate, currentSlug, prevState, formData);
}

export async function deletePage(date: number, slug: string): Promise<void> {
  return pageActions.delete(date, slug);
}
