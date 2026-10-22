/**
 * The job list's filters and limits (37c), dependency-free: the CLI's
 * command table and the MCP registry load at startup, and must not pull the
 * store and the queue in with them (35q's lazy startup).
 */

/** Every status a job can have (`store.ts`'s `JobStatus`). */
export const JOB_STATUS_NAMES = [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
  "interrupted",
] as const;

/** The list's status filter: a status, or `live` (queued and running). */
export const JOB_STATUS_FILTERS = [...JOB_STATUS_NAMES, "live"] as const;

/** Every job kind (`kinds.ts`'s `JobKind`, which checks this list). */
export const JOB_KIND_NAMES = [
  "import-url",
  "import-text",
  "import-photo",
  "inspect",
  "inspect-list",
  "import-list",
  "form-url",
  "form-text",
  "form-photo",
  "form-batch",
  /* 39b (epic 39 D2): the repository's own long operations. */
  "reindex",
  "git-sync",
  /* 44c (epic 44, E2): a run of the editor's agent. */
  "agent",
] as const;

/**
 * The kinds that reuse a kept reading (38c) — and, for photos, a kept
 * transcription — so Retry offers "Read it again" (`fresh`, 39a).
 */
export const KEPT_READING_KINDS: readonly string[] = [
  "import-url",
  "import-text",
  "import-photo",
];

/**
 * The kinds Retry refuses (39b review, L6; `kinds.ts`'s `retrySpecFor` says
 * why): the job page shows no Retry for them.
 */
export const NOT_RETRIED_KINDS = ["reindex", "git-sync", "agent"] as const;

/** `GET /api/jobs`, `recipes jobs list`, MCP `job_list`: at most this many rows. */
export const JOB_LIST_MAX_LIMIT = 300;
export const JOB_LIST_DEFAULT_LIMIT = 50;
