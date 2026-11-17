"use server";

/**
 * "Edit with AI" on the edit page (47i): start an `edit` job over the
 * form's values as they are — a typed request, or "Suggest step uses" —
 * and answer its id at once (the box's live panel follows it, as the fill's
 * does); or, for a job with no record (38-Tb5), its outcome through a
 * bounded long-poll. Signed in, as every editor action; nothing is written
 * (the form's Save is the write).
 */
import { z } from "zod";
import { authenticateUser } from "recipe-editor/controller/actions/shared";
import { startSpec } from "recipe-editor/controller/jobs/kinds";
import {
  keepUnstored,
  waitUnstored,
} from "recipe-editor/controller/jobs/unstored";
import { EditValuesSchema } from "recipe-editor/controller/llm/editCheck";
import {
  editModelFor,
  isEditResult,
  usesModelFor,
  type EditBackend,
  type EditResult,
} from "recipe-editor/controller/llm/askEdit";
import { EDIT_REQUEST_MAX } from "recipe-website-common/util/editRequest";

export interface EditStartState {
  job?: string;
  /** False: the job has no record (38-Tb5) — ask `editResultAction`. */
  stored?: boolean;
  /** Who was asked, for the panel's "Asking …". */
  model?: string;
  message?: string;
}

export interface EditOutcome {
  pending?: true;
  result?: EditResult;
  message?: string;
  cancelled?: true;
}

const StartSchema = z.strictObject({
  task: z.enum(["request", "uses"]),
  request: z.string().max(EDIT_REQUEST_MAX).optional(),
  values: EditValuesSchema,
  claude: z.boolean().optional(),
});

/** Start a request (or the uses reading) over the form's values. */
export async function editStartAction(
  slug: string,
  input: unknown,
): Promise<EditStartState> {
  const email = await authenticateUser();
  if (!email) return { message: "Sign in to ask the model." };
  if (typeof slug !== "string" || !slug) return { message: "No recipe." };
  const parsed = StartSchema.safeParse(input);
  if (!parsed.success) {
    return { message: "That request or those values can't be read." };
  }
  const { task, request, values, claude } = parsed.data;
  if (task === "request" && !request?.trim()) {
    return { message: "Type what should change first." };
  }
  /* Who is asked is settled here, so the job takes the GPU's line only
   * for a local model (`jobResources`). */
  let backend: EditBackend;
  if (task === "request") {
    const chosen = editModelFor(claude ? "claude" : undefined);
    if ("problem" in chosen) {
      return { message: `Nothing was asked: ${chosen.problem}.` };
    }
    backend = chosen.backend;
  } else {
    const chosen = usesModelFor();
    if ("problem" in chosen) {
      return { message: `Nothing was asked: ${chosen.problem}.` };
    }
    backend = chosen.config.api === "anthropic" ? "claude" : "local";
  }
  try {
    const { job, stored, done } = await startSpec({
      kind: "edit",
      slug,
      task,
      ...(task === "request" ? { request: request!.trim() } : {}),
      recipe: values,
      backend,
    });
    keepUnstored(job, done);
    return { job, ...(stored ? {} : { stored: false }) };
  } catch (error) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
}

/** A recordless edit's outcome (39a's long-poll, as `fillResultAction`). */
export async function editResultAction(job: string): Promise<EditOutcome> {
  if (!(await authenticateUser())) {
    return { message: "Sign in to ask the model." };
  }
  const answer =
    typeof job === "string"
      ? await waitUnstored<EditResult & { job: string }>(job)
      : ({ status: "missing" } as const);
  switch (answer.status) {
    case "missing":
      return {
        message: `Request ${String(job)} is not running in this editor any more — ask again.`,
      };
    case "pending":
      return { pending: true };
    case "done":
      return isEditResult(answer.value)
        ? { result: answer.value }
        : { message: "That job isn't a request for this recipe." };
    default: {
      const { error } = answer;
      const cancelled =
        !!error &&
        typeof error === "object" &&
        (error as { code?: unknown }).code === "cancelled";
      return {
        message: error instanceof Error ? error.message : String(error),
        ...(cancelled ? { cancelled: true as const } : {}),
      };
    }
  }
}
