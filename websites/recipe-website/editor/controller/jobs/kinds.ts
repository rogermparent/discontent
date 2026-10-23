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
import { FAILED_OUTCOMES } from "@discontent/cms/git/syncState";
import {
  CancelledError,
  UsageError,
  withJob,
  withWarnings,
} from "../curation/errors";
import type {
  ImportListOptions,
  ImportListResult,
  InspectListResult,
} from "../curation/importList";
import type { FillResult } from "../curation/fillRecipe";
import type { InspectResult } from "../curation/inspect";
import type { ReindexResult } from "../curation/reindex";
import type { SyncResult } from "../curation/sync";
import type { RecipeActionState } from "../formImport";
import type { AgentJobResult } from "../agent/job";
import type { LlmMode } from "../llm/mode";
import type { JobContext } from "./context";
import { NOT_RETRIED_KINDS, type JOB_KIND_NAMES } from "./listing";
import { jobsDirectory } from "./location";
import { redactUrlText } from "./log";
import type { StoredPhoto } from "./photos";
import { repoResource } from "./queue";
import type { ReadingCache } from "./readingCache";
import { startJob, withSurfacedWarnings, type RunJobOptions } from "./run";
import type { JobError, JobMeta, JobTier } from "./store";

/**
 * How an import reads (39a): `fresh` skips the kept reading (38c,
 * `readingCache.ts`) and a photo set's kept transcription (38-De5), and
 * still keeps what it reads. The seats never see it: the handlers take it
 * off the options.
 */
interface ReadOptions {
  fresh?: boolean;
}

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
      options: ImportWriteOptions & ReadOptions & { llm?: LlmMode };
    })
  /** `recipes import --text`, `/api/import {text}`, MCP `recipe_import`. */
  | (CorpusSpec & {
      kind: "import-text";
      text: string;
      source?: string;
      options: ImportWriteOptions & ReadOptions;
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
      options: ImportWriteOptions & ReadOptions & { photoAsImage?: boolean };
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
    })
  /**
   * A full rebuild, or one type's (39b, epic 39 D2): `/api/reindex`, the
   * editor's `rebuildAllIndexes` (the banner, Maintenance, the `/git`
   * page's pulls and merges), `recipes reindex`, MCP `reindex`, and the
   * instance's own rebuild at start or after a foreign HEAD move. Waits in
   * the repository's line (`repo:`), then rebuilds under the write lock.
   */
  | (CorpusSpec & {
      kind: "reindex";
      contentType?: string;
      trigger: ReindexTrigger;
      /** Why the instance rebuilt by itself ("index version changed", …). */
      reason?: string;
      /**
       * Skip a full rebuild that finds the indexes fresh once it has the
       * line — HEAD and index version both current (39b review, L3): the
       * instance's own rebuilds always, a deploy's `POST /api/reindex?ifStale=1`.
       */
      ifStale?: boolean;
    })
  /**
   * One sync with one mirror, on the workstation (39b; epic 28 D3): the
   * runner's (startup, a HEAD move, a ping, Sync now) and `/api/git/sync`'s.
   * Only a sync worth a look leaves a record (`syncWorthRecording`).
   */
  | (CorpusSpec & {
      kind: "git-sync";
      remote?: string;
      triggers: string[];
    })
  /**
   * The editor's agent (epic 44, 44c, E2): the person's ask, run by the
   * configured model with the curator's tools (`controller/agent/job.ts`).
   * `continues` is the run a follow-up carries on from — its transcript is
   * the history. Never retried (`NOT_RETRIED_KINDS`): ask again instead.
   */
  | (CorpusSpec & {
      kind: "agent";
      prompt: string;
      continues?: string;
      /** A lower turn budget than E3's 40 (`--max-turns`, `maxTurns`). */
      maxTurns?: number;
    })
  /**
   * A recipe's gaps filled from its source (45b): the edit page's "Fill gaps
   * from the source", `recipes fill`, `POST /api/recipe/<slug>/fill`. Reads
   * the stored recipe and its source; writes nothing (the form's Save, or
   * `recipes update`, does).
   */
  | (CorpusSpec & {
      kind: "fill";
      slug: string;
      /** False: the source's values only, no estimate (`--no-estimate`). */
      estimate?: boolean;
    });

