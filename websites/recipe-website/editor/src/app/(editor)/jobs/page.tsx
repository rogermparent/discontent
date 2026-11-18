import { Suspense } from "react";
import { auth, redirectToLogin } from "@/auth";
import {
  claudeRequested,
  llmConfig,
} from "recipe-editor/controller/llm/client";
import { LocalModelStatus } from "../(settings)/settings/tools/LocalModelStatus";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { jobsBoard } from "recipe-editor/controller/jobs/views";
import { JobsBoard } from "./JobsBoard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Jobs" };

/** How many recent jobs the page reads: every one the store keeps. */
const RECENT = 300;

/** One query parameter as a string (the first, if it is repeated). */
function param(value: string | string[] | undefined): string | undefined {
  const one = Array.isArray(value) ? value[0] : value;
  return one?.trim() ? one.trim() : undefined;
}

/**
 * `/jobs` (epic 37, 37c; 48c, canvas B "Now / needs a look / history"):
 * every import, inspect, curator run, rebuild and sync this editor's store
 * holds — the editor's own, and a CLI's or the stdio MCP server's on this
 * machine. A page of its own since 48c (B: out of Settings, reached from
 * the masthead's live chip and Settings' Jobs item): what runs now and why
 * it waits, what didn't work grouped by cause, and the history with each
 * round in one row; the machine's lines beside it. Owner only.
 *
 * `?rows=each` lists one row per job (no rounds folded).
 */
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await auth();
  if (!user) {
    return redirectToLogin(`/jobs`);
  }
  const [board, query] = await Promise.all([
    jobsBoard({ limit: RECENT }),
    searchParams,
  ]);
  return (
    <PageMain>
      <PageSection maxWidth="none" grow className="mx-auto max-w-6xl">
        <JobsBoard
          initial={board}
          limit={RECENT}
          eachRow={param(query.rows) === "each"}
          models={
            /*
             * 38g (Dg8): the model that reads imports, on every role —
             * only when one is configured, or the Claude API is asked for
             * and is off, which it says why.
             */
            llmConfig() || claudeRequested() ? (
              <section
                className="flex flex-col gap-2 rounded-xl border bg-card p-4"
                aria-labelledby="jobs-model-heading"
              >
                <h2
                  id="jobs-model-heading"
                  className="font-display text-base font-semibold"
                >
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
            ) : null
          }
        />
      </PageSection>
    </PageMain>
  );
}
