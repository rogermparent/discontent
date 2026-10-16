import Link from "next/link";
import { auth, signIn } from "@/auth";
import { readSettings } from "@/settings";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { SettingsCard } from "../../SettingsCard";
import { SettingsForm } from "../SettingsForm";
import { LocalModelStatus } from "./LocalModelStatus";

export default async function ToolsPage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/settings/tools` });
  }
  const settings = await readSettings();
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Tools</PageHeading>
        <div className="space-y-6">
          <SettingsCard
            title="Media downloader"
            description="Configure yt-dlp for importing recipes from video links."
          >
            <SettingsForm settings={settings} />
          </SettingsCard>
          <SettingsCard
            title="Local model"
            description="A local model — or the Claude API — reads recipe pages that carry no recipe data, pasted text and photos (epics 36, 38). Configured in the editor's environment, not here."
          >
            <LocalModelStatus />
          </SettingsCard>
          <SettingsCard
            title="Import jobs"
            description="Every import, inspect and roundup runs as a job with a step log, and waits in one queue for the GPU, yt-dlp and each site."
          >
            <Link href="/jobs" className="text-sm underline underline-offset-2">
              See the jobs and the queue
            </Link>
          </SettingsCard>
        </div>
      </PageSection>
    </PageMain>
  );
}