/** Who asked for a rebuild — the label says it. */
export type ReindexTrigger =
  /** `POST /api/reindex` (the HTTP backend, a deploy). */
  | "api"
  /** The editor's own pages: the banner, Maintenance, `/git`, Export. */
  | "editor"
  /** The CLI or the stdio MCP server (the local backend). */
  | "local"
  /** MCP over HTTP, in the editor. */
  | "mcp"
  /** The instance by itself: at start, or after a HEAD move it did not make. */
  | "instance";

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
  reindex: ReindexResult;
  "git-sync": SyncResult;
  agent: AgentJobResult;
  fill: FillResult;
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
    const { fresh: _fresh, ...options } = spec.options;
    void _fresh;
    return importAndCreate(contextFor(spec, ctx), spec.url, options, job, {
      cache: await importReadingCache(spec, dir, job),
    });
  },
  async "import-text"(spec, { ctx, job, dir }) {
    const { importFromText } = await import("../curation/importRecipe");
    const { fresh: _fresh, ...options } = spec.options;
    void _fresh;
    return importFromText(
      contextFor(spec, ctx),
      {
        text: spec.text,
        ...(spec.source ? { source: spec.source } : {}),
        ...options,
      },
      job,
      { cache: await importReadingCache(spec, dir, job) },
    );
  },
  async "import-photo"(spec, { ctx, job, dir }) {
    const { importFromPhotos } = await import("../curation/importPhoto");
    const { fresh, ...options } = spec.options;
    return importFromPhotos(
      contextFor(spec, ctx),
      {
        photos: spec.photos,
        ...(spec.source ? { source: spec.source } : {}),
        ...options,
      },
      job,
      {
        ...(dir ? { dir } : {}),
        ...(fresh ? { fresh: true } : {}),
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
  async reindex(spec, { ctx, job }) {
    const [
      { reindex, freshIndexes },
      {
        withRepoSlot,
        reindexQueueWaitMs,
        REINDEX_QUEUE_WAIT_MS,
        REINDEX_INSTANCE_QUEUE_WAIT_MS,
      },
    ] = await Promise.all([import("../curation/reindex"), import("./repo")]);
    const corpus = contextFor(spec, ctx);
    const instance = spec.trigger === "instance";
    return withRepoSlot(
      corpus.contentDirectory,
      job,
      async () => {
        /*
         * L3: the rebuild ahead of this one in line (the start-time one, a
         * deploy's) may have done the work already.
         */
        if ((instance || spec.ifStale) && !spec.contentType) {
          const fresh = await freshIndexes(corpus.contentDirectory);
          if (fresh) {
            job.log.info(
              "reindex.skip",
              `already fresh: built from ${fresh.head.slice(0, 7)}, index version ${fresh.version}`,
            );
            return { rebuilt: [], skipped: "fresh" as const };
          }
        }
        return reindex(corpus, spec.contentType, { job });
      },
      /* M2: a person's rebuild answers `busy` rather than wait out a sync. */
      {
        maxWaitMs: reindexQueueWaitMs(
          instance ? REINDEX_INSTANCE_QUEUE_WAIT_MS : REINDEX_QUEUE_WAIT_MS,
        ),
      },
    );
  },
  async "git-sync"(spec, { job }) {
    const [{ runMirrorSync }, { withRepoSlot }] = await Promise.all([
      import("../instance/start"),
      import("./repo"),
    ]);
    return withRepoSlot(spec.contentDirectory, job, async () => {
      /* A sync runs to its end once it starts: the line is the cancel point. */
      await job.beyondCancel?.(
        "the sync has begun: fetch, merge and push run to their end",
      );
      return runMirrorSync(spec.contentDirectory, spec.remote, job);
    });
  },
  async fill(spec, { ctx, job }) {
    const { fillRecipe } = await import("../curation/fillRecipe");
    return fillRecipe(
      contextFor(spec, ctx),
      spec.slug,
      spec.estimate === false ? { estimate: false } : {},
      job,
    );
  },
  async agent(spec, { ctx, job, dir }) {
    const { runAgentJob } = await import("../agent/job");
    return runAgentJob(spec, {
      ctx: contextFor(spec, ctx),
      job,
      dir: dir ?? jobsDirectory(),
    });
  },
};

/**
 * The kept reading of an import job (38c, `readingCache.ts`): keyed by the
 * spec's reading half, the model and the reading version — `undefined`
 * when no model will read (none configured, or `off`), or with no store.
 * The spec's `fresh` (39a) is not in the key: it skips the read only.
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
  return readingCache<UrlImport>(dir, key, {
    job: job.jobId,
    fresh: spec.options.fresh === true,
  });
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

/**
 * A sync answers its expected failures as an `outcome` (epic 28 D3), never a
 * throw. On `/jobs` the ones a person must look at are `failed`; `raced` and
 * `busy` retry by themselves, so they are `done`.
 */
function syncFailure(result: SyncResult): JobError | undefined {
  if (!FAILED_OUTCOMES.includes(result.outcome)) return undefined;
  return {
    code: result.outcome,
    message: result.message ?? `the sync ended ${result.outcome}`,
  };
}

/** Kinds whose result can be a failure (`runJob`'s `failureOf`). */
const JOB_FAILURES: {
  [K in JobKind]?: (result: JobResults[K]) => JobError | undefined;
} = {
  "form-url": formFailure,
  "form-text": formFailure,
  "form-photo": formFailure,
  "git-sync": syncFailure,
  /* 44c: a run the model's failure ended (a budget's end is `done`). */
  agent: (result) =>
    result.stopReason === "error"
      ? {
          code: "agent_failed",
          message: result.error ?? "the agent stopped on an error",
        }
      : undefined,
};

/**
 * Whether a finished sync is worth a row on `/jobs` (Db7 as amended by the
 * 39b review, L2): it **merged** commits in from the mirror, or it needs a
 * look — a failure (`conflict`, `mirror_dirty`, `unreachable`, `blocked`,
 * `error`), a refused push (`raced`), or a merge that gave up on the write
 * lock (`busy` with a failed merge step: the mirror's commits are still
 * waiting). Everything else leaves no record: a sync that only pushed —
 * every editor commit on the workstation is one, then the mirror's ping
 * after it finds nothing — or found nothing, or lost the sync lock to
 * another process's sync (`busy` before any step; that one records its
 * own). A row each would push imports out of the store's 300; the sync's
 * own state (`.git/discontent-sync.json`, the Mirrors card) still records
 * every attempt.
 */
export function syncWorthRecording(result: SyncResult): boolean {
  if (result.pulled > 0) return true;
  if (FAILED_OUTCOMES.includes(result.outcome)) return true;
  if (result.outcome === "raced") return true;
  if (result.outcome === "busy") {
    return result.steps.some(
      (entry) => entry.step === "merge" && entry.status === "failed",
    );
  }
  return false;
}

/**
 * Kinds whose finished job may leave no record (`runJob`'s `discardIf`,
 * 39b): a sync not worth a row (`syncWorthRecording`).
 */
const JOB_DISCARDS: {
  [K in JobKind]?: (result: JobResults[K]) => boolean;
} = {
  "git-sync": (result) => !syncWorthRecording(result),
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
    case "reindex": {
      const what = spec.contentType
        ? `rebuild the ${spec.contentType} index`
        : "rebuild every index";
      return `${what} (${spec.reason ?? REINDEX_TRIGGER_TEXT[spec.trigger]})`;
    }
    case "git-sync":
      return `sync with ${spec.remote ?? "the upstream"} (${spec.triggers.join(", ") || "manual"})`;
    case "agent":
      return agentLabel(spec.prompt, spec.continues !== undefined);
    case "fill":
      return `fill ${spec.slug} from its source${spec.estimate === false ? " (no estimate)" : ""}`;
    default:
      return shortUrl(spec.url);
  }
}

/** How much of an ask a list shows. */
const AGENT_LABEL_CHARS = 80;

/**
 * `ask: "find three vegetarian dinners…"`, or `follow-up: "…"` (44c): the
 * prompt, one line, cut, with any secret-looking environment value or URL
 * credential taken out (the log's redaction).
 */
export function agentLabel(prompt: string, followUp: boolean): string {
  const line = redactUrlText(prompt).replace(/\s+/g, " ").trim();
  const cut =
    line.length > AGENT_LABEL_CHARS
      ? `${line.slice(0, AGENT_LABEL_CHARS - 1)}…`
      : line;
  return `${followUp ? "follow-up" : "ask"}: "${cut}"`;
}

const REINDEX_TRIGGER_TEXT: Record<ReindexTrigger, string> = {
  api: "the API",
  editor: "the editor",
  local: "CLI or MCP",
  mcp: "MCP",
  instance: "by itself",
};

/**
 * Roundup lists and `--all` batches wait behind a person's single import
 * (D4); everything else is `interactive`.
 */
export function jobTier(spec: JobSpec): JobTier {
  if (spec.kind === "import-list") return "batch";
  /* 39b: what nobody is waiting on — a sync, the instance's own rebuild. */
  if (spec.kind === "git-sync") return "batch";
  if (spec.kind === "reindex" && spec.trigger === "instance") return "batch";
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
    /* 39b: the repository's line, held for the whole job. */
    case "reindex":
    case "git-sync":
      return [repoResource(spec.contentDirectory)];
    default:
      return ["gpu", "ytdlp", "site"];
  }
}

