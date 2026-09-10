import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectBySlug } from "@discontent/projects-collection/controller/data/read";
import { ProjectView } from "@discontent/projects-collection/components/View";
// The delete action lives in *this app* now, not the shared package: it needs
// this app's auth, and the package version had none at all.
import { deleteProject } from "../../../../../controller/actions/projects";
import { ConfirmDeleteButton } from "@discontent/component-library/components/ConfirmDelete";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join("/");
  return { title: slug };
}

export default async function Project({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join("/");
  let project;
  try {
    project = await getProjectBySlug(slug);
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }
  // Bound with the date too — the index key is [date, slug], so a delete
  // without it cannot find the entry to remove.
  const deleteProjectWithId = deleteProject.bind(null, project.date, slug);

  return (
    <main className="flex flex-col items-center w-full h-full grow">
      <div className="flex flex-row grow w-full h-full">
        <div className="grow flex flex-col flex-nowrap items-center">
          <ProjectView project={project} slug={slug} />
        </div>
      </div>
      <hr className="w-full border-border print:hidden" />
      <div className="flex flex-row justify-center m-1 print:hidden">
        <form id="delete-project-form" action={deleteProjectWithId} />
        <ConfirmDeleteButton
          formId="delete-project-form"
          itemLabel="project"
          description="This removes the case study and its place in the index."
        />
        <Link
          href={`/projects/edit/${slug}`}
          className="underline bg-secondary text-secondary-foreground rounded-md text-sm py-1 px-2 mx-1"
        >
          Edit
        </Link>
      </div>
    </main>
  );
}
