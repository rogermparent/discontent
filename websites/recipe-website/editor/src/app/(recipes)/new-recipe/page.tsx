import NewRecipeWorkspace from "./workspace";
import { auth, signIn } from "@/auth";
import {
  readTagLabels,
  readTagVocabulary,
} from "recipe-website-common/controller/data/readTermPage";
import { jobsDirectory } from "recipe-editor/controller/jobs/location";
import { findJob } from "recipe-editor/controller/jobs/store";
import { llmConfig } from "recipe-editor/controller/llm/client";
import { visionConfig } from "recipe-editor/controller/llm/vision";
import { PageMain } from "recipe-website-common/components/PageLayout";
import type { RecipeActionState } from "./common";

/** The form kinds whose result fills this page (37c). */
const FORM_KINDS = new Set(["form-url", "form-text", "form-photo"]);

/**
 * One search param as a string: a repeated one (`?import=a&import=b`) is an
 * array, and is ignored rather than trimmed into a 500 (38b review).
 */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Where sign-in comes back to: the same `?job=` or `?import=`. */
function returnTo(job?: string, importURL?: string): string {
  if (job) return `/new-recipe?job=${encodeURIComponent(job)}`;
  if (importURL) return `/new-recipe?import=${encodeURIComponent(importURL)}`;
  return "/new-recipe";
}

export default async function NewRecipe({
  searchParams,
}: {
  searchParams: Promise<{
    import?: string | string[];
    job?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const importURL = single(params.import);
  const jobParam = single(params.job);
  const user = await auth();
  if (!user) {
    return signIn(undefined, { redirectTo: returnTo(jobParam, importURL) });
  }

  /*
   * `?import=<url>` (the roundup picker's "Import it as one recipe", a
   * bookmarklet, a link): the URL field filled in, and nothing more — the
   * Import button starts the job (38b, D3). A GET never starts work, so a
   * reload, a restored tab, a history replay or a prefetch fetches nothing.
   */
  const initialImportUrl =
    importURL && !jobParam ? importURL.trim() || undefined : undefined;

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
      {/* 43e1: Start from (the roundup picker one of its ways in), then the
          recipe form, in the section rail's frame. */}
      <NewRecipeWorkspace
        initialState={initialState}
        initialJob={initialJob}
        initialImportUrl={initialImportUrl}
        allTags={allTags}
        terms={vocabulary.map(({ slug, label }) => ({ slug, label }))}
        llmModel={llmConfig()?.model}
        visionModel={visionConfig()?.model}
      />
    </PageMain>
  );
}
