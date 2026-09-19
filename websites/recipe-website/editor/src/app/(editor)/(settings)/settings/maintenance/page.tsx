import { rebuildRecipeIndex } from "recipe-editor/controller/actions";
import { rebuildFeaturedRecipeIndex } from "recipe-editor/controller/actions/featuredRecipes";
import { rebuildGroupIndex } from "recipe-editor/controller/actions/groups";
import { rebuildTermIndex } from "recipe-editor/controller/actions/tagTerms";
import { auth, signIn } from "@/auth";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import {
  PageMain,
  PageSection,
  PageHeading,
} from "recipe-website-common/components/PageLayout";
import { SettingsCard } from "../../SettingsCard";

export default async function MaintenancePage() {
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: `/settings/maintenance` });
  }
  return (
    <PageMain>
      <PageSection maxWidth="4xl" grow>
        <PageHeading>Maintenance</PageHeading>
        <div className="space-y-6">
          <SettingsCard
            title="Search index"
            description="Rebuild the recipe indexes if listings drift out of sync with the content on disk."
          >
            <div className="flex flex-col gap-4">
              <form action={rebuildRecipeIndex}>
                <SubmitButton>Reload Recipe Database</SubmitButton>
              </form>
              <form action={rebuildFeaturedRecipeIndex}>
                <SubmitButton>Reload Featured Recipe Database</SubmitButton>
              </form>
              <form action={rebuildGroupIndex}>
                <SubmitButton>Reload Groups Database</SubmitButton>
              </form>
              {/*
                The `tag` vocabulary's term records (24c). Its own button rather
                than a line on one of the three above, because a term rebuild
                touches a different keyspace — and because it is the *only*
                server action term records have until 24e gives them seats.
              */}
              <form action={rebuildTermIndex}>
                <SubmitButton>Reload Term Database</SubmitButton>
              </form>
            </div>
          </SettingsCard>
        </div>
      </PageSection>
    </PageMain>
  );
}
