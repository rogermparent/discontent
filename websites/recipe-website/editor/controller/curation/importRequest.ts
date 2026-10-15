/**
 * The body of an import request — `/api/import` and the MCP `recipe_import`
 * tool — as one schema, so the two cannot drift.
 *
 * Exactly one of `url` (a page or video to fetch) or `text` (a pasted recipe
 * the local model reads, epic 36 D8). `source` is the pasted text's URL, cited
 * and never fetched, so it goes only with `text`; `llm` picks the model's part
 * in a URL import and means nothing for text, which always uses the model.
 *
 * Only `zod` and the mode names are imported: the MCP server builds its
 * schemas at startup and must not load the model client (35q).
 */
import { z } from "zod";
import { LLM_MODES } from "../llm/mode";

/**
 * The most text a paste may carry. The extractor caps what the model reads
 * at `PAGE_TEXT_MAX_CHARS` (24k) by dropping the middle, the same as a page;
 * this only refuses a paste that is plainly not one recipe.
 */
export const PASTED_TEXT_MAX_CHARS = 100_000;

export const ImportRequestFields = z.strictObject({
  url: z.string().min(1, "An import needs a url").optional(),
  text: z
    .string()
    .min(1, "An import needs text")
    .max(PASTED_TEXT_MAX_CHARS)
    .optional(),
  source: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  slug: z.string().optional(),
  name: z.string().optional(),
  image: z.string().min(1).optional(),
  dryRun: z.boolean().optional(),
  overwrite: z.boolean().optional(),
  allowPartial: z.boolean().optional(),
  llm: z.enum(LLM_MODES).optional(),
});

type ImportRequestInput = z.infer<typeof ImportRequestFields>;

export function checkImportRequest(
  data: ImportRequestInput,
  ctx: z.RefinementCtx,
): void {
  if (Boolean(data.url) === Boolean(data.text)) {
    ctx.addIssue({
      code: "custom",
      path: ["url"],
      message: "Give exactly one of `url` or `text`",
    });
  }
  if (data.source && !data.text) {
    ctx.addIssue({
      code: "custom",
      path: ["source"],
      message: "`source` is a pasted text's URL: it goes with `text`",
    });
  }
  if (data.llm && data.text) {
    ctx.addIssue({
      code: "custom",
      path: ["llm"],
      message: "`llm` is for a URL import: `text` always uses the local model",
    });
  }
}

export const ImportRequestSchema =
  ImportRequestFields.superRefine(checkImportRequest);

export type ImportRequest = z.infer<typeof ImportRequestSchema>;

type WriteOptions = Omit<ImportRequest, "url" | "text" | "source" | "llm">;

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
    };

export function importTarget({
  url,
  text,
  source,
  llm,
  ...options
}: ImportRequest): ImportTarget {
  if (text !== undefined) {
    return { kind: "text", text, ...(source ? { source } : {}), options };
  }
  return {
    kind: "url",
    url: url as string,
    options: { ...options, ...(llm ? { llm } : {}) },
  };
}
