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
            description="A local model reads recipe pages that carry no recipe data (epic 36). Configured in the editor's environment, not here."
          >
            <LocalModelStatus />
          </SettingsCard>
        </div>
      </PageSection>
    </PageMain>
  );
}
