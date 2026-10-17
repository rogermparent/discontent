import Link from "next/link";
import { notFound } from "next/navigation";
import { ResumeView } from "@/components/Resume/View";
import getResumeBySlug from "@/controller/data/read";
import deleteResume from "@/controller/actions/delete";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: slug };
}

export default async function Resume({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let resume;
  try {
    resume = await getResumeBySlug(slug);
  } catch (e) {
    if ((e as { code: string }).code === "ENOENT") {
      notFound();
    }
    throw e;
  }
  const { date, company } = resume;

  const deleteResumeWithId = deleteResume.bind(null, date, slug);

  return (
    <main className="flex flex-col items-center w-full h-full grow">
      {/*
        Which company this resume is aimed at — the list and the edit page
        name it, the resume itself doesn't. Screen only: the printed resume
        goes to that company and stays as it was.
      */}
      {company && (
        <p className="w-full px-2 py-1 text-sm print:hidden">
          Resume for <span className="font-semibold">{company}</span>
        </p>
      )}
      <ResumeView resume={resume} />
      <hr className="w-full border-slate-700 print:hidden" />
      <div className="flex flex-row justify-center m-1 print:hidden">
        <form action={deleteResumeWithId}>
          <button className="underline bg-slate-700 rounded-md text-sm py-1 px-2 mx-1">
            Delete
          </button>
        </form>
        <Link
          href={`/resume/${slug}/edit`}
          className="underline bg-slate-700 rounded-md text-sm py-1 px-2 mx-1"
        >
          Edit
        </Link>
        <Link
          href={`/resume/${slug}/copy`}
          className="underline bg-slate-700 rounded-md text-sm py-1 px-2 mx-1"
        >
          Copy
        </Link>
      </div>
    </main>
  );
}
