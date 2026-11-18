import { notFound } from "next/navigation";
import { auth, redirectToLogin } from "@/auth";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { jobsDirectory } from "recipe-editor/controller/jobs/location";
import { findJob } from "recipe-editor/controller/jobs/store";
import { JobDetail } from "./JobDetail";

export const dynamic = "force-dynamic";

/**
 * `/jobs/<id>` (epic 37, 37c; 48c, canvas B): one job — where its time
 * went, what it did as sentences on a time rail, what it answered, its
 * warnings, and for the curious every step to scale and the raw JSONL;
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
    return redirectToLogin(`/jobs/${encodeURIComponent(id)}`);
  }
  const meta = await findJob(jobsDirectory(), id).catch(() => undefined);
  if (!meta) notFound();
  return (
    <PageMain>
      <PageSection maxWidth="none" grow className="mx-auto max-w-6xl">
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
