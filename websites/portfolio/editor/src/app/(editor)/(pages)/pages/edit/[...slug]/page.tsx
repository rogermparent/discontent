import getPageBySlug from "@discontent/pages-collection/controller/data/read";
import EditForm from "./form";
import { notFound } from "next/navigation";
import { auth, redirectToLogin } from "@/auth";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug: slugSegments } = await params;
  const slug = slugSegments.join("/");
  const user = await auth();
  if (!user) {
    return redirectToLogin(`/pages/edit/${slug}`);
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
  const { name } = page;
  return (
    <main className="flex flex-col items-center px-2 grow max-w-xl w-full h-full">
      <h1 className="text-2xl font-bold my-2">Editing Page: {name}</h1>
      <EditForm page={page} slug={slug} />
    </main>
  );
}
