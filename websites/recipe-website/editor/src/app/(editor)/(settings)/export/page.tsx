import { auth, signIn } from "@/auth";
import { readSettings } from "@/settings";
import { Exporters } from "./exporter";
import { ShareInventoryForm } from "./ShareInventoryForm";
import { exportUnavailableReason } from "./availability";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";

export default async function SettingsPage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: `/export`,
    });
  }
  const [unavailable, settings] = await Promise.all([
    exportUnavailableReason(),
    readSettings(),
  ]);
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Export</PageHeading>
        {!unavailable ? (
          <>
            <ShareInventoryForm
              enabled={settings.shareInventoryOnExport === true}
            />
            <Exporters />
          </>
        ) : (
          <p
            className="p-2 text-muted-foreground"
            data-testid="export-unavailable"
          >
            {unavailable}
          </p>
        )}
      </PageSection>
    </PageMain>
  );
}
