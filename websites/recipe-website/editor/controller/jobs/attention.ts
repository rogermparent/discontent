/**
 * `/jobs`' "Needs a look" and "History" (48c, canvas B): jobs that did not
 * work grouped by cause, each with its next step, and rounds — a run of
 * one kind of job, each started within ten minutes of the last one's end
 * — folded into one row. Pure and dependency-free: the page runs it in the
 * browser on what `GET /api/jobs/board` read.
 */
import { httpStatusText } from "./outcome";

/** A job as these helpers read it: `JobSummary` and what the board adds. */
export interface BoardJobLike {
  id: string;
  kind: string;
  label: string;
  status: string;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
  error?: { code?: string; message?: string };
  outcome?: { kind: string; note: string };
  /** The page or source it read (redacted). */
  url?: string;
  /** An HTTP status outside 2xx that the page answered. */
  httpStatus?: number;
  /** What it read or wrote: a recipe's name. */
  name?: string;
  /** What it wrote. */
  slug?: string;
  /** A curator run's estimated cost. */
  costUsd?: number;
}

const LIVE = new Set(["queued", "running"]);

/** Ten minutes: a gap shorter than this keeps a round going (B's rule). */
export const ROUND_GAP_MS = 10 * 60 * 1000;

/** A kind in words, one and many. */
const KIND_WORDS: Record<string, [string, string]> = {
  "import-url": ["URL import", "URL imports"],
  "import-text": ["paste import", "paste imports"],
  "import-photo": ["photo import", "photo imports"],
  inspect: ["inspect", "inspects"],
  "inspect-list": ["roundup read", "roundup reads"],
  "import-list": ["roundup import", "roundup imports"],
  "form-url": ["URL import", "URL imports"],
  "form-text": ["paste import", "paste imports"],
  "form-photo": ["photo import", "photo imports"],
  "form-batch": ["picked import", "picked imports"],
  reindex: ["rebuild", "rebuilds"],
  "git-sync": ["sync", "syncs"],
  agent: ["curator run", "curator runs"],
  fill: ["fill from the source", "fills from the source"],
  choices: ["look for alternatives", "looks for alternatives"],
  edit: ["edit with AI", "edits with AI"],
  "shopping-merge": ["shopping list ask", "shopping list asks"],
};

/** "URL import", "3 inspects". */
export function kindWords(kind: string, count = 1): string {
  const [one, many] = KIND_WORDS[kind] ?? [kind, `${kind} jobs`];
  return count === 1 ? one : `${count} ${many}`;
}

/** "URL import" with a capital: an eyebrow. */
export function kindTitle(kind: string): string {
  const words = kindWords(kind);
  return `${words[0].toUpperCase()}${words.slice(1)}`;
}

/** B's History filter. */
export type KindFilter = "all" | "imports" | "inspects" | "curator" | "repo";

/** Which of B's filters a kind falls under. */
export function kindGroup(kind: string): Exclude<KindFilter, "all"> {
  if (kind === "inspect" || kind === "inspect-list") return "inspects";
  if (kind === "reindex" || kind === "git-sync") return "repo";
  if (
    kind === "agent" ||
    kind === "fill" ||
    kind === "choices" ||
    kind === "edit" ||
    kind === "shopping-merge"
  ) {
    return "curator";
  }
  return "imports";
}

/** A URL's host without `www.`. */
export function siteOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

/** A URL as people compare them: no scheme, `www.`, query, hash or end `/`. */
function sameUrlKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return undefined;
  }
}

/** "/sauced-bacon-jam" out of a URL, for a button. */
function pathWords(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const last = path.split("/").filter(Boolean).at(-1);
    return last ? decodeURIComponent(last) : undefined;
  } catch {
    return undefined;
  }
}

function startOf(job: BoardJobLike): number {
  return job.startedAt ?? job.queuedAt;
}

function endOf(job: BoardJobLike): number {
  return job.endedAt ?? startOf(job) + (job.durationMs ?? 0);
}

/** A job that ended without what it set out for. */
export function didNotWork(job: BoardJobLike): boolean {
  if (LIVE.has(job.status) || job.status === "cancelled") return false;
  if (job.status === "failed" || job.status === "interrupted") return true;
  return job.status === "done" && job.outcome?.kind === "nothing";
}

/** A finished job that read or wrote what it set out for. */
function worked(job: BoardJobLike): boolean {
  return job.status === "done" && job.outcome?.kind !== "nothing";
}

/* ------------------------------------------------------------------ */
/* Needs a look                                                         */
/* ------------------------------------------------------------------ */

/** What a group's button does: a link, or opening its list of jobs. */
export type NextStep =
  { label: string; href: string } | { label: string; show: true };

