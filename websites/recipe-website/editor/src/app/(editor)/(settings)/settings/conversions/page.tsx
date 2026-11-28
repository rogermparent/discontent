import { auth, redirectToLogin } from "@/auth";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { curationContextFor } from "recipe-editor/controller/apiContext";
import {
  gramsBankRows,
  readGramsBank,
} from "recipe-editor/controller/curation/conversions";
import { SettingsCard } from "../../SettingsCard";
import { ConversionsEditor } from "./ConversionsEditor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Conversions" };

/**
 * Settings › Conversions (51f): the gram bank — grams in one US cup of
 * each ingredient, King Arthur's chart built in, the person's own over it.
 * The edit page's "Add grams", the recipe page's "Show grams" and the
 * shopping list's totals all read it. Its own page in Settings, so a
 * change here touches no other settings page.
 */
export default async function ConversionsPage() {
  const user = await auth();
  const email = user?.user?.email;
  if (!email) return redirectToLogin("/settings/conversions");
  const entries = await readGramsBank(curationContextFor(email));
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Conversions</PageHeading>
        <SettingsCard
          title="Grams in a cup"
          description="What a US cup of each ingredient weighs: King Arthur Baking's ingredient weight chart is built in, and your values go over it. Add grams on the edit page, Show grams on a recipe and the shopping list's totals all read it. Each change is one commit to conversions/grams.json."
        >
          <ConversionsEditor initialRows={gramsBankRows(entries)} />
        </SettingsCard>
      </PageSection>
    </PageMain>
  );
}
