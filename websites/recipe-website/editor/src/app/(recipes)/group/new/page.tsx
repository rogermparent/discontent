import NewGroupForm from "./form";
import { readTagPicker } from "recipe-website-common/controller/data/readTermPage";
import {
  groupPrefill,
  groupPrefillHref,
} from "recipe-website-common/controller/groupPrefill";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import { auth, redirectToLogin } from "@/auth";

type Param = string | string[] | undefined;

export default async function NewGroup({
  searchParams,
}: {
  searchParams: Promise<{
    recipe?: Param;
    name?: Param;
    tags?: Param;
    label?: Param;
  }>;
}) {
  const query = await searchParams;
  /*
   * `?recipe=` (a recipe page's "Group" button) and, since 48e, the
   * homepage's "Start a plan from the menu": a name, tags and a labelled
   * dish per course. Read back through `groupPrefill`, bounded and checked;
   * nothing is saved until the form is submitted.
   */
  const prefill = groupPrefill(query);

  const user = await auth();
  if (!user) {
    /*
     * The preselection has to survive the sign-in round trip, or the "Group"
     * button on a recipe page loses its whole point for a signed-out owner.
     */
    return redirectToLogin(prefill ? groupPrefillHref(prefill) : "/group/new");
  }

  const tagPicker = await readTagPicker();

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        <NewGroupForm prefill={prefill} tagPicker={tagPicker} />
      </PageSection>
    </PageMain>
  );
}
