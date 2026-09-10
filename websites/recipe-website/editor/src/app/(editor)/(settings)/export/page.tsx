import { auth, signIn } from "@/auth";
import { Exporters } from "./exporter";
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
        <Exporters />
      </PageSection>
    </PageMain>
  );
}
