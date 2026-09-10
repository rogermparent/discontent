"use client";

import UpdateProjectFields from "@discontent/projects-collection/components/Form/Update";
import { ProjectFormShell } from "@discontent/projects-collection/components/Form/ProjectFormShell";
import { useActionState } from "react";
import { Button } from "@discontent/component-library/components/Button";
import { Project } from "@discontent/projects-collection/controller/types";
import { ProjectFormState } from "@discontent/projects-collection/controller/formState";
import { updateProject } from "../../../../../../../controller/actions/projects";
import Link from "next/link";

export default function EditProjectForm({
  project,
  slug,
  allTags = [],
  defaultImage,
}: {
  slug: string;
  project: Project;
  allTags?: string[];
  /** URL of the already-stored image, built by the server page. */
  defaultImage?: string;
}) {
  const initialState = { message: "", errors: {} } as ProjectFormState;
  // Both date and slug: the LMDB index key is [date, slug], so an update that
  // does not know the current date cannot locate the entry it is replacing.
  const updateThisProject = updateProject.bind(null, project.date, slug);
  const [state, dispatch] = useActionState(updateThisProject, initialState);

  return (
    // On a refused round-trip, seed the form from the echoed values rather than
    // from the stored record — with the remount key, since `useForm` reads its
    // defaults only at mount. Neither half was here before, so a validation
    // error threw away the edit it was complaining about.
    <ProjectFormShell
      key={state.formData ? state.message : undefined}
      action={dispatch}
      project={state.formData || project}
      slug={state.formData?.slug ?? slug}
      className="w-full h-full flex flex-col grow"
    >
      <UpdateProjectFields
        state={state}
        allTags={allTags}
        defaultImage={defaultImage}
      />
      <div className="flex flex-row flex-nowrap my-1">
        <Button type="submit">Submit</Button>
      </div>
      <div>
        <Link href="/projects">Back to Projects</Link>
      </div>
    </ProjectFormShell>
  );
}