/** A job in a group, and the later one that got it after all. */
export interface AttentionItem {
  job: BoardJobLike;
  /** A later job that read the same page (a paste, another try). */
  resolvedBy?: BoardJobLike;
}

export interface AttentionGroup {
  /** Stable per cause: dismissals are kept against it. */
  key: string;
  /** "simplyrecipes.com answered HTTP 402 to 3 URL imports". */
  title: string;
  /** Why, and what that means. */
  detail: string;
  /** Not yet put right, newest first. */
  open: AttentionItem[];
  /** Put right later, newest first: "pasted", "read at another address". */
  resolved: AttentionItem[];
  next: NextStep;
  /** The newest job in the group: a dismissal holds until a newer one. */
  newest: string;
  /** Epoch ms of the newest job. */
  at: number;
}

interface Cause {
  key: string;
  title: (count: number, kinds: string) => string;
  detail: (jobs: BoardJobLike[]) => string;
  next: (open: BoardJobLike[]) => NextStep;
}

/** An HTTP status the job's page answered, from the board or its words. */
export function httpStatusOf(job: BoardJobLike): number | undefined {
  if (job.httpStatus !== undefined) return job.httpStatus;
  const text = `${job.error?.message ?? ""} ${job.outcome?.note ?? ""}`;
  const match =
    /\bHTTP (\d{3})\b/.exec(text) ?? /\banswered (\d{3})\b/.exec(text);
  return match ? Number(match[1]) : undefined;
}

/** The hosts of some jobs, most first: "tasteofhome.com ×3, food.com". */
function hostsText(jobs: BoardJobLike[]): string {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const site = siteOf(job.url) ?? "another site";
    counts.set(site, (counts.get(site) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([site, count]) => (count > 1 ? `${site} ×${count}` : site))
    .join(", ");
}

/** The kinds of some jobs in words: "3 URL imports", "2 inspects and 1 URL import". */
function kindsText(jobs: BoardJobLike[]): string {
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const words = kindWords(job.kind);
    counts.set(words, (counts.get(words) ?? 0) + 1);
  }
  const kinds = [...counts.keys()];
  return kinds
    .map((words) => {
      const count = counts.get(words)!;
      const kind = jobs.find((job) => kindWords(job.kind) === words)!.kind;
      return count === 1 ? `1 ${words}` : kindWords(kind, count);
    })
    .join(" and ");
}

const pageWord = (count: number) => (count === 1 ? "page" : "pages");

/** Why a job did not work, as a group's cause. */
function causeOf(job: BoardJobLike): Cause {
  const status = httpStatusOf(job);
  const site = siteOf(job.url) ?? "A site";
  if (status === 401 || status === 402 || status === 403 || status === 451) {
    return {
      key: `wall:${status}:${site}`,
      title: (_count, kinds) =>
        `${site} answered ${httpStatusText(status)} to ${kinds}`,
      detail: () =>
        status === 402
          ? "It wants payment or turns robots away, so trying again won't help. Its text can still be pasted in."
          : status === 403
            ? "It refused twice, so it is left alone for an hour; asking again won't help. Its text can still be pasted in."
            : status === 401
              ? "It wants a sign-in. Its text can still be pasted in."
              : "It will not serve the page here. Its text can still be pasted in.",
      next: (open) => {
        const path = open.length === 1 ? pathWords(open[0].url) : undefined;
        return {
          label: path ? `Paste ${path}` : "Paste the text",
          href: "/new-recipe",
        };
      },
    };
  }
  if (status === 404 || status === 410) {
    return {
      key: "gone",
      title: (count) => `${count} ${pageWord(count)} answered 404`,
      detail: (jobs) =>
        `Addresses that don't exist (any more): ${hostsText(jobs)}.`,
      next: (open) => ({ label: `Show the ${open.length}`, show: true }),
    };
  }
  if (status === 429) {
    return {
      key: `slow:${site}`,
      title: (_count, kinds) => `${site} asked to slow down, ${kinds}`,
      detail: () =>
        "It answered 429, too many requests: try again later, one at a time.",
      next: (open) => ({ label: `Show the ${open.length}`, show: true }),
    };
  }
  if (status !== undefined && status >= 500) {
    return {
      key: `down:${site}`,
      title: (_count, kinds) => `${site} answered ${status} to ${kinds}`,
      detail: () => "The site had trouble of its own: try again later.",
      next: (open) =>
        open.length === 1
          ? { label: "Open it", href: `/jobs/${open[0].id}` }
          : { label: `Show the ${open.length}`, show: true },
    };
  }
  const text = `${job.error?.message ?? ""} ${job.outcome?.note ?? ""}`;
  if (
    /No schema\.org Recipe|No recipe (found|on the page)|only its title/i.test(
      text,
    )
  ) {
    return {
      key: "no-recipe",
      title: (count) => `${count} ${pageWord(count)} had no recipe card`,
      detail: (jobs) =>
        `Nothing to read the recipe from on ${hostsText(jobs)}. The local model can read a page's text, or paste the text in.`,
      next: (open) =>
        open.length === 1
          ? { label: "Open it", href: `/jobs/${open[0].id}` }
          : { label: `Show the ${open.length}`, show: true },
    };
  }
  if (job.status === "interrupted") {
    return {
      key: "interrupted",
      title: (count) =>
        `${count} ${count === 1 ? "job" : "jobs"} stopped when ${count === 1 ? "its" : "their"} process did`,
      detail: () =>
        "The editor, the CLI or the MCP server ended while it ran (a restart, a deploy). Retry it from its page.",
      next: (open) =>
        open.length === 1
          ? { label: "Open it", href: `/jobs/${open[0].id}` }
          : { label: `Show the ${open.length}`, show: true },
    };
  }
  const code = job.error?.code ?? "error";
  return {
    key: `failed:${code}:${job.kind}`,
    title: (count) =>
      `${kindWords(job.kind, count)} failed`.replace(/^([a-z])/, (c) =>
        c.toUpperCase(),
      ),
    detail: (jobs) => jobs[0].error?.message ?? "It ended with an error.",
    next: (open) =>
      open.length === 1
        ? { label: "Open it", href: `/jobs/${open[0].id}` }
        : { label: `Show the ${open.length}`, show: true },
  };
}

