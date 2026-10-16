import NewRecipeWorkspace from "./workspace";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import {
  readTagLabels,
  readTagVocabulary,
} from "recipe-website-common/controller/data/readTermPage";
import { startSpec } from "recipe-editor/controller/jobs/kinds";
import { jobsDirectory } from "recipe-editor/controller/jobs/location";
import { findJob } from "recipe-editor/controller/jobs/store";
import { llmConfig } from "recipe-editor/controller/llm/client";
import {
  PageMain,
  PageSection,
} from "recipe-website-common/components/PageLayout";
import type { RecipeActionState } from "./common";

/** The form kinds whose result fills this page (37c). */
const FORM_KINDS = new Set(["form-url", "form-text"]);

export default async function NewRecipe({
  searchParams,
}: {
  searchParams: Promise<{ import?: string; job?: string }>;
}) {
  const { import: importURL, job: jobParam } = await searchParams;
  const user = await auth();
  if (!user) {
    return signIn(undefined, {
      redirectTo: jobParam
        ? `/new-recipe?job=${encodeURIComponent(jobParam)}`
        : `/new-recipe`,
    });
  }

  /*
   * `?import=<url>` (the roundup picker's "Import it as one recipe"): a job,
   * as the form's own import is — started here, then followed at `?job=`,
   * so a reload follows the same job rather than starting another.
   */
  if (importURL && !jobParam) {
    const { job } = await startSpec({ kind: "form-url", url: importURL });
    redirect(`/new-recipe?job=${encodeURIComponent(job)}`);
  }

  /*
   * `?job=<id>` (37c, D7): reopen a form import — its result fills the form
   * (or the 36e picker) as it did when it ended; one still running is
   * followed by the progress panel.
   */
  let initialState: RecipeActionState | null = null;
  let initialJob: string | undefined;
  if (jobParam) {
    const meta = await findJob(jobsDirectory(), jobParam).catch(
      () => undefined,
    );
    if (meta && FORM_KINDS.has(meta.kind)) {
      initialJob = meta.id;
      const result = meta.result as RecipeActionState | undefined;
      if (result && typeof result === "object") {
        initialState = { ...result, job: meta.id };
      }
    } else {
      initialState = {
        message: meta
          ? `Job ${meta.id} is a ${meta.kind} job, not a form import: see /jobs/${meta.id}.`
          : `No import job "${jobParam}" — it may have been pruned.`,
      };
    }
  }
  const [allTags, vocabulary] = await Promise.all([
    readTagLabels(),
    readTagVocabulary(),
  ]);

  return (
    <PageMain>
      <PageSection maxWidth="xl" grow>
        {/* 35r: the roundup picker above the form; the single-URL import
            inside the form is unchanged, and waits while a run is in flight. */}
        <NewRecipeWorkspace
          initialState={initialState}
          initialJob={initialJob}
          allTags={allTags}
          terms={vocabulary.map(({ slug, label }) => ({ slug, label }))}
          llmModel={llmConfig()?.model}
        />
      </PageSection>
    </PageMain>
  );
}
