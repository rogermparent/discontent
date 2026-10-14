"use server";

import parseResumeFormData from "../parseFormData";
import slugify from "@sindresorhus/slugify";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ResumeFormState } from "../formState";
import type { Resume } from "../types";
import { resumeContentConfig } from "../resumeContentConfig";
import { createContent } from "@discontent/cms/content/createContent";
import z from "zod";

export default async function createResume(
  _prevState: ResumeFormState,
  formData: FormData,
) {
  const validatedFields = parseResumeFormData(formData);

  if (!validatedFields.success) {
    return {
      errors: z.flattenError(validatedFields.error).fieldErrors,
      message: "Failed to create Resume.",
    };
  }

  const { date: givenDate, slug: givenSlug, ...rest } = validatedFields.data;
  const date: number = givenDate || Date.now();
  const slug = slugify(
    givenSlug || resumeContentConfig.createDefaultSlug!({ ...rest, date }),
  );

  const data: Resume = { ...rest, date };

  await createContent({
    config: resumeContentConfig,
    slug,
    data,
    commitMessage: `Add new resume: ${slug}`,
  });

  revalidatePath("/resume/" + slug);
  revalidatePath("/resumes");
  revalidatePath("/");
  redirect("/resume/" + slug);
}