/**
 * "Needs a look" (48c): every job that ended without what it set out for —
 * failed, interrupted, or `done` having read nothing (47h) — grouped by
 * cause (a site's wall by site, pages that are gone, no recipe card, a
 * process that ended, any other failure by its code), newest group first.
 * A job whose page a later job read after all (a paste of its text,
 * another try) is put right; a group with nothing left open is dropped.
 * Cancelled jobs are a person's choice and never listed.
 */
export function attentionGroups(
  jobs: readonly BoardJobLike[],
): AttentionGroup[] {
  const worth = jobs.filter(worked);
  const resolver = (job: BoardJobLike) => {
    const key = sameUrlKey(job.url);
    if (!key) return undefined;
    return worth
      .filter(
        (other) =>
          other.id !== job.id &&
          startOf(other) >= startOf(job) &&
          sameUrlKey(other.url) === key,
      )
      .sort((a, b) => startOf(a) - startOf(b))[0];
  };
  const groups = new Map<string, { cause: Cause; items: AttentionItem[] }>();
  for (const job of jobs) {
    if (!didNotWork(job)) continue;
    const cause = causeOf(job);
    const group = groups.get(cause.key) ?? { cause, items: [] };
    const resolvedBy = resolver(job);
    group.items.push({ job, ...(resolvedBy ? { resolvedBy } : {}) });
    groups.set(cause.key, group);
  }
  const out: AttentionGroup[] = [];
  for (const { cause, items } of groups.values()) {
    const newestFirst = [...items].sort(
      (a, b) => startOf(b.job) - startOf(a.job),
    );
    const open = newestFirst.filter((item) => !item.resolvedBy);
    if (open.length === 0) continue;
    const all = newestFirst.map((item) => item.job);
    out.push({
      key: cause.key,
      title: cause.title(all.length, kindsText(all)),
      detail: cause.detail(all),
      open,
      resolved: newestFirst.filter((item) => item.resolvedBy),
      next: cause.next(open.map((item) => item.job)),
      newest: all[0].id,
      at: startOf(all[0]),
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** What a dismissal is kept as: the group, until a newer job joins it. */
export function dismissalKey(group: Pick<AttentionGroup, "key" | "newest">) {
  return `${group.key}@${group.newest}`;
}

/* ------------------------------------------------------------------ */
/* History                                                              */
/* ------------------------------------------------------------------ */

export type RowTone = "ok" | "none" | "fail" | "stopped";

export interface HistoryRow {
  /** Stable while the round grows: its first job's id. */
  key: string;
  kind: string;
  /** Newest first. One job, or a round. */
  jobs: BoardJobLike[];
  /** "Cranberry Carrot Soup", "31 inspects · tasteofhome.com". */
  title: string;
  /** "URL import · cooking.nytimes.com", "shandy, agua fresca, …". */
  detail: string;
  /** "done", "3 not found", "all read", "1 failed". */
  state: string;
  tone: RowTone;
  /** Epoch ms: the round's first start. */
  at: number;
  /** From its first start to its last end. */
  durationMs?: number;
}

/** The name a job is known by in a list: what it read, else its label. */
export function jobName(job: BoardJobLike): string {
  return job.name ?? job.label;
}

/** A job's state in a word or two, for a row. */
export function jobState(job: BoardJobLike): { word: string; tone: RowTone } {
  switch (job.status) {
    case "done":
      return job.outcome?.kind === "nothing"
        ? { word: "read nothing", tone: "none" }
        : { word: "done", tone: "ok" };
    case "failed":
      return { word: "failed", tone: "fail" };
    case "interrupted":
      return { word: "interrupted", tone: "fail" };
    case "cancelled":
      return { word: "cancelled", tone: "stopped" };
    default:
      return { word: job.status, tone: "ok" };
  }
}

/** A round's state: what went wrong in it, or that all of it worked. */
function roundState(jobs: BoardJobLike[]): { word: string; tone: RowTone } {
  const nothing = jobs.filter(
    (job) => job.status === "done" && job.outcome?.kind === "nothing",
  ).length;
  const failed = jobs.filter(
    (job) => job.status === "failed" || job.status === "interrupted",
  ).length;
  const cancelled = jobs.filter((job) => job.status === "cancelled").length;
  if (failed > 0) {
    return {
      word: `${failed} failed${nothing ? ` · ${nothing} read nothing` : ""}`,
      tone: "fail",
    };
  }
  if (nothing > 0) {
    return {
      word: `${nothing} ${jobs[0].kind === "inspect" ? "not found" : "read nothing"}`,
      tone: "none",
    };
  }
  if (cancelled === jobs.length) return { word: "cancelled", tone: "stopped" };
  if (cancelled > 0) return { word: `${cancelled} cancelled`, tone: "stopped" };
  return {
    word: jobs[0].kind === "inspect" ? "all read" : "done",
    tone: "ok",
  };
}

/** Names, a few: "Shandy, Agua Fresca, Michelada…". */
function namesText(jobs: BoardJobLike[], max = 6): string {
  const names = [...jobs].reverse().map(jobName);
  const unique = [...new Set(names)];
  const shown = unique.slice(0, max).join(" · ");
  return unique.length > max ? `${shown} …` : shown;
}

/**
 * History (48c): finished jobs, newest first, with each round folded into
 * one row — consecutive jobs of one kind, each started less than ten
 * minutes after the one before it ended (B's rule: the store keeps no
 * batch id). A single job is its own row, named by what it read.
 */
export function foldRounds(
  jobs: readonly BoardJobLike[],
  gapMs = ROUND_GAP_MS,
): HistoryRow[] {
  const done = jobs
    .filter((job) => !LIVE.has(job.status))
    .sort((a, b) => startOf(b) - startOf(a));
  const rounds: BoardJobLike[][] = [];
  for (const job of done) {
    const round = rounds.at(-1);
    /* `round.at(-1)` is the oldest so far: this job ran just before it. */
    const later = round?.at(-1);
    if (
      round &&
      later &&
      later.kind === job.kind &&
      startOf(later) - endOf(job) < gapMs
    ) {
      round.push(job);
    } else {
      rounds.push([job]);
    }
  }
  return rounds.map((round) => {
    const oldest = round.at(-1)!;
    const at = startOf(oldest);
    const last = Math.max(...round.map(endOf));
    const durationMs =
      round.length === 1 ? round[0].durationMs : Math.max(0, last - at);
    if (round.length === 1) {
      const [job] = round;
      const state = jobState(job);
      const site = siteOf(job.url);
      return {
        key: job.id,
        kind: job.kind,
        jobs: round,
        title: jobName(job),
        detail: [kindTitle(job.kind), job.name ? site : undefined]
          .filter(Boolean)
          .join(" · "),
        state: state.word,
        tone: state.tone,
        at,
        ...(durationMs !== undefined ? { durationMs } : {}),
      };
    }
    const sites = new Set(round.map((job) => siteOf(job.url)));
    const site = sites.size === 1 ? [...sites][0] : undefined;
    const cost = round.reduce((sum, job) => sum + (job.costUsd ?? 0), 0);
    const state = roundState(round);
    return {
      key: oldest.id,
      kind: oldest.kind,
      jobs: round,
      title: [
        kindWords(oldest.kind, round.length),
        site,
        cost > 0 ? `$${cost.toFixed(2)}` : undefined,
      ]
        .filter(Boolean)
        .join(" · "),
      detail: namesText(round),
      state: state.word,
      tone: state.tone,
      at,
      durationMs,
    };
  });
}
