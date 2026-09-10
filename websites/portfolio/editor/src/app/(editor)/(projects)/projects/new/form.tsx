"use client";

import CreateProjectFields from "@discontent/projects-collection/components/Form/Create";
import { ProjectFormShell } from "@discontent/projects-collection/components/Form/ProjectFormShell";
import { useActionState } from "react";
import { Button } from "@discontent/component-library/components/Button";
import { ProjectFormState } from "@discontent/projects-collection/controller/formState";
import { createProject } from "../../../../../../controller/actions/projects";
import Link from "next/link";

export default function NewProjectForm({
  allTags = [],
}: {
  allTags?: string[];
}) {
  const initialState = { message: "", errors: {} } as ProjectFormState;
  const [state, dispatch] = useActionState(createProject, initialState);

  return (
    // The remount key is load-bearing, and was missing here: `useForm` captures
    // its defaults at mount, so without it a failed round-trip re-rendered the
    // form with its *original* defaults and silently discarded everything the
    // user had typed.
    <ProjectFormShell
      key={state.formData ? state.message : undefined}
      action={dispatch}
      project={state.formData}
      slug={state.formData?.slug}
      className="w-full h-full flex flex-col grow"
    >
      <CreateProjectFields state={state} allTags={allTags} />
      <div className="flex flex-row flex-nowrap my-1">
        <Button type="submit">Submit</Button>
      </div>
      <div>
        <Link href="/projects">Back to Projects</Link>
      </div>
    </ProjectFormShell>
  );
}
