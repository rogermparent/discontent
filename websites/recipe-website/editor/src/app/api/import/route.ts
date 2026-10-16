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
 * pasted text is. With no vision model configured that is `usage`, and an
 * upload over `MAX_UPLOAD_BYTES` is a 413 — both before the body is read.
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
import {
  ValidationError,
  toErrorObject,
} from "recipe-editor/controller/curation/errors";
import { MAX_IMAGE_BYTES } from "recipe-editor/controller/imageImport";
import { MAX_PHOTOS } from "recipe-editor/controller/photoLimits";
import { parseInput } from "recipe-editor/controller/curation/schema";

/** Room in an upload for the parts' headers and the `request` part. */
const UPLOAD_OVERHEAD_BYTES = 1024 * 1024;

/** The largest photo upload read: four photos at the 15 MB cap, and the rest. */
const MAX_UPLOAD_BYTES = MAX_PHOTOS * MAX_IMAGE_BYTES + UPLOAD_OVERHEAD_BYTES;

/**
 * An upload too large to read, before it is read (38e review): no
 * `content-length` (a chunked body of unknown size) is refused as a
 * `validation` 400, one over `MAX_UPLOAD_BYTES` as a 413 — `formData()`
 * would otherwise buffer all of it before a check ran.
 */
function uploadTooLarge(request: Request): Response | undefined {
  const raw = request.headers.get("content-length");
  const length = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(length) || length < 0) {
    return Response.json(
      toErrorObject(
        new ValidationError(
          "A photo upload needs a Content-Length header: send the photos as one multipart body of known size.",
        ),
      ),
      { status: 400 },
    );
  }
  if (length > MAX_UPLOAD_BYTES) {
    return Response.json(
      toErrorObject(
        new ValidationError(
          `The upload is ${length} bytes, over the ${MAX_UPLOAD_BYTES}-byte cap (${MAX_PHOTOS} photos of at most ${MAX_IMAGE_BYTES} bytes each).`,
        ),
      ),
      { status: 413 },
    );
  }
  return undefined;
}

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
    let upload: Awaited<ReturnType<typeof readPhotoRequest>> | undefined;
    if (multipart) {
      /* Before a byte of the body is read (38e review): photo import is on,
       * and the upload is of a size worth reading. */
      const { assertPhotoImport } =
        await import("recipe-editor/controller/llm/vision");
      assertPhotoImport();
      const refused = uploadTooLarge(request);
      if (refused) return refused;
      upload = await readPhotoRequest(request);
    }
    const target =
      upload?.target ??
      importTarget(
        parseInput(ImportRequestSchema, await readJsonBody(request)),
      );
    /* A job (epic 37): the answer is the same, plus its `job` id. */
    let result;
    if (target.kind === "photos") {
      /*
       * A JSON body's `photos` are refused: this route's photos are the
       * upload's parts, and a path here would name a file on the editor's
       * host that the caller never sent. Paths are the MCP tool's
       * (`recipe_import`, De6), read by the process serving it — over
       * MCP-over-HTTP that is this host too, as `recipe_set_image`'s
       * `path` already is, limited to image files: a token holder's reach
       * the tool shares, not one this route adds.
       */
      if (!upload) {
        throw new ValidationError(
          "`photos` are local paths, for the MCP tool: post the photos themselves as multipart `photo` parts.",
        );
      }
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
