import { notFound } from "next/navigation";
import { parseListPage, readListPage } from "@discontent/cms/content/listPage";
import { ListPagination } from "@discontent/component-library/components/ListPagination";
import ResumeList from "@/components/Resume/List";
import getResumes from "@/controller/data/readIndex";

const RESUMES_PER_PAGE = 20;

/**
 * Every resume, newest first, 20 to a page (F6d, epic 35q): the home page's
 * "More" link pointed here, at a route that no longer existed.
 */
export default async function Resumes({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const pageNumber = parseListPage((await searchParams).page);
  if (pageNumber === null) notFound();
  const listed = await readListPage(
    pageNumber,
    RESUMES_PER_PAGE,
    async (options) => {
      const { resumes, more } = await getResumes(options);
      return { entries: resumes, more };
    },
  );
  if (!listed) notFound();

  return (
    <main className="flex flex-col items-center h-full w-full p-2 max-w-xl mx-auto grow bg-slate-950">
      <div className="m-2 text-left w-full grow">
        <h2 className="font-bold text-2xl">All Resumes</h2>
        {listed.entries.length > 0 ? (
          <ResumeList resumes={listed.entries} />
        ) : (
          <p className="text-center my-4">There are no resumes yet.</p>
        )}
        <ListPagination
          basePath="/resumes"
          page={listed.page}
          newerPage={listed.newerPage}
          olderPage={listed.olderPage}
        />
      </div>
    </main>
  );
}
