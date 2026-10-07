import { auth, signIn } from "@/auth";
import { Exporters } from "./exporter";
import { EXPORT_UNAVAILABLE_MESSAGE, isExportAvailable } from "./availability";
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
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Export</PageHeading>
        {(await isExportAvailable()) ? (
          <Exporters />
        ) : (
          <p
            className="p-2 text-muted-foreground"
            data-testid="export-unavailable"
          >
            {EXPORT_UNAVAILABLE_MESSAGE}
          </p>
        )}
      </PageSection>
    </PageMain>
  );
}
