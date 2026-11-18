/**
 * "What moved between them" (48d, Sync & upkeep): each commit of the history
 * with where it was made and where it went. Pure; `machines.ts` reads the
 * facts.
 *
 * **Where a change was made** is read from the commit's *committer*: the
 * engine commits with `--author` set to the person and the committer left as
 * the machine's own git identity (`packages/cms/git/commit.ts`), so a commit
 * this repository's identity made was made here and any other came in from
 * elsewhere. A proxy (Dd3): two machines configured with one identity read
 * as one, and the page then says nothing rather than guess. A commit still
 * missing from the other side's remote-tracking ref is "not sent yet",
 * whoever made it.
 */

export type Direction =
  /** Made here, and the other side has it. */
  | "out"
  /** Made elsewhere, and here now. */
  | "in"
  /** Here, and not on the other side yet. */
  | "unsent";

export interface DirectionFacts {
  /** This repository's committer email, when git has one. */
  localEmail?: string;
  /** The commit's committer email. */
  committerEmail?: string;
  /** Whether the other side's remote-tracking ref lacks the commit. */
  unsent: boolean;
  /** Whether there is another side at all. */
  hasPeer: boolean;
}

export function directionOf(facts: DirectionFacts): Direction | undefined {
  if (!facts.hasPeer) return undefined;
  if (facts.unsent) return "unsent";
  const local = facts.localEmail?.trim().toLowerCase();
  const committer = facts.committerEmail?.trim().toLowerCase();
  if (!local || !committer) return undefined;
  return committer === local ? "out" : "in";
}

/** "Here → uraninite", "uraninite → here", "Here, not sent yet". */
export function directionWords(direction: Direction, peer: string): string {
  switch (direction) {
    case "out":
      return `Here → ${peer}`;
    case "in":
      return `${peer} → here`;
    case "unsent":
      return "Here, not sent yet";
  }
}

export type ChangeKind =
  "recipe" | "tag" | "plan" | "feature" | "page" | "merge" | "other";

/** What a commit was about, from the subjects the engine writes. */
export function changeKind(message: string): ChangeKind {
  const subject = message.split("\n")[0] ?? "";
  if (/^Merge\b/.test(subject)) return "merge";
  if (/featured recipe|homepage/i.test(subject)) return "feature";
  if (/\b(term|tag-term|tag)s?\b/i.test(subject)) return "tag";
  if (/\bgroup\b|\bplan\b/i.test(subject)) return "plan";
  if (/\bpage\b/i.test(subject)) return "page";
  if (/\brecipe\b/i.test(subject)) return "recipe";
  return "other";
}

export interface DatedCommit {
  hash: string;
  /** ISO. */
  date: string;
}

/** The day a commit falls on, as a key: UTC before hydration, the reader's own day after. */
export function dayKey(iso: string, local: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  if (!local) return date.toISOString().slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Commits in their order, grouped into runs of one day. */
export function byDay<T extends DatedCommit>(
  commits: T[],
  local: boolean,
): { day: string; commits: T[] }[] {
  const days: { day: string; commits: T[] }[] = [];
  for (const commit of commits) {
    const day = dayKey(commit.date, local);
    const last = days.at(-1);
    if (last && last.day === day) last.commits.push(commit);
    else days.push({ day, commits: [commit] });
  }
  return days;
}

/**
 * A day's heading: "Today · Mon 9 Nov", "Fri 30 Oct". Before hydration
 * (`local` false) the day is UTC's and named the same fixed way, so the
 * server and the first client render agree.
 */
export function dayHeading(day: string, now: Date, local: boolean): string {
  if (day === "unknown") return "Undated";
  const [year, month, date] = day.split("-").map(Number);
  const when = local
    ? new Date(year, month - 1, date)
    : new Date(Date.UTC(year, month - 1, date));
  const label = when
    .toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      ...(year !== (local ? now.getFullYear() : now.getUTCFullYear())
        ? { year: "numeric" }
        : {}),
      ...(local ? {} : { timeZone: "UTC" }),
    })
    .replace(",", "");
  const today = dayKey(now.toISOString(), local) === day;
  return today ? `Today · ${label}` : label;
}
