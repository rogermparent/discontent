import { notFound } from "next/navigation";
import getPageBySlug from "@discontent/pages-collection/controller/data/read";
import getPages from "@discontent/pages-collection/controller/data/readIndex";
import { PageView } from "@discontent/pages-collection/components/View";

/**
 * Owner-authored pages (/about, /colophon…).
 *
 * This route was **absent from the export app entirely**, which meant /about
 * simply could not render in the published site — the editor had the route and
 * the static build did not, so the gap only showed up after deploying.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  return { title: slugSegments.join("/") };
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join("/");
  if (!slug || slug === "/") {
    return null;
  }
  let page;
  try {
    page = await getPageBySlug(slug);
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      notFound();
    }
    throw e;
  }

  return (
    <main className="mx-auto w-full max-w-3xl grow px-4 py-12 sm:px-6 sm:py-16">
      <PageView page={page} />
    </main>
  );
}

export async function generateStaticParams() {
  const { pages } = await getPages();
  // A dynamic route under `output: "export"` must emit at least one param or
  // the build fails; "/" is the harmless placeholder the page short-circuits.
  if (!pages?.length) {
    return [{ slug: ["/"] }];
  }
  return pages.map(({ slug }) => ({ slug: slug.split("/") }));
}
