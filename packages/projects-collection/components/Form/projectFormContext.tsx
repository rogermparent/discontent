"use client";

import { createContext, useContext } from "react";
import { useForm } from "@tanstack/react-form";
import type { Project, ProjectLink } from "../../controller/types";

/**
 * The controlled shape of the project form.
 *
 * Mirrors recipe's `formContext`. Every value here is also rendered as a real
 * DOM input carrying a `name` (or a hidden mirror, for markdown and chips) —
 * TanStack Form never serializes anything; the browser builds FormData from the
 * DOM and TanStack only keeps these values in sync.
 */
export interface ProjectFormValues {
  name: string;
  slug: string;
  summary: string;
  content: string;
  role: string;
  client: string;
  status: "" | "shipped" | "wip" | "archived";
  featured: boolean;
  tags: string[];
  links: ProjectLink[];
  date?: number;
  /**
   * The *stored* image filename — never the posted `File`.
   *
   * The file input stays uncontrolled: a browser will not let script set a
   * file input's value, so there is nothing for TanStack to keep in sync. What
   * this value drives is whether the form believes an image already exists,
   * which is what decides between "show the existing image and a Remove
   * checkbox" and "show an empty picker".
   */
  image: string;
}

export function projectToFormValues(
  project?: Partial<Project>,
  slug?: string,
): ProjectFormValues {
  return {
    name: project?.name ?? "",
    slug: slug ?? "",
    summary: project?.summary ?? "",
    content: project?.content ?? "",
    role: project?.role ?? "",
    client: project?.client ?? "",
    status: project?.status ?? "",
    featured: project?.featured ?? false,
    tags: project?.tags ?? [],
    links: project?.links ?? [],
    date: project?.date,
    image: project?.image ?? "",
  };
}

/** Creates the project form instance. Used by ProjectFormShell. */
export function useProjectFormInstance(
  project?: Partial<Project>,
  slug?: string,
) {
  return useForm({
    defaultValues: projectToFormValues(project, slug),
  });
}

export type ProjectForm = ReturnType<typeof useProjectFormInstance>;

const ProjectFormContext = createContext<ProjectForm | undefined>(undefined);

export const ProjectFormProvider = ProjectFormContext.Provider;

export function useProjectForm(): ProjectForm {
  const form = useContext(ProjectFormContext);
  if (!form) {
    throw new Error("useProjectForm must be used within a ProjectFormShell");
  }
  return form;
}
