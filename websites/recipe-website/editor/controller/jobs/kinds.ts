/**
 * What a job can be (epic 37): kind → handler, so every surface starts a
 * job the same way (`runSpec`) and a retry is the spec run again (37c).
 *
 * A spec is JSON and holds what the job needs and nothing secret: the URL
 * or the pasted text (the store is local and gitignored, and Retry needs
 * the text), the caller's options, and — for a job that reads or writes
 * the corpus — the content directory and the commit author. No token, no
 * environment: the model, yt-dlp and the pacing are the running process's.
 *
 * A handler is given the caller's `CurationContext` when there is one (an
 * API route's revalidates the editor's caches); without one — a retry —
 * it builds a plain one from the spec.
 *
 * The handlers load their seats lazily, as the CLI's local backend does
 * (35q): a process pays for the page parsers only when it runs a job.
 */
import type { CurationContext } from "../curation/context";
import type {
  ImportResult,
  ImportWriteOptions,
} from "../curation/importRecipe";
import type {
  ImportListOptions,
  ImportListResult,
  InspectListResult,
} from "../curation/importList";
import type { InspectResult } from "../curation/inspect";
import type { RecipeActionState } from "../formImport";
import type { LlmMode } from "../llm/mode";
import type { JobContext } from "./context";
import { runJob, type RunJobOptions } from "./run";
import type { JobError, JobTier } from "./store";

/** Where a corpus job reads and writes, and who it commits as. */
interface CorpusSpec {
  contentDirectory: string;
  author?: { name: string; email: string };
}

export type JobSpec =
  /** `recipes import <url>`, `/api/import {url}`, MCP `recipe_import`. */
  | (CorpusSpec & {
      kind: "import-url";
      url: string;
      options: ImportWriteOptions & { llm?: LlmMode };
    })
  /** `recipes import --text`, `/api/import {text}`, MCP `recipe_import`. */
  | (CorpusSpec & {
      kind: "import-text";
      text: string;
      source?: string;
      options: ImportWriteOptions;
    })
  /** `recipes inspect`, `/api/inspect`, MCP `page_inspect`. */
  | { kind: "inspect"; url: string; llm?: LlmMode }
  /** A roundup's list (34f): CLI, API, MCP, the form's picker. */
  | (CorpusSpec & { kind: "inspect-list"; url: string })
  /** `options` as the seat's schema parsed them (`ImportListOptionsSchema`). */
  | (CorpusSpec & {
      kind: "import-list";
      url: string;
      options: ImportListOptions;
    })
  /** The `/new-recipe` form's import: fills the form, writes nothing. */
  | { kind: "form-url"; url: string; llm?: LlmMode }
  | { kind: "form-text"; text: string; source?: string };

export type JobKind = JobSpec["kind"];

/** What each kind answers. */
export interface JobResults {
  "import-url": ImportResult;
  "import-text": ImportResult;
  inspect: InspectResult;
  "inspect-list": InspectListResult;
  "import-list": ImportListResult;
  "form-url": RecipeActionState;
  "form-text": RecipeActionState;
}

export type SpecOf<K extends JobKind> = Extract<JobSpec, { kind: K }>;

export interface JobEnv {
  /** The caller's context; a retry builds one from the spec. */
  ctx?: CurationContext;
  /** The job's log, signal, tier and id: what every seat takes as `job`. */
  job: JobContext;
}

type Handler<K extends JobKind> = (
  spec: SpecOf<K>,
  env: JobEnv,
) => Promise<JobResults[K]>;

function contextFor(spec: CorpusSpec, ctx?: CurationContext): CurationContext {
  return (
    ctx ?? {
      contentDirectory: spec.contentDirectory,
      ...(spec.author ? { author: spec.author } : {}),
    }
  );
}

