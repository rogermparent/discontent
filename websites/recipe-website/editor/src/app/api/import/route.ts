/**
 * `/api/import` — fetch a recipe from a URL, cite it, and (optionally) keep it.
 *
 * The same `importAndCreate` the CLI's `recipes import` runs, so the citation
 * (`source`), the image download and the markdown conversion are identical
 * whichever way a recipe arrives.
 *
 * `dryRun` writes nothing and answers 200 with the shaped recipe; a real import
 * answers 201 like any other create. That difference is the point of the flag:
 * the curator inspects a candidate before deciding, and a dry run must not look
 * like a write in any status code, log line or cache tag.
 *
 * `llm` (36b) is the local model's mode — `auto` (default), `force`, `off` —
 * and a result the model touched carries `llm`. A model call can take most of
 * a minute (the first one loads the model).
 *
 * `{text, source?}` in place of `{url}` (36c, D8) is a pasted recipe — a
 * YouTube description, an email — read by the local model (`importFromText`);
 * `source` is cited and never fetched. The body is `ImportRequestSchema`,
 * shared with the MCP `recipe_import` tool.
 *
 * A video or paste holding several recipes (36e) answers `ImportBatchResult`
 * (`batch: true`); `pick` / `all` say which to create, and a create with
 * neither is `usage` (400) naming them.
 *
 * Photos of a recipe (38e) come as `multipart/form-data` (`readPhotoRequest`):
 * stored in the job store, transcribed by the vision model, then read as
 * pasted text is. With no vision model configured that is `usage`.
 */
import { requireCurationContext } from "recipe-editor/controller/apiContext";
import {
  errorResponse,
  readJsonBody,
} from "recipe-editor/controller/curation/http";
import { corpusOf, runSpec } from "recipe-editor/controller/jobs/kinds";
import {
  ImportRequestSchema,
  importTarget,
  type ImportTarget,
} from "recipe-editor/controller/curation/importRequest";
import { jobsDirectory } from "recipe-editor/controller/jobs/location";
import { ValidationError } from "recipe-editor/controller/curation/errors";
import { parseInput } from "recipe-editor/controller/curation/schema";

/**
 * A photo import (38e): `multipart/form-data` with one `photo` part per
 * photo, in page order, and an optional `request` part holding the rest of
 * the body as JSON (`tags`, `dryRun`, `pick`, `photoAsImage`, `source`, …).
 * Checked by the same schema as a JSON body, the photos counted as `photos`.
 */
async function readPhotoRequest(
  request: Request,
): Promise<{ files: File[]; target: ImportTarget }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    throw new ValidationError(
      `Could not read the upload: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const files = form
    .getAll("photo")
    .filter((part): part is File => part instanceof File);
  if (files.length === 0) {
    throw new ValidationError(
      "Expected one or more `photo` parts in the upload.",
    );
  }
  const raw = form.get("request");
  let body: unknown = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ValidationError("The `request` part is not JSON.");
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("The `request` part must be a JSON object.");
  }
  if ("photos" in body) {
    throw new ValidationError(
      "The photos are the `photo` parts; the `request` part names no `photos`.",
    );
  }
  const target = importTarget(
    parseInput(ImportRequestSchema, {
      ...body,
      photos: files.map((file, index) => file.name || `photo-${index + 1}`),
    }),
  );
  return { files, target };
}

export async function POST(request: Request) {
  try {
    const ctx = await requireCurationContext(request);
    const multipart = (request.headers.get("content-type") ?? "").startsWith(
      "multipart/form-data",
    );
    const upload = multipart ? await readPhotoRequest(request) : undefined;
    const target =
      upload?.target ??
      importTarget(
        parseInput(ImportRequestSchema, await readJsonBody(request)),
      );
    /* A job (epic 37): the answer is the same, plus its `job` id. */
    let result;
    if (target.kind === "photos") {
      /* A JSON body's `photos` would be paths on this server: refused. */
      if (!upload) {
        throw new ValidationError(
          "`photos` are local paths, for the MCP tool: post the photos themselves as multipart `photo` parts.",
        );
      }
      const { assertPhotoImport } =
        await import("recipe-editor/controller/llm/vision");
      assertPhotoImport();
      const { storePhotos } =
        await import("recipe-editor/controller/jobs/photos");
      const photos = await storePhotos(jobsDirectory(), upload.files);
      result = await runSpec(
        {
          kind: "import-photo",
          ...corpusOf(ctx),
          photos,
          ...(target.source ? { source: target.source } : {}),
          options: target.options,
        },
        { ctx },
      );
    } else if (target.kind === "text") {
      result = await runSpec(
        {
          kind: "import-text",
          ...corpusOf(ctx),
          text: target.text,
          ...(target.source ? { source: target.source } : {}),
          options: target.options,
        },
        { ctx },
      );
    } else {
      if (!URL.canParse(target.url)) {
        throw new ValidationError(`"${target.url}" is not a URL`);
      }
      result = await runSpec(
        {
          kind: "import-url",
          ...corpusOf(ctx),
          url: target.url,
          options: target.options,
        },
        { ctx },
      );
    }
    return Response.json(result, {
      status: "dryRun" in result && result.dryRun ? 200 : 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
