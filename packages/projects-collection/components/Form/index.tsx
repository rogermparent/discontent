import type { StaticImageProps } from "@discontent/next-static-image/src";
import { ProjectFormState } from "../../controller/formState";
import ProjectFields from "./fields";

/**
 * The project fields, for a page wrapper that has already mounted a
 * `ProjectFormShell` around them — the shell owns the TanStack Form instance
 * and seeds it from `project`/`slug`, so those are no longer threaded through
 * here.
 */
export default function ProjectForm({
  state,
  allTags,
  defaultImage,
}: {
  state?: ProjectFormState;
  allTags?: string[];
  /** The already-stored image, forwarded to the image field. */
  defaultImage?: StaticImageProps | string;
}) {
  return (
    <ProjectFields
      state={state}
      allTags={allTags}
      defaultImage={defaultImage}
    />
  );
}
