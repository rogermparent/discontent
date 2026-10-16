/**
 * The body of an import request — `/api/import` and the MCP `recipe_import`
 * tool — as one schema, so the two cannot drift.
 *
 * Exactly one of `url` (a page or video to fetch) or `text` (a pasted recipe
 * the local model reads, epic 36 D8). `source` is the pasted text's URL, cited
 * and never fetched, so it goes only with `text`; `llm` picks the model's part
 * in a URL import and means nothing for text, which always uses the model.
 * `pick` / `all` (36e) choose among several recipes in one video or paste.
 *
 * `photos` (38e) is the third source: local image paths, read by the MCP
 * server's process — `/api/import` refuses them in a JSON body (a request
 * must not name the server's files) and takes the photos themselves as
 * multipart parts instead. `source` goes with `text` or `photos`;
 * `photoAsImage` only with photos.
 *
 * Only `zod` and the mode names are imported: the MCP server builds its
 * schemas at startup and must not load the model client (35q).
 */
import { z } from "zod";
import { LLM_MODES } from "../llm/mode";
import { MAX_PHOTOS } from "../photoLimits";

/**
 * The most text a paste may carry. The extractor caps what the model reads
 * at `PAGE_TEXT_MAX_CHARS` (24k) by dropping the middle, the same as a page;
 * this only refuses a paste that is plainly not one recipe.
 */
export const PASTED_TEXT_MAX_CHARS = 100_000;

/** Line endings as the model reads them: the length limit counts this. */
export function normalisePastedText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export const ImportRequestFields = z.strictObject({
  url: z.string().min(1, "An import needs a url").optional(),
  /* The limit counts the text with CRLF normalised, as `readPastedText`
   * does, so the HTTP and local paths agree (a refine, not a transform: the
   * MCP SDK turns this schema into JSON Schema). */
  text: z
    .string()
    .min(1, "An import needs text")
    .refine(
      (text) => normalisePastedText(text).length <= PASTED_TEXT_MAX_CHARS,
      `A pasted recipe can be at most ${PASTED_TEXT_MAX_CHARS} characters`,
    )
    .optional(),
  /* 38e: local photo paths (MCP), the pages of one recipe in order. */
  photos: z
    .array(z.string().min(1))
    .min(1, "photos names no photo")
    .max(MAX_PHOTOS, `A photo import takes at most ${MAX_PHOTOS} photos`)
    .optional(),
  /* 38e: the first photo becomes each created recipe's image. */
  photoAsImage: z.boolean().optional(),
  source: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  slug: z.string().optional(),
  name: z.string().optional(),
  image: z.string().min(1).optional(),
  dryRun: z.boolean().optional(),
  overwrite: z.boolean().optional(),
  allowPartial: z.boolean().optional(),
  llm: z.enum(LLM_MODES).optional(),
  /*
   * 36e: a video or a paste holding several recipes — which to import, by
   * 1-based position, or all of them. With neither, a create is `usage`.
   */
  pick: z
    .array(
      z.union([
        z.number().int().min(1).max(100),
        z.string().trim().min(1).max(200),
      ]),
    )
    .min(1)
    .max(100)
    .optional(),
  all: z.boolean().optional(),
  /* 36e review: read a video or paste as one recipe, never split. */
  asOne: z.boolean().optional(),
});

type ImportRequestInput = z.infer<typeof ImportRequestFields>;

export function checkImportRequest(
  data: ImportRequestInput,
  ctx: z.RefinementCtx,
): void {
  if ([data.url, data.text, data.photos].filter(Boolean).length !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["url"],
      message: "Give exactly one of `url`, `text` or `photos`",
    });
  }
  if (data.source && !data.text && !data.photos) {
    ctx.addIssue({
      code: "custom",
      path: ["source"],
      message:
        "`source` is a pasted text's (or a photo's) URL: it goes with `text` or `photos`",
    });
  }
  if (data.photoAsImage && !data.photos) {
    ctx.addIssue({
      code: "custom",
      path: ["photoAsImage"],
      message: "`photoAsImage` goes with `photos`",
    });
  }
  if (data.photoAsImage && data.image) {
    ctx.addIssue({
      code: "custom",
      path: ["photoAsImage"],
      message: "`photoAsImage` or `image`, not both: the recipe has one image",
    });
  }
  if (data.pick && data.all) {
    ctx.addIssue({
      code: "custom",
      path: ["pick"],
      message: "Give `pick` or `all`, not both",
    });
  }
  if (data.asOne && (data.pick || data.all)) {
    ctx.addIssue({
      code: "custom",
      path: ["asOne"],
      message: "`asOne` reads the text as one recipe: no `pick` or `all`",
    });
  }
  if (data.llm && (data.text || data.photos)) {
    ctx.addIssue({
      code: "custom",
      path: ["llm"],
      message:
        "`llm` is for a URL import: `text` and `photos` always use the local model",
    });
  }
}

export const ImportRequestSchema =
  ImportRequestFields.superRefine(checkImportRequest);

export type ImportRequest = z.infer<typeof ImportRequestSchema>;

type WriteOptions = Omit<
  ImportRequest,
  "url" | "text" | "source" | "llm" | "photos" | "photoAsImage"
>;

/** A checked request as the seat it goes to. */
export type ImportTarget =
  | {
      kind: "url";
      url: string;
      options: WriteOptions & Pick<ImportRequest, "llm">;
    }
  | {
      kind: "text";
      text: string;
      source?: string;
      options: WriteOptions;
    }
  | {
      kind: "photos";
      /** Local paths, read by the caller's process. */
      photos: string[];
      source?: string;
      options: WriteOptions & Pick<ImportRequest, "photoAsImage">;
    };

export function importTarget({
  url,
  text,
  source,
  llm,
  photos,
  photoAsImage,
  ...options
}: ImportRequest): ImportTarget {
  if (photos !== undefined) {
    return {
      kind: "photos",
      photos,
      ...(source ? { source } : {}),
      options: { ...options, ...(photoAsImage ? { photoAsImage } : {}) },
    };
  }
  if (text !== undefined) {
    return { kind: "text", text, ...(source ? { source } : {}), options };
  }
  return {
    kind: "url",
    url: url as string,
    options: { ...options, ...(llm ? { llm } : {}) },
  };
}
