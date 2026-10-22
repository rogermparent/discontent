import { notFound } from "next/navigation";
import { auth, signIn } from "@/auth";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import {
  curatorSetup,
  listCuratorRuns,
} from "recipe-editor/controller/agent/curator";
import { AGENT_PROMPT_MAX } from "recipe-editor/controller/agent/follow";
import { DEFAULT_AGENT_BUDGETS } from "recipe-editor/controller/agent/loop";
import { CuratorApp } from "@/curator/CuratorApp";

export const dynamic = "force-dynamic";

export const metadata = { title: "Curator" };

/** How many conversations the page lists. */
const RECENT_RUNS = 20;

/** One query parameter as a string (the first, if it is repeated). */
function param(value: string | string[] | undefined): string | undefined {
  const one = Array.isArray(value) ? value[0] : value;
  return one?.trim() ? one.trim() : undefined;
}

/**
 * `/curator` (epic 44, 44d): ask the editor's agent to find, fetch, import
 * and tag recipes — the same tools Claude Code's curator uses (E1), run as
 * an `agent` job (44c). Signed in only, like every editor page that writes;
 * and only with a model set up (43-Dq2's rule): without one it is a 404,
 * as the route refuses a run (Ec9).
 *
 * `?run=<id>` opens a run (linkable; Back goes back), `?prompt=` fills the
 * ask without starting it — ⌘K's hand-off (Ed6).
 */
export default async function CuratorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    return signIn(undefined, { redirectTo: "/curator" });
  }
  const setup = curatorSetup();
  if (!setup) notFound();
  const query = await searchParams;
  const runs = await listCuratorRuns({ limit: RECENT_RUNS });
  const run = param(query.run);
  const prompt = param(query.prompt);
  return (
    <PageMain>
      <PageSection maxWidth="none" grow className="mx-auto max-w-6xl">
        <CuratorApp
          setup={setup}
          runs={runs}
          {...(run ? { run } : {})}
          {...(prompt ? { prompt: prompt.slice(0, AGENT_PROMPT_MAX) } : {})}
          maxPrompt={AGENT_PROMPT_MAX}
          maxTurns={DEFAULT_AGENT_BUDGETS.maxTurns}
        />
      </PageSection>
    </PageMain>
  );
}