export interface RunSpecOptions extends Omit<
  RunJobOptions,
  "failureOf" | "discardIf"
> {
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
    ((result: JobResults[S["kind"]]) => JobError | undefined) | undefined;
  const discardIf = JOB_DISCARDS[spec.kind] as
    ((result: JobResults[S["kind"]]) => boolean) | undefined;
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
    {
      ...options,
      dir,
      ...(failureOf ? { failureOf } : {}),
      ...(discardIf ? { discardIf } : {}),
    },
  );
  const done = started.done.then(({ job, result }) => ({ ...result, job }));
  /* Handled here, so a caller that never awaits it leaves nothing unhandled. */
  done.catch(() => undefined);
  return { job: started.job, stored: started.stored, done };
}

/**
 * Run a spec **inside a job that is already running** (44c, Ec1): the
 * editor's agent calls an import or inspect seat from a tool call, and the
 * seat's steps belong in the run's own log, nested under the tool's step
 * (the log's async context does the nesting), its waits in the run's queue
 * place and its cancel the run's `signal`. No record of its own: the result
 * carries the enclosing job's id as `job`.
 *
 * As `runJob` would: a failure is rethrown with the warnings the seat
 * surfaced and the job's id; a failure after a cancel is `cancelled`;
 * warnings it surfaced join the result's. A seat that came back although
 * cancelled answers what it did (Ea12: a write that landed is reported).
 */
