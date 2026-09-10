import getProjectBySlug from "@discontent/projects-collection/controller/data/read";
import { getProjectUploadUrl } from "@discontent/projects-collection/controller/uploadUrl";
import EditForm from "./form";
import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";

/*
 * Never cached. The form must show what is on disk *now*: this page was being
 * served from cache after a save, so editing, saving and returning to the form
 * showed the values you had just replaced. It reads `auth()` and so is dynamic
 * anyway — this makes the requirement explicit rather than incidental.
 */
export const dynamic = "force-dynamic";

export default async function Project({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join("/");
  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: `/projects/edit/${slug}`,
    });
  }
  let project;
  try {
    project = await getProjectBySlug(slug);
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }
  const { name, image } = project;
  // Built here because this is the only layer holding both halves: the record
  // stores a bare filename, and the URL needs the slug too.
  const defaultImage = image ? getProjectUploadUrl(slug, image) : undefined;
  return (
    <main className="flex flex-col items-center px-2 grow max-w-xl w-full h-full">
      <h1 className="text-2xl font-bold my-2">Editing Project: {name}</h1>
      <EditForm project={project} slug={slug} defaultImage={defaultImage} />
    </main>
  );
}
