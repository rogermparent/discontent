import { Suspense } from "react";
import { auth, signIn } from "@/auth";
import {
  claudeRequested,
  llmConfig,
} from "recipe-editor/controller/llm/client";
import { LocalModelStatus } from "../settings/tools/LocalModelStatus";
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
 * settings page; its own Settings item on every role (38b: a mirror's
 * imports are jobs too), and linked from Settings → Tools' card.
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
        {/*
         * 38g (Dg8): the model that reads imports, on every role — Settings
         * → Tools, its other home, is the workstation's only, and the Pi
         * may now read with the Claude API. Only when one is configured —
         * or the Claude API is asked for and is off, which it says why.
         */}
        {llmConfig() || claudeRequested() ? (
          <section className="mt-8" aria-labelledby="jobs-model-heading">
            <h2 id="jobs-model-heading" className="mb-2 text-sm font-semibold">
              The model imports read with
            </h2>
            <Suspense
              fallback={
                <p className="text-sm text-muted-foreground">Checking…</p>
              }
            >
              <LocalModelStatus />
            </Suspense>
          </section>
        ) : null}
      </PageSection>
    </PageMain>
  );
}
