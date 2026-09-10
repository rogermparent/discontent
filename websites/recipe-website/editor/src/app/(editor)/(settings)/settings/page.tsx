import { auth, signIn } from "@/auth";
import { readSettings } from "@/settings";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { SiteDetailsForm } from "./SiteDetailsForm";

export default async function SettingsPage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: `/settings`,
    });
  }
  const settings = await readSettings();
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Site details</PageHeading>
        <SiteDetailsForm settings={settings} />
      </PageSection>
    </PageMain>
  );
}