export async function runSpecInline<S extends JobSpec>(
  spec: S,
  {
    ctx,
    job,
    dir = jobsDirectory(),
  }: { ctx?: CurationContext; job: JobContext; dir?: string },
): Promise<JobResults[S["kind"]] & { job: string }> {
  const handler = JOB_HANDLERS[spec.kind] as unknown as (
    spec: S,
    env: JobEnv,
  ) => Promise<JobResults[S["kind"]]>;
  const before = new Set(job.log.surfaced);
  const surfacedHere = () =>
    job.log.surfaced.filter((message) => !before.has(message));
  const id = job.jobId ?? job.log.jobId;
  let result: JobResults[S["kind"]];
  try {
    result = await handler(spec, { ctx, job, dir });
  } catch (error) {
    const reason = job.signal?.reason;
    const thrown = job.signal?.aborted
      ? new CancelledError(
          reason instanceof Error ? reason.message : "the job was cancelled",
        )
      : withWarnings(error, surfacedHere());
    throw id ? withJob(thrown, id) : thrown;
  }
  return withSurfacedWarnings(
    { ...result, ...(id ? { job: id } : {}) },
    surfacedHere(),
  ) as JobResults[S["kind"]] & { job: string };
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
    /* A merge commits; a rebuild writes no commit but replaces every index. */
    case "git-sync":
    case "reindex":
    /* 44c: the agent may write through its tools. */
    case "agent":
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
export async function resolvedDirectory(directory: string): Promise<string> {
  const absolute = path.resolve(directory);
  return realpath(absolute).catch(() => absolute);
}

type NotRetriedKind = (typeof NOT_RETRIED_KINDS)[number];

/**
 * Why Retry refuses a rebuild or a sync (39b review, L6): a replay would
 * carry the first run's reason ("index version changed (a → b)") long after
 * it stopped being true, and a sync retried from the CLI would run without
 * the editor's instance (its mutex, its mirrors, its notifications). Each
 * has its own way to run now.
 */
const NOT_RETRIED_TEXT: Record<NotRetriedKind, string> = {
  reindex:
    "A rebuild is not retried: run a new one (recipes reindex, MCP reindex, or Rebuild on the editor's Git page).",
  "git-sync":
    "A sync is not retried: run a new one (Sync now on the editor's Git page, or POST /api/git/sync).",
  agent:
    "An agent run is not retried: its tools may already have written. Ask again, or follow up on the run (POST /api/agent with runId, recipes agent --run).",
};

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
  {
    fresh = false,
  }: {
    /**
     * Read it again (39a): an import's kept reading (and a photo set's
     * transcription) is skipped. Retry decides, whatever the first run
     * asked: without it, a recorded `fresh` is dropped.
     */
    fresh?: boolean;
  } = {},
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
  if ((NOT_RETRIED_KINDS as readonly string[]).includes(spec.kind)) {
    throw new UsageError(NOT_RETRIED_TEXT[spec.kind as NotRetriedKind]);
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
  return withFresh({ ...spec, ...corpusOf(ctx) }, fresh);
}

/** A spec with `fresh` set as asked, for the kinds that read a kept reading. */
function withFresh(spec: JobSpec, fresh: boolean): JobSpec {
  if (
    spec.kind !== "import-url" &&
    spec.kind !== "import-text" &&
    spec.kind !== "import-photo"
  ) {
    return spec;
  }
  const { fresh: _recorded, ...options } = spec.options;
  void _recorded;
  return {
    ...spec,
    options: { ...options, ...(fresh ? { fresh: true } : {}) },
  } as JobSpec;
}

/**
 * Run a recorded job again (37c's Retry): its spec through `startSpec`
 * with the caller's context, as a new job whose meta names the old one
 * (`retryOf`). Answers once the new record exists; `done` is its outcome.
 */
export async function retryJob(
  meta: Pick<JobMeta, "id" | "kind" | "spec">,
  ctx: CurationContext,
  { dir, fresh = false }: { dir?: string; fresh?: boolean } = {},
): Promise<{ job: string; retryOf: string; done: Promise<unknown> }> {
  const spec = await retrySpecFor(meta, ctx, { fresh });
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
