/**
 * Near-miss URLs (46d): a model that copies a URL with a slip — qwen3:14b
 * wrote the harness's fixture as `127.0.0.0.1` (44e) — gets a failure it
 * cannot act on, calls the page unreachable and imports nothing. When a
 * page-reading tool fails on a URL that is malformed or does not resolve,
 * and its host is one slip from a URL the conversation has already seen (a
 * person's message, a tool's result, a page Claude's search found), the
 * tool's error names that URL: "Did you mean …?". Never a silent retry: the
 * model reads the hint and decides.
 *
 * One slip is a Levenshtein distance of at most 2 between the hosts, or a
 * host with one dot-separated label more or less (`www.` added or dropped,
 * `127.0.0.0.1`).
 *
 * Pure and dependency-free (type imports only): the curator page uses
 * `conversationUrls` in the browser too (`links.ts`).
 */
import type { AgentMessage } from "./types";

/** The tools whose failure on a URL is checked, and the argument holding it. */
export const NEAR_MISS_TOOLS: Readonly<Record<string, string>> = {
  recipe_import: "url",
  recipe_import_list: "url",
  page_inspect: "url",
  page_inspect_list: "url",
  web_fetch: "url",
};

/** At most this many edits between two hosts for one to be a slip of the other. */
export const NEAR_MISS_MAX_EDITS = 2;

/**
 * An error that says the address itself failed: it did not resolve or
 * parse. Not undici's bare "fetch failed", which a refused connection, a
 * reset or a bad certificate says too: that counts only with a
 * `RESOLVE_CODES` cause (`addressFailed`).
 */
const ADDRESS_FAILURE =
  /could not resolve|ENOTFOUND|EAI_AGAIN|getaddrinfo|invalid url|not a valid url|invalid hostname/i;

/** The cause codes of a name that did not resolve (Node's `dns`). */
const RESOLVE_CODES = new Set(["ENOTFOUND", "EAI_AGAIN"]);

/** An error's code, or its cause's, its cause's cause's… (a few deep). */
function causeCodes(error: unknown): string[] {
  const codes: string[] = [];
  let at: unknown = error;
  for (let depth = 0; depth < 4 && isObject(at); depth++) {
    if (typeof at.code === "string") codes.push(at.code);
    at = (at as { cause?: unknown }).cause;
  }
  return codes;
}

/**
 * Whether a failure says the address itself failed (46d): its words say so
 * (`ADDRESS_FAILURE`), or its cause's code is a resolver's. ECONNREFUSED,
 * a 403 or a timeout is not a slip of the address.
 */
export function addressFailed(message: string, cause?: unknown): boolean {
  if (ADDRESS_FAILURE.test(message)) return true;
  return causeCodes(cause).some((code) => RESOLVE_CODES.has(code));
}

const URL_IN_TEXT = /https?:\/\/[^\s"'<>()[\]{}\\`|^]+/gi;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The URLs in a text, with trailing sentence punctuation dropped. */
export function urlsInText(text: string): string[] {
  return (text.match(URL_IN_TEXT) ?? []).map((url) =>
    url.replace(/[.,;:!?*_~]+$/, ""),
  );
}

/**
 * The URLs a conversation has seen, oldest first and once each: in the
 * person's messages, in tool results, and among the pages Claude's server
 * tools found. Never the model's own words or arguments — a URL it made up
 * is no evidence.
 */
export function conversationUrls(messages: readonly AgentMessage[]): string[] {
  const seen = new Set<string>();
  const add = (url: string) => {
    if (url) seen.add(url);
  };
  for (const message of messages) {
    if (message.role === "user") urlsInText(message.text).forEach(add);
    else if (message.role === "tool") urlsInText(message.content).forEach(add);
    else {
      for (const use of message.serverToolUses ?? []) {
        for (const page of use.result?.pages ?? []) add(page.url);
      }
    }
  }
  return [...seen];
}

/** A URL in three parts, leniently — it need not parse (that is the point). */
export interface LooseUrl {
  scheme: string;
  host: string;
  /** Everything after the host: port, path, query, hash. */
  rest: string;
}

export function looseUrl(url: string): LooseUrl | undefined {
  const match =
    /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^/?#:]*)(.*)$/i.exec(
      url.trim(),
    );
  if (!match) return undefined;
  return {
    scheme: match[1].toLowerCase(),
    host: match[2].toLowerCase(),
    rest: match[3],
  };
}

