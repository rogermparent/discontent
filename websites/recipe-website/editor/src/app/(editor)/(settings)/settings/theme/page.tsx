import { auth, signIn } from "@/auth";
import { readSettings } from "@/settings";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { ThemeEditor } from "../ThemeEditor";

export default async function ThemePage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/settings/theme` });
  }
  const settings = await readSettings();
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Appearance</PageHeading>
        <div className="mx-2 my-4">
          <ThemeEditor theme={settings.theme} presets={settings.presets} />
        </div>
      </PageSection>
    </PageMain>
  );
}
