"use client";
import Link from "next/link";
import { Button } from "@/components/Button";
import UpdateResumeFields from "@/components/Resume/Form/Update";
import updateResume from "@/controller/actions/update";
import { ResumeFormState } from "@/controller/formState";
import { Resume } from "@/controller/types";
import { useActionState } from "react";

export default function EditResumeForm({
  resume,
  slug,
}: {
  slug: string;
  resume: Resume;
}) {
  const { date } = resume;
  const initialState = { message: "", errors: {} } as ResumeFormState;
  const updateThisResume = updateResume.bind(null, date, slug);
  const [state, dispatch] = useActionState(updateThisResume, initialState);
  return (
    <form className="w-full h-full flex flex-col grow" action={dispatch}>
      <UpdateResumeFields resume={resume} slug={slug} state={state} />
      <div className="flex flex-row flex-nowrap items-center gap-2 my-1">
        <Button type="submit">Submit</Button>
        {/* Back to the resume, discarding the edits: nothing is saved. */}
        <Link
          href={`/resume/${slug}`}
          className="rounded-md px-2 py-1 underline hover:bg-slate-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
