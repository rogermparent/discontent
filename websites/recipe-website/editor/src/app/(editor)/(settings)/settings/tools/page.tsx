import { auth, signIn } from "@/auth";
import { readSettings } from "@/settings";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { SettingsCard } from "../../SettingsCard";
import { SettingsForm } from "../SettingsForm";

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
        </div>
      </PageSection>
    </PageMain>
  );
}