export const JOB_HANDLERS: { [K in JobKind]: Handler<K> } = {
  async "import-url"(spec, { ctx, job }) {
    const { importAndCreate } = await import("../curation/importRecipe");
    return importAndCreate(contextFor(spec, ctx), spec.url, spec.options, job);
  },
  async "import-text"(spec, { ctx, job }) {
    const { importFromText } = await import("../curation/importRecipe");
    return importFromText(
      contextFor(spec, ctx),
      {
        text: spec.text,
        ...(spec.source ? { source: spec.source } : {}),
        ...spec.options,
      },
      job,
    );
  },
  async inspect(spec, { job }) {
    const { inspectUrl } = await import("../curation/inspect");
    return inspectUrl(spec.url, spec.llm ? { llm: spec.llm } : {}, job);
  },
  async "inspect-list"(spec, { ctx, job }) {
    const { inspectList } = await import("../curation/importList");
    return inspectList(contextFor(spec, ctx), spec.url, { job });
  },
  async "import-list"(spec, { ctx, job }) {
    const { importList } = await import("../curation/importList");
    return importList(contextFor(spec, ctx), spec.url, spec.options, { job });
  },
  async "form-url"(spec, { job }) {
    const { reduceRecipeImport } = await import("../formImport");
    return reduceRecipeImport(null, spec.url, spec.llm, job);
  },
  async "form-text"(spec, { job }) {
    const { reduceTextImport } = await import("../formImport");
    return reduceTextImport(null, spec.text, spec.source, job);
  },
};

/**
 * The form's import answers its failures as a state — a `message` and no
 * recipe — rather than throwing, because the form shows them. Its job is
 * `failed` all the same (the state is still returned to the form).
 */
function formFailure(state: RecipeActionState): JobError | undefined {
  if (!state.message || state.recipe || state.recipes?.length) {
    return undefined;
  }
  return { code: "import_failed", message: state.message };
}

/** Kinds whose result can be a failure (`runJob`'s `failureOf`). */
const JOB_FAILURES: {
  [K in JobKind]?: (result: JobResults[K]) => JobError | undefined;
} = {
  "form-url": formFailure,
  "form-text": formFailure,
};

/** "www.example.com/pies/apple": a URL as a list names it. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const v = parsed.searchParams.get("v");
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/$/, "")}${v ? `?v=${v}` : ""}`;
  } catch {
    return url;
  }
}

function pastedLabel(text: string, source?: string): string {
  return `pasted text (${text.length} chars${source ? `, from ${shortUrl(source)}` : ""})`;
}

/** What a person reads for a job in a list. */
export function jobLabel(spec: JobSpec): string {
  switch (spec.kind) {
    case "import-text":
    case "form-text":
      return pastedLabel(spec.text, spec.source);
    default:
      return shortUrl(spec.url);
  }
}

/**
 * Roundup lists and `--all` batches wait behind a person's single import
 * (D4); everything else is `interactive`.
 */
export function jobTier(spec: JobSpec): JobTier {
  if (spec.kind === "import-list") return "batch";
  if (
    (spec.kind === "import-url" || spec.kind === "import-text") &&
    spec.options.all
  ) {
    return "batch";
  }
  return "interactive";
}

/** The resources a kind may take (D4; 37b acquires them step by step). */
export function jobResources(spec: JobSpec): string[] {
  switch (spec.kind) {
    case "import-text":
    case "form-text":
      return ["gpu", "site"];
    case "inspect-list":
      return ["site"];
    default:
      return ["gpu", "ytdlp", "site"];
  }
}

export interface RunSpecOptions extends Omit<RunJobOptions, "failureOf"> {
  ctx?: CurationContext;
  tier?: JobTier;
}

/**
 * Run a spec as a job — the one entry every surface calls. Answers the
 * kind's result with the job's id as `job`; a failure is rethrown as it was
 * (the job records it).
 */
export async function runSpec<S extends JobSpec>(
  spec: S,
  { ctx, tier, ...options }: RunSpecOptions = {},
): Promise<JobResults[S["kind"]] & { job: string }> {
  const handler = JOB_HANDLERS[spec.kind] as unknown as (
    spec: S,
    env: JobEnv,
  ) => Promise<JobResults[S["kind"]]>;
  const failureOf = JOB_FAILURES[spec.kind] as
    | ((result: JobResults[S["kind"]]) => JobError | undefined)
    | undefined;
  const { job, result } = await runJob(
    {
      kind: spec.kind,
      label: jobLabel(spec),
      spec,
      tier: tier ?? jobTier(spec),
      resources: jobResources(spec),
    },
    (context) => handler(spec, { ctx, job: context }),
    { ...options, ...(failureOf ? { failureOf } : {}) },
  );
  return { ...result, job };
}

/** A corpus spec's `contentDirectory` and `author`, from the caller's context. */
export function corpusOf(ctx: CurationContext): CorpusSpec {
  return {
    contentDirectory: ctx.contentDirectory,
    ...(ctx.author ? { author: ctx.author } : {}),
  };
}
