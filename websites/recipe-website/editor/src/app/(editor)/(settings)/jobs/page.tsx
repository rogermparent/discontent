import { auth, signIn } from "@/auth";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import {
  listJobSummaries,
  queueOverview,
} from "recipe-editor/controller/jobs/views";
import { JobsDashboard } from "./JobsDashboard";

/** How many recent jobs the page lists. */
const RECENT = 100;

/**
 * `/jobs` (epic 37, 37c): every import, inspect and roundup this editor's
 * store holds — the editor's own, and a CLI's or the stdio MCP server's on
 * this machine — with the queue per resource. Owner only, like every
 * settings page; linked from Settings → Tools.
 */
export default async function JobsPage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/jobs` });
  }
  const [list, queue] = await Promise.all([
    listJobSummaries({ limit: RECENT }),
    queueOverview(),
  ]);
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Jobs</PageHeading>
        <p className="mb-4 text-sm text-muted-foreground">
          Every import, inspect and roundup runs as a job with a step log, and
          waits its turn for the GPU, yt-dlp and each site — whichever process
          started it: this editor, the CLI or an agent.
        </p>
        <JobsDashboard initialList={list} initialQueue={queue} limit={RECENT} />
      </PageSection>
    </PageMain>
  );
}
