import { auth, signIn } from "@/auth";
import { readSettings } from "@/settings";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { isMirror } from "recipe-website-common/config/role";
import { MirrorSettingsNotice } from "../MirrorSettingsNotice";
import { SiteDetailsForm } from "./SiteDetailsForm";

export default async function SettingsPage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: `/settings`,
    });
  }
  const settings = await readSettings();
  const mirror = isMirror();
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Site details</PageHeading>
        {mirror && <MirrorSettingsNotice />}
        <SiteDetailsForm settings={settings} readOnly={mirror} />
      </PageSection>
    </PageMain>
  );
}
