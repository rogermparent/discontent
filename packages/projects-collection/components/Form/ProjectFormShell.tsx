"use client";

import { ReactNode } from "react";
import { FormShell } from "@discontent/component-library/components/Form/FormShell";
import {
  ProjectFormProvider,
  useProjectFormInstance,
} from "./projectFormContext";
import type { Project } from "../../controller/types";

/**
 * Owns the TanStack Form instance for the project form and shares it with the
 * fields via context. The `<form>` element itself is the shared `FormShell`.
 *
 * Callers must remount this on a failed round-trip
 * (`key={state.formData ? state.message : undefined}`): `useForm` captures its
 * defaults at mount, so without the remount the echoed values never reach the
 * fields and everything typed is discarded. Both project page wrappers were
 * missing that, which is why a validation error used to wipe the form.
 */
export function ProjectFormShell({
  action,
  project,
  slug,
  className,
  children,
}: {
  action: (formData: FormData) => void;
  project?: Partial<Project>;
  slug?: string;
  className?: string;
  children: ReactNode;
}) {
  const form = useProjectFormInstance(project, slug);

  return (
    <ProjectFormProvider value={form}>
      <FormShell
        id="project-form"
        className={className}
        action={action}
        form={form}
      >
        {children}
      </FormShell>
    </ProjectFormProvider>
  );
}
