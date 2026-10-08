import { auth, signIn } from "@/auth";
import { Exporters } from "./exporter";
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
  const unavailable = await exportUnavailableReason();
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Export</PageHeading>
        {!unavailable ? (
          <Exporters />
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
