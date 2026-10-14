import {
  getProjectsListPage,
  type ProjectIndexEntry,
} from "@discontent/projects-collection/controller/data/readIndex";
import { parseListPage } from "@discontent/cms/content/listPage";
import { ListPagination } from "@discontent/component-library/components/ListPagination";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";

function ProjectListItem({
  project: { name, slug },
}: {
  project: ProjectIndexEntry;
}) {
  return (
    <Link
      href={`/projects/edit/${slug}`}
      className="my-2 py-1 px-2 rounded-lg bg-secondary text-secondary-foreground block"
    >
      <h2>{name}</h2>
      <div className="italic text-muted-foreground">{slug}</div>
    </Link>
  );
}

/** Newest first, 20 to a page (F6a, epic 35q); `/projects?page=2` the next. */
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: "/projects" });
  }

  const pageNumber = parseListPage((await searchParams).page);
  if (pageNumber === null) notFound();
  const listed = await getProjectsListPage(pageNumber);
  if (!listed) notFound();
  const projects = listed.entries;

  return (
    <main className="flex flex-col items-center w-full p-2 max-w-4xl mx-auto grow">
      <div className="m-2 text-left w-full grow">
        <h2 className="font-bold text-2xl">Portfolio</h2>
        {projects && projects.length > 0 ? (
          <div>
            {projects.map((project) => {
              return <ProjectListItem key={project.slug} project={project} />;
            })}
          </div>
        ) : (
          <p className="text-center my-4">There are no projects yet.</p>
        )}
        <ListPagination
          basePath="/projects"
          page={listed.page}
          newerPage={listed.newerPage}
          olderPage={listed.olderPage}
        />
      </div>
      <div>
        <Link href="/projects/new">New Project</Link>
      </div>
    </main>
  );
}
