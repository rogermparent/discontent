import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { jobsDirectory } from "recipe-editor/controller/jobs/location";
import { findJob } from "recipe-editor/controller/jobs/store";
import { JobDetail } from "./JobDetail";

/**
 * `/jobs/<id>` (epic 37, 37c): one job — its step timeline (bars by ms,
 * nested by `parent`), its warnings, what it answered, the raw JSONL, and
 * Cancel / Retry. `<id>` may be the eight characters the step lines show.
 */
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/jobs/${encodeURIComponent(id)}` });
  }
  const meta = await findJob(jobsDirectory(), id).catch(() => undefined);
  if (!meta) notFound();
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <JobDetail
          key={meta.id}
          id={meta.id}
          kind={meta.kind}
          label={meta.label}
        />
      </PageSection>
    </PageMain>
  );
}
