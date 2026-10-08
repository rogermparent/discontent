import { auth, signIn } from "@/auth";
import { readSettings } from "@/settings";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { isMirror } from "recipe-website-common/config/role";
import { MirrorSettingsNotice } from "../../MirrorSettingsNotice";
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
        {isMirror() ? (
          <>
            <MirrorSettingsNotice />
            {/* Shown as the workstation set it, but not editable here. */}
            <fieldset
              disabled
              inert
              className="mx-2 my-4 min-w-0 opacity-75"
              data-testid="theme-read-only"
            >
              <ThemeEditor theme={settings.theme} presets={settings.presets} />
            </fieldset>
          </>
        ) : (
          <div className="mx-2 my-4">
            <ThemeEditor theme={settings.theme} presets={settings.presets} />
          </div>
        )}
      </PageSection>
    </PageMain>
  );
}
