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
  BatchPick,
  ImportBatchItem,
  ImportResult,
  ImportWriteOptions,
  UrlImport,
} from "../curation/importRecipe";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { UsageError } from "../curation/errors";
import type {
  ImportListOptions,
  ImportListResult,
  InspectListResult,
} from "../curation/importList";
import type { InspectResult } from "../curation/inspect";
import type { RecipeActionState } from "../formImport";
import type { LlmMode } from "../llm/mode";
import type { JobContext } from "./context";
import type { JOB_KIND_NAMES } from "./listing";
import { jobsDirectory } from "./location";
import type { StoredPhoto } from "./photos";
import type { ReadingCache } from "./readingCache";
import { startJob, type RunJobOptions } from "./run";
import type { JobError, JobMeta, JobTier } from "./store";

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
  /**
   * `recipes import --photo`, `/api/import` multipart, MCP `photos` (38e):
   * the photos stored in the job store at enqueue time (`storePhotos`),
   * named by their path there — never their bytes.
   */
  | (CorpusSpec & {
      kind: "import-photo";
      photos: StoredPhoto[];
      source?: string;
      options: ImportWriteOptions & { photoAsImage?: boolean };
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
  | { kind: "form-text"; text: string; source?: string }
  /** The form's Photo mode (38e): fills the form, writes nothing. */
  | { kind: "form-photo"; photos: StoredPhoto[] }
  /**
   * The form's "Import N selected" (36e's picker; a job since 37c): the
   * readings already in hand, written one commit each by
   * `importBatchPicks` — nothing is read again.
   */
  | (CorpusSpec & {
      kind: "form-batch";
      /** The video, or a pasted text's source. */
      url?: string;
      picks: BatchPick[];
      total: number;
      siblings?: { n: number; name?: string }[];
      commitNote: string;
      /**
       * A photo import's first photo, when "use the first photo as the
       * recipe's image" is ticked (38e review): each created recipe gets
       * it (`setPhotoAsImage`). A list, as every photo spec names its
       * photos, so the prune keeps it while this job remains.
       */
      photos?: StoredPhoto[];
    });

export type JobKind = JobSpec["kind"];

/* `listing.ts`'s dependency-free list names every kind, and no other. */
type SameKinds<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never;
const KIND_LIST_MATCHES: SameKinds<JobKind, (typeof JOB_KIND_NAMES)[number]> =
  true;
void KIND_LIST_MATCHES;

/** What each kind answers. */
export interface JobResults {
  "import-url": ImportResult;
  "import-text": ImportResult;
  "import-photo": ImportResult;
  inspect: InspectResult;
  "inspect-list": InspectListResult;
  "import-list": ImportListResult;
  "form-url": RecipeActionState;
  "form-text": RecipeActionState;
  "form-photo": RecipeActionState;
  "form-batch": FormBatchResult;
}

/** What "Import N selected" answers: one row per pick. */
export interface FormBatchResult {
  recipes: ImportBatchItem[];
}

export type SpecOf<K extends JobKind> = Extract<JobSpec, { kind: K }>;

export interface JobEnv {
  /** The caller's context; a retry builds one from the spec. */
  ctx?: CurationContext;
  /** The job's log, signal, tier and id: what every seat takes as `job`. */
  job: JobContext;
  /** The job store it runs in: where its kept reading lives (38c). */
  dir?: string;
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
  async "import-url"(spec, { ctx, job, dir }) {
    const { importAndCreate } = await import("../curation/importRecipe");
    return importAndCreate(contextFor(spec, ctx), spec.url, spec.options, job, {
      cache: await importReadingCache(spec, dir, job),
    });
  },
  async "import-text"(spec, { ctx, job, dir }) {
    const { importFromText } = await import("../curation/importRecipe");
    return importFromText(
      contextFor(spec, ctx),
      {
        text: spec.text,
        ...(spec.source ? { source: spec.source } : {}),
        ...spec.options,
      },
      job,
      { cache: await importReadingCache(spec, dir, job) },
    );
  },
  async "import-photo"(spec, { ctx, job, dir }) {
    const { importFromPhotos } = await import("../curation/importPhoto");
    return importFromPhotos(
      contextFor(spec, ctx),
      {
        photos: spec.photos,
        ...(spec.source ? { source: spec.source } : {}),
        ...spec.options,
      },
      job,
      {
        ...(dir ? { dir } : {}),
        /* 38c's kept reading, keyed by the transcription: a `--pick` after
         * a several-recipe refusal reads neither the photo nor the text again. */
        cacheFor: (text) =>
          importReadingCache(
            {
              kind: "import-text",
              contentDirectory: spec.contentDirectory,
              text,
              ...(spec.source ? { source: spec.source } : {}),
              options: spec.options,
            },
            dir,
            job,
            { photo: true },
          ),
      },
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
  async "form-photo"(spec, { job, dir }) {
    const { reducePhotoImport } = await import("../formImport");
    return reducePhotoImport(null, spec.photos, job, {
      ...(dir ? { dir } : {}),
    });
  },
  async "form-batch"(spec, { ctx, job, dir }) {
    const { importBatchPicks } = await import("../curation/importRecipe");
    const corpus = contextFor(spec, ctx);
    const recipes = await importBatchPicks(
      corpus,
      spec.picks,
      {
        total: spec.total,
        ...(spec.siblings ? { siblings: spec.siblings } : {}),
        commitNote: spec.commitNote,
        allowPartial: true,
      },
      job,
    );
    const photo = spec.photos?.[0];
    if (!photo) return { recipes };
    /* 38e review: the photo as each created recipe's image (De7). */
    const { setPhotoAsImage } = await import("../curation/importPhoto");
    const withImages: ImportBatchItem[] = [];
    for (const item of recipes) {
      if (item.status !== "imported" || !item.slug) {
        withImages.push(item);
        continue;
      }
      const warnings = await setPhotoAsImage(corpus, [item.slug], photo, {
        ...(dir ? { dir } : {}),
        job,
      });
      withImages.push(
        warnings.length > 0
          ? { ...item, warnings: [...(item.warnings ?? []), ...warnings] }
          : item,
      );
    }
    return { recipes: withImages };
  },
};

/**
 * The kept reading of an import job (38c, `readingCache.ts`): keyed by the
 * spec's reading half, the model and the reading version — `undefined`
 * when no model will read (none configured, or `off`), or with no store.
 */
async function importReadingCache(
  spec: SpecOf<"import-url"> | SpecOf<"import-text">,
  dir: string | undefined,
  job: JobContext,
  /** More of the key: 38e's `{photo: true}` (its warnings name the photo). */
  extra: Record<string, unknown> = {},
): Promise<ReadingCache<UrlImport> | undefined> {
  const mode =
    spec.kind === "import-url" ? (spec.options.llm ?? "auto") : "force";
  if (!dir || mode === "off") return undefined;
  const { llmConfig } = await import("../llm/client");
  const config = llmConfig();
  if (!config) return undefined;
  const { readingCache, readingKey, readingVersion } =
    await import("./readingCache");
  const key = readingKey({
    version: await readingVersion(),
    model: config.model,
    api: config.api,
    server: config.url,
    ...(spec.kind === "import-url"
      ? { url: spec.url }
      : { text: spec.text, source: spec.source }),
    mode,
    asOne: spec.options.asOne === true,
    ...extra,
  });
  return readingCache<UrlImport>(dir, key, { job: job.jobId });
}

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
  "form-photo": formFailure,
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

/** "photo card.jpg", "2 photos: card-1.jpg, card-2.jpg" (38e). */
function photoLabel(photos: readonly StoredPhoto[]): string {
  const names = photos.map((photo) => photo.name).join(", ");
  return photos.length === 1
    ? `photo ${names}`
    : `${photos.length} photos: ${names}`;
}

/** What a person reads for a job in a list. */
export function jobLabel(spec: JobSpec): string {
  switch (spec.kind) {
    case "import-text":
    case "form-text":
      return pastedLabel(spec.text, spec.source);
    case "import-photo":
    case "form-photo":
      return photoLabel(spec.photos);
    case "form-batch": {
      const picks = `${spec.picks.length} of ${spec.total} recipes`;
      return spec.url ? `${picks} from ${shortUrl(spec.url)}` : picks;
    }
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
    (spec.kind === "import-url" ||
      spec.kind === "import-text" ||
      spec.kind === "import-photo") &&
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
    /* The vision model, then the text model; the photo is no download. */
    case "import-photo":
    case "form-photo":
      return ["gpu"];
    case "inspect-list":
    /* The picks' pictures: the readings are in hand. */
    case "form-batch":
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
  options: RunSpecOptions = {},
): Promise<JobResults[S["kind"]] & { job: string }> {
  return (await startSpec(spec, options)).done;
}

/**
 * Start a spec as a job and answer its id at once (37c: the form's import,
 * Retry). The work goes on in this process; `done` settles as `runSpec`
 * would, and is marked handled, so a caller may leave it.
 */
export async function startSpec<S extends JobSpec>(
  spec: S,
  {
    ctx,
    tier,
    retryOf,
    ...options
  }: RunSpecOptions & { retryOf?: string } = {},
): Promise<{
  job: string;
  /** The record was written (`StartedJob.stored`): its id can be followed. */
  stored: boolean;
  done: Promise<JobResults[S["kind"]] & { job: string }>;
}> {
  const handler = JOB_HANDLERS[spec.kind] as unknown as (
    spec: S,
    env: JobEnv,
  ) => Promise<JobResults[S["kind"]]>;
  const failureOf = JOB_FAILURES[spec.kind] as
    | ((result: JobResults[S["kind"]]) => JobError | undefined)
    | undefined;
  const dir = options.dir ?? jobsDirectory();
  const started = await startJob(
    {
      kind: spec.kind,
      label: jobLabel(spec),
      spec,
      tier: tier ?? jobTier(spec),
      resources: jobResources(spec),
      ...(retryOf ? { retryOf } : {}),
    },
    (context) => handler(spec, { ctx, job: context, dir }),
    { ...options, dir, ...(failureOf ? { failureOf } : {}) },
  );
  const done = started.done.then(({ job, result }) => ({ ...result, job }));
  /* Handled here, so a caller that never awaits it leaves nothing unhandled. */
  done.catch(() => undefined);
  return { job: started.job, stored: started.stored, done };
}

/** Whether running the spec commits to the corpus (a dry run does not). */
export function specWrites(spec: JobSpec): boolean {
  switch (spec.kind) {
    case "import-url":
    case "import-text":
    case "import-photo":
    case "import-list":
      return !spec.options.dryRun;
    case "form-batch":
      return true;
    default:
      return false;
  }
}

/** Whether a kind reads or writes the corpus (its spec names the directory). */
function isCorpusSpec(spec: JobSpec): spec is JobSpec & CorpusSpec {
  return typeof (spec as Partial<CorpusSpec>).contentDirectory === "string";
}

/** A directory as the filesystem resolves it (a symlink followed), else as given. */
async function resolvedDirectory(directory: string): Promise<string> {
  const absolute = path.resolve(directory);
  return realpath(absolute).catch(() => absolute);
}

/**
 * A recorded job's spec, ready to run again with **this caller's** context
 * (37c, 37a's review note): a corpus job recorded against another content
 * directory — a CLI run against a scratch clone, seen from the editor, or
 * the reverse — is refused (`usage`, saying why), and the replay commits as
 * the caller, not as whoever ran it first.
 */
export async function retrySpecFor(
  meta: Pick<JobMeta, "id" | "kind" | "spec">,
  ctx: CurationContext,
): Promise<JobSpec> {
  const spec = meta.spec as JobSpec | undefined;
  if (
    !spec ||
    typeof spec !== "object" ||
    spec.kind !== meta.kind ||
    !Object.hasOwn(JOB_HANDLERS, spec.kind)
  ) {
    throw new UsageError(
      `Job ${meta.id} (${meta.kind}) cannot be run again: its record holds no spec this version knows.`,
    );
  }
  if (!isCorpusSpec(spec)) return spec;
  const [recorded, here] = await Promise.all([
    resolvedDirectory(spec.contentDirectory),
    resolvedDirectory(ctx.contentDirectory),
  ]);
  if (recorded !== here) {
    throw new UsageError(
      `Job ${meta.id} ran against ${spec.contentDirectory}, not this content directory (${ctx.contentDirectory}). ` +
        "Run it again from a process that uses that directory (recipes jobs retry with --content-dir).",
    );
  }
  return { ...spec, ...corpusOf(ctx) };
}

/**
 * Run a recorded job again (37c's Retry): its spec through `startSpec`
 * with the caller's context, as a new job whose meta names the old one
 * (`retryOf`). Answers once the new record exists; `done` is its outcome.
 */
export async function retryJob(
  meta: Pick<JobMeta, "id" | "kind" | "spec">,
  ctx: CurationContext,
  { dir }: { dir?: string } = {},
): Promise<{ job: string; retryOf: string; done: Promise<unknown> }> {
  const spec = await retrySpecFor(meta, ctx);
  const started = await startSpec(spec, {
    ctx,
    retryOf: meta.id,
    ...(dir ? { dir } : {}),
  });
  return { job: started.job, retryOf: meta.id, done: started.done };
}

/** A corpus spec's `contentDirectory` and `author`, from the caller's context. */
export function corpusOf(ctx: CurationContext): CorpusSpec {
  return {
    contentDirectory: ctx.contentDirectory,
    ...(ctx.author ? { author: ctx.author } : {}),
  };
}
