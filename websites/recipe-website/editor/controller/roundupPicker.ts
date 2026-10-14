/**
 * The roundup picker's bookkeeping (35r), pure and client-safe: which picks
 * the next server action call takes, and the progress line. The `/new-recipe`
 * component (`RoundupImport.tsx`) owns the state and the loop; what one
 * call's answer means for each pick is `roundupSettle.ts`, on the server
 * (it needs the pacing's site keys, whose module parses HTML).
 *
 * **At most three picks per call** (`ROUNDUP_CHUNK`, the seat's own default
 * cap `IMPORT_LIST_LIMIT`): a call re-fetches the list page, then two
 * requests (page and image) per pick, each 15 s after the last request to
 * that site (30-D5) — seven requests, so ≥ 105 s against one site when the
 * previous call just ended there, plus 15 s per 403 retry. A few minutes at
 * most, and Stop takes effect after it.
 */
import { hostnameLabel } from "recipe-website-common/util/hostnameLabel";
import type { ImportListItemStatus } from "./curation/importList";

export const ROUNDUP_CHUNK = 3;

/** One ticked item, as `importList` takes it back: position and URL. */
export interface RoundupPick {
  n: number;
  url: string;
  name: string;
}

/** What became of one pick, for the results list. */
export interface RoundupOutcome {
  n: number;
  url: string;
  name: string;
  status: ImportListItemStatus | "dropped" | "not-attempted";
  slug?: string;
  message?: string;
}

/** The next call's picks, and the queue after it. */
export function nextChunk<T>(
  queue: readonly T[],
  size: number = ROUNDUP_CHUNK,
): { chunk: T[]; rest: T[] } {
  return { chunk: queue.slice(0, size), rest: queue.slice(size) };
}

/** The sites a set of picks will be fetched from, each once, in order. */
export function hostsOf(urls: readonly string[]): string[] {
  return [
    ...new Set(
      urls
        .map((url) => hostnameLabel(url))
        .filter((host): host is string => Boolean(host)),
    ),
  ];
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * "Imported 4 of 9 · fetching 5, 6, 7 from sallysbakingaddiction.com — one
 * request every 15 s per site…". The seat cannot report its waits from inside
 * a call, so the line says what is being fetched and the rule it waits by,
 * not a countdown.
 */
export function progressLine({
  outcomes,
  total,
  current,
  stopping = false,
}: {
  outcomes: readonly RoundupOutcome[];
  total: number;
  current: readonly RoundupPick[];
  stopping?: boolean;
}): string {
  const imported = outcomes.filter(
    (outcome) => outcome.status === "imported",
  ).length;
  const head = `Imported ${imported} of ${total}`;
  if (current.length === 0) {
    const done = outcomes.length;
    return done < total
      ? `${head} · stopped with ${plural(total - done, "pick")} left`
      : `${head} · done`;
  }
  const hosts = hostsOf(current.map((pick) => pick.url));
  return (
    `${head} · fetching ${current.map((pick) => pick.n).join(", ")}` +
    (hosts.length ? ` from ${hosts.join(", ")}` : "") +
    " — one request every 15 s per site…" +
    (stopping ? " Stopping after this call." : "")
  );
}
