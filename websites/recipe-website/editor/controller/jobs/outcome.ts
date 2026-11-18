/**
 * A job that ended `done` but read nothing (47h): an inspect whose page
 * answered 402 or 404, or held no recipe. The stored status stays `done` —
 * the job ran to its end, and every record on disk, the API, the CLI and MCP
 * `job_list` / `job_get` keep their statuses — and the readers add an
 * `outcome` saying what it read, derived from the record's result, so jobs
 * written before 47h read the same way.
 *
 * Dependency-free: `/jobs`, the job page and the curator's tool rows run it
 * in the browser.
 */

export interface JobOutcome {
  /** Ran to its end and read nothing worth having. */
  kind: "nothing";
  /** "simplyrecipes.com answered HTTP 402: nothing was read." */
  note: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hostOf(url: unknown): string | undefined {
  if (typeof url !== "string") return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

/** The words a person knows for the statuses a read-nothing page answers. */
const STATUS_WORDS: Record<number, string> = {
  401: "sign-in required",
  402: "payment required",
  403: "forbidden",
  404: "not found",
  410: "gone",
  429: "too many requests",
  451: "unavailable for legal reasons",
};

/** "HTTP 404 (not found)". */
export function httpStatusText(status: number): string {
  const words = STATUS_WORDS[status];
  return words ? `HTTP ${status} (${words})` : `HTTP ${status}`;
}

/**
 * What a page read's result says it read nothing, or `undefined` when it
 * read something. The shape is `inspectUrl`'s (`InspectResult`): an HTTP
 * `status` outside 2xx, or no `recipe`, no `draft` and no `recipes`.
 * Anything without a page read's shape (`url` plus `partial`) is not judged.
 */
export function readNothingNote(result: unknown): string | undefined {
  if (!isObject(result)) return undefined;
  if (typeof result.url !== "string" || !("partial" in result)) {
    return undefined;
  }
  const host = hostOf(result.finalUrl) ?? hostOf(result.url) ?? "The page";
  const { status } = result;
  if (typeof status === "number" && (status < 200 || status >= 300)) {
    return `${host} answered ${httpStatusText(status)}: nothing was read.`;
  }
  const recipes = Array.isArray(result.recipes) ? result.recipes : [];
  if (!result.recipe && !result.draft && recipes.length === 0) {
    return `No recipe on the page at ${host}: nothing was read.`;
  }
  return undefined;
}

/** The kinds whose result is a page read (`inspectUrl`). */
const PAGE_READ_KINDS: ReadonlySet<string> = new Set(["inspect"]);

/**
 * A finished job's outcome, when it is not plainly "it worked": only a
 * `done` page read that read nothing has one. Any other job — and any job
 * still live, failed or cancelled, whose status already says it — has none.
 */
export function jobOutcome(meta: {
  kind: string;
  status: string;
  result?: unknown;
}): JobOutcome | undefined {
  if (meta.status !== "done" || !PAGE_READ_KINDS.has(meta.kind)) {
    return undefined;
  }
  const note = readNothingNote(meta.result);
  return note ? { kind: "nothing", note } : undefined;
}

/**
 * The same judgement over a tool's result as the curator's model was sent
 * it (44b): compact JSON, perhaps cut at the result cap (44c) and wrapped as
 * untrusted page text (E7). The whole JSON when it parses; else the start of
 * an inspect's answer, whose first keys are `url`, `finalUrl`, `status`
 * and `partial` — and then only a non-2xx status reads as nothing.
 */
export function readNothingInToolResult(content: string): string | undefined {
  const start = content.indexOf("{");
  if (start < 0) return undefined;
  const end = content.lastIndexOf("}");
  if (end > start) {
    try {
      return readNothingNote(JSON.parse(content.slice(start, end + 1)));
    } catch {
      /* Cut: read its start below. */
    }
  }
  const head =
    /^\{"url":("(?:[^"\\]|\\.)*"),"finalUrl":("(?:[^"\\]|\\.)*"),"status":(\d{3}),"partial":(true|false)/.exec(
      content.slice(start),
    );
  if (!head) return undefined;
  const parse = (text: string) => {
    try {
      return JSON.parse(text) as string;
    } catch {
      return undefined;
    }
  };
  /*
   * Cut, only the status is judged: a 2xx answer long enough to be cut read
   * something — and the local model's view of an inspect (`localResult`)
   * drops `recipe` and leads with `draft`, so "no recipe key next" says
   * nothing about it (47h review).
   */
  const status = Number(head[3]);
  if (status >= 200 && status < 300) return undefined;
  return readNothingNote({
    url: parse(head[1]),
    finalUrl: parse(head[2]),
    status,
    partial: head[4] === "true",
  });
}