/**
 * Whether `url` is not one a fetch could use: it does not parse, or its host
 * has an empty label (`www..example.com`) or a character no host name has.
 */
export function malformedUrl(url: string): boolean {
  if (!URL.canParse(url)) return true;
  const host = new URL(url).hostname;
  if (host.startsWith("[")) return false;
  const labels = host.split(".");
  return labels.some((label) => !/^[a-z0-9-]+$/i.test(label));
}

/** The edit distance between two strings (insert, delete, substitute). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** Whether `longer` is `shorter` with one label added somewhere. */
function oneLabelMore(longer: string[], shorter: string[]): boolean {
  if (longer.length !== shorter.length + 1) return false;
  return longer.some((_, skip) =>
    longer
      .filter((__, index) => index !== skip)
      .every((label, index) => label === shorter[index]),
  );
}

/** Whether two different hosts are one slip apart (see the module comment). */
export function hostsNear(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (!left || !right || left === right) return false;
  if (levenshtein(left, right) <= NEAR_MISS_MAX_EDITS) return true;
  const x = left.split(".");
  const y = right.split(".");
  return oneLabelMore(x, y) || oneLabelMore(y, x);
}

/**
 * The URL `url` most likely meant, from `seen`: one whose host is a slip
 * away. One with the same port, path and query is named as it was seen;
 * otherwise `url` itself on the seen URL's host. Nothing when no seen host is
 * near, or when `url` was seen as it is.
 */
export function nearMissUrl(
  url: string,
  seen: readonly string[],
): string | undefined {
  const wanted = looseUrl(url);
  if (!wanted || seen.includes(url.trim())) return undefined;
  let rebuilt: string | undefined;
  for (const candidate of seen) {
    const known = looseUrl(candidate);
    if (!known || !hostsNear(wanted.host, known.host)) continue;
    if (known.rest === wanted.rest) return candidate;
    rebuilt ??= `${known.scheme}://${known.host}${wanted.rest}`;
  }
  return rebuilt;
}

/** The URL argument of a checked tool's call, if it has one. */
function urlArgument(tool: string, input: unknown): string | undefined {
  const key = NEAR_MISS_TOOLS[tool];
  if (!key || !isObject(input)) return undefined;
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * "Did you mean …?" for a failed call to a checked tool, or nothing: its URL
 * is malformed or the failure says the address failed (`addressFailed`:
 * `message`, or `cause`'s code), and a seen URL is a slip away. `messages`
 * is the conversation before this call's result.
 */
export function nearMissHint(
  tool: string,
  input: unknown,
  message: string,
  messages: readonly AgentMessage[],
  cause?: unknown,
): string | undefined {
  const url = urlArgument(tool, input);
  if (!url) return undefined;
  if (!malformedUrl(url) && !addressFailed(message, cause)) return undefined;
  const meant = nearMissUrl(url, conversationUrls(messages));
  return meant ? `Did you mean ${meant}?` : undefined;
}

/**
 * A tool's result with the hint added to its error's message (and the URL
 * as `error.didYouMean`), when `nearMissHint` has one; anything else as it
 * came.
 */
export function withNearMissHint(
  tool: string,
  input: unknown,
  result: unknown,
  messages: readonly AgentMessage[],
): unknown {
  if (!isObject(result) || !isObject(result.error)) return result;
  const error = result.error;
  const message = typeof error.message === "string" ? error.message : "";
  const hint = nearMissHint(tool, input, message, messages, error);
  if (!hint) return result;
  const meant = hint.slice("Did you mean ".length, -1);
  return {
    ...result,
    error: {
      ...error,
      message: message ? `${message.replace(/[.\s]+$/, "")}. ${hint}` : hint,
      didYouMean: meant,
    },
  };
}
