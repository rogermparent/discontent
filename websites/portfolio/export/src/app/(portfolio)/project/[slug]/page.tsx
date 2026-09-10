import { notFound } from "next/navigation";
import { getProjectBySlug } from "@discontent/projects-collection/controller/data/read";
import { readAllProjectIds } from "@discontent/projects-collection/controller/data/readAllProjectIds";
import { ProjectView } from "@discontent/projects-collection/components/View";

/**
 * A work's case study, statically rendered.
 *
 * The ENOENT→notFound() guard is duplicated into generateMetadata on purpose:
 * Next runs the two independently, so a guard in only the page leaves metadata
 * throwing — turning what should be a 404 into a build-time crash.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // The placeholder param from generateStaticParams — see there. It names no
  // project, so it must not reach the reader.
  if (!slug || slug === "/") {
    return {};
  }
  try {
    const project = await getProjectBySlug(slug);
    return { title: project.name, description: project.summary };
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!slug || slug === "/") {
    return null;
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

  return (
    <main className="mx-auto w-full max-w-3xl grow px-4 py-12 sm:px-6 sm:py-16">
      <ProjectView project={project} slug={slug} />
    </main>
  );
}

export async function generateStaticParams() {
  // A keys-only walk of the pagination index, which must therefore exist at
  // build time — the export action rebuilds it before invoking the build for
  // exactly this reason. This used to be `getProjects()`, which deserialized
  // every index value to keep the slug and throw the rest away.
  //
  // The order is now ascending rather than newest-first. That is not a
  // regression to absorb: `generateStaticParams` decides which pages exist,
  // not what any of them contains.
  const slugs = await readAllProjectIds();
  // A dynamic route under `output: "export"` must emit at least one param or
  // the build fails; "/" is the harmless placeholder the page short-circuits.
  // The sibling `[...slug]` route has carried this guard since it was written —
  // without it here, a fresh clone with no projects yet cannot build at all,
  // which is precisely the state a fork starts in. It stays "/" rather than
  // recipe's "_" because this page's two short-circuits above test for it.
  if (!slugs.length) {
    return [{ slug: "/" }];
  }
  return slugs.map((slug) => ({ slug }));
}
