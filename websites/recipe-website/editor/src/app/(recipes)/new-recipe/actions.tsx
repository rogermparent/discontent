"use server";

import { startSpec, type JobSpec } from "recipe-editor/controller/jobs/kinds";
import {
  keepUnstored,
  takeUnstored,
} from "recipe-editor/controller/jobs/unstored";
import { authenticateUser } from "recipe-editor/controller/actions/shared";
import type { RecipeActionState } from "recipe-editor/controller/formImport";

/**
 * What the form's Import answers (37c, D7): the job it started, at once, or
 * why it started none. The form's progress panel polls the job
 * (`GET /api/jobs/<id>`) and fills the form from its result.
 */
export interface ImportStartState {
  job?: string;
  /**
   * False when the job runs with no record (39a, 38-Tb5: the jobs
   * directory cannot be written): its id answers 404, so the form follows
   * nothing and asks `importResultAction` for the outcome instead.
   */
  stored?: boolean;
  message?: string;
  /** Tells two starts apart, even with the same answer. */
  at?: number;
}

/** What `importResultAction` answers: the filled state, or why there is none. */
export interface ImportResultState {
  result?: RecipeActionState;
  message?: string;
}

/**
 * Start a form import (`form-url`, `form-text`, `form-photo`): its id, and
 * — when the job has no record (38-Tb5) — its outcome kept for
 * `importResultAction`, the work going on in this process either way.
 */
async function startFormImport(
  spec: Extract<JobSpec, { kind: "form-url" | "form-text" | "form-photo" }>,
  at: number,
): Promise<ImportStartState> {
  const { job, stored, done } = await startSpec(spec);
  if (stored) return { job, at };
  keepUnstored(job, done);
  return { job, stored: false, at };
}

/**
 * The outcome of a form import that runs with no record (39a, 38-Tb5):
 * awaited here, as the roundup picker's start actions await theirs. A job
 * this process does not hold (another instance, an outcome already taken,
 * or one forgotten after half an hour) answers a message.
 */
export async function importResultAction(
  job: string,
): Promise<ImportResultState> {
  if (!(await authenticateUser())) {
    return { message: "Sign in to import." };
  }
  const done =
    typeof job === "string"
      ? takeUnstored<RecipeActionState & { job: string }>(job)
      : undefined;
  if (!done) {
    return {
      message: `Import ${job} is not running in this editor any more — import it again.`,
    };
  }
  try {
    const { job: _job, ...result } = await done;
    void _job;
    return { result };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The form's import, as a job (epic 37): the same reducers as before
 * (`controller/formImport.ts`), now **enqueued** — the action answers the
 * job's id as soon as its record exists, and the work goes on in the
 * editor. A failure is the job's (`failed`, with the state as its result);
 * a cancel is the panel's.
 */
export async function importRecipeAction(
  _previousState: ImportStartState | null,
  formData: FormData,
): Promise<ImportStartState> {
  const at = Date.now();
  if (!(await authenticateUser())) {
    return { message: "Sign in to import.", at };
  }
  /*
   * Photo mode (38e): the photos are checked and stored in the job store
   * here, before the job starts — the spec names them there, never their
   * bytes — then the vision model transcribes them and the local model
   * reads the transcription.
   */
  if (formData.get("importMode") === "photo") {
    const files = formData
      .getAll("importPhotos")
      .filter((part): part is File => part instanceof File && part.size > 0);
    try {
      const { assertPhotoImport } =
        await import("recipe-editor/controller/llm/vision");
      assertPhotoImport();
      const { storePhotos } =
        await import("recipe-editor/controller/jobs/photos");
      const { jobsDirectory } =
        await import("recipe-editor/controller/jobs/location");
      const photos = await storePhotos(jobsDirectory(), files);
      return await startFormImport({ kind: "form-photo", photos }, at);
    } catch (error) {
      return {
        message: error instanceof Error ? error.message : String(error),
        at,
      };
    }
  }
  /* Pasted text (36c; since 36d the "No link? Paste the recipe text
   * instead" fallback): the local model reads the text. */
  if (formData.get("importMode") === "text") {
    const text = formData.get("importText");
    const source = formData.get("importSource");
    if (typeof text !== "string" || !text.trim()) {
      return { message: "No text provided", at };
    }
    return startFormImport(
      {
        kind: "form-text",
        text,
        ...(typeof source === "string" && source ? { source } : {}),
      },
      at,
    );
  }
  const url = formData.get("import");
  /* The "Re-read with AI even if the page has recipe data" box (36b,
   * reworded in 36d; not shown for a video): checked is `force`, else
   * `auto`. */
  const mode = formData.get("llm") === "force" ? "force" : "auto";
  if (typeof url !== "string" || !url) {
    return { message: "No URL provided", at };
  }
  return startFormImport({ kind: "form-url", url, llm: mode }, at);
}
