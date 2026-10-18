/**
 * Tell Roger when sync needs a person (epic 28, D5): a desktop notification
 * on the workstation, once per new state, never per run.
 *
 * `notify-send` from the editor process — which runs in the desktop session,
 * so the session bus is in its environment. Best effort and silent when the
 * tool or the bus is missing (a headless start, CI).
 *
 * Epic 39, D5: **`RECIPE_NOTIFY_URL`** gets the same events, beside the
 * desktop — an ntfy-style plain-text `POST`: the body is the message, the
 * title goes in a `Title` header (ntfy reads it; a generic webhook ignores a
 * header it does not know, and still gets the text). Off unless set; `https`
 * only, except `http://localhost`, `127.0.0.1` and `[::1]` (a local relay,
 * tests). The URL often carries a secret (an ntfy topic, a token in the path
 * or query), so it is never logged or shown: log lines and errors name it as
 * `scheme://host/…` and scrub every part of it from an error's text; the
 * editor's pages say only "set" or "not set". A send has a timeout, is
 * never awaited by a sync, and a failure is a log line.
 */
import { execFile } from "node:child_process";
import type { MirrorSyncState } from "@discontent/cms/git/syncState";

/**
 * The states worth a notification, as a stable key (or `null`: all fine).
 * A conflict's key names which conflict (its `conflictSince`, 39d review):
 * one that cleared and came back is a new one, even when the clearing was a
 * sync this instance never looked at.
 */
export function attentionKey(state: MirrorSyncState): string | null {
  /* 39d, D4: a conflict stands until a sync succeeds, whatever came between. */
  if (state.outcome === "conflict" || state.conflictSince) {
    return state.conflictSince
      ? `${state.remote}:conflict:${state.conflictSince}`
      : `${state.remote}:conflict`;
  }
  if (state.outcome === "mirror_dirty") {
    return `${state.remote}:mirror_dirty`;
  }
  if (state.consecutiveFailures >= 3) {
    return `${state.remote}:failing`;
  }
  return null;
}

export function attentionText(state: MirrorSyncState): {
  title: string;
  body: string;
} {
  if (state.outcome === "conflict" || state.conflictSince) {
    return {
      title: `Recipe sync with ${state.remote}: conflict`,
      body: "Both sides changed the same recipe. Open Content Sync on the workstation and Pull to resolve it.",
    };
  }
  switch (state.outcome) {
    case "mirror_dirty":
      return {
        title: `Recipe sync with ${state.remote}: uncommitted changes there`,
        body: state.message ?? "Commit or discard them on the mirror.",
      };
    default:
      return {
        title: `Recipe sync with ${state.remote} keeps failing`,
        body: `${state.consecutiveFailures} attempts in a row: ${state.message ?? state.outcome}`,
      };
  }
}

/**
 * 39d, D5: the daily reminder's words, for a state that still stands.
 * `since` is when it began — a conflict's `conflictSince` — not when it was
 * first notified.
 */
export function reminderText(
  state: MirrorSyncState,
  since: string,
): { title: string; body: string } {
  const { title, body } = attentionText(state);
  return {
    title: `Still unresolved: ${title}`,
    body: `Since ${new Date(since).toLocaleString()}. ${body}`,
  };
}

export function desktopNotify(title: string, body: string): void {
  try {
    execFile(
      "notify-send",
      ["--app-name=Recipe Editor", title, body],
      { timeout: 5_000 },
      () => undefined,
    );
  } catch {
    /* Best effort. */
  }
}

/* --- RECIPE_NOTIFY_URL (39d, D5) ------------------------------------- */

export const NOTIFY_TIMEOUT_MS = 10_000;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type NotifyUrlConfig =
  | { status: "off" }
  | { status: "on"; url: URL; raw: string }
  | { status: "invalid"; reason: string; raw: string };

/** `RECIPE_NOTIFY_URL`, checked. A refusal's reason never repeats the URL. */
export function notifyUrlConfig(
  env: NodeJS.ProcessEnv = process.env,
): NotifyUrlConfig {
  const raw = env.RECIPE_NOTIFY_URL?.trim();
  if (!raw) return { status: "off" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { status: "invalid", reason: "it is not a URL", raw };
  }
  if (
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))
  ) {
    return { status: "on", url, raw };
  }
  return {
    status: "invalid",
    reason: "it must be https (http only for localhost)",
    raw,
  };
}

/** What a page may say about it: never the URL itself. */
export function notifyUrlStatus(env: NodeJS.ProcessEnv = process.env): string {
  const config = notifyUrlConfig(env);
  if (config.status === "off") return "not set";
  if (config.status === "on") return "set";
  return `set, but ignored: ${config.reason}`;
}

/** The URL as a log line may name it: scheme and host, nothing after. */
export function describeNotifyUrl(url: URL): string {
  return `${url.protocol}//${url.host}/…`;
}

/**
 * `text` with every part of the notify URL that could be a secret replaced:
 * the whole URL in its spellings, the path and each of its segments, the
 * query, the user and password. Errors from `fetch` rarely carry them, but
 * a log line must not depend on that.
 */
export function redactNotifyUrl(text: string, raw: string): string {
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {
    /* Only the raw string, then. */
  }
  const secrets = new Set<string>([raw]);
  if (url) {
    secrets.add(url.href);
    secrets.add(url.href.replace(/\/$/, ""));
    secrets.add(`${url.host}${url.pathname}`);
    if (url.pathname.length > 1) secrets.add(url.pathname);
    for (const segment of url.pathname.split("/")) {
      if (segment.length >= 3) {
        secrets.add(segment);
        try {
          secrets.add(decodeURIComponent(segment));
        } catch {
          /* Not encoded. */
        }
      }
    }
    if (url.search.length > 1) {
      secrets.add(url.search);
      secrets.add(url.search.slice(1));
      for (const value of url.searchParams.values()) {
        if (value.length >= 3) secrets.add(value);
      }
    }
    if (url.username) secrets.add(url.username);
    if (url.password) secrets.add(url.password);
  }
  let redacted = text;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (secret) redacted = redacted.split(secret).join("…");
  }
  return redacted;
}

/** Header values are bytes: the title is kept to printable ASCII. */
function headerSafe(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "?")
    .slice(0, 250);
}

let warnedInvalid = false;

export type WebhookOutcome =
  "off" | "invalid" | "sent" | { failed: string /* already redacted */ };

/**
 * POST one notification to `RECIPE_NOTIFY_URL`. Never throws; answers what
 * happened (tests) and logs a failure with the URL redacted. Callers do not
 * await it.
 */
export async function webhookNotify(
  title: string,
  body: string,
  {
    env = process.env,
    timeoutMs = NOTIFY_TIMEOUT_MS,
  }: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<WebhookOutcome> {
  const config = notifyUrlConfig(env);
  if (config.status === "off") return "off";
  if (config.status === "invalid") {
    if (!warnedInvalid) {
      warnedInvalid = true;
      console.warn(`[notify] RECIPE_NOTIFY_URL ignored: ${config.reason}.`);
    }
    return "invalid";
  }
  const where = describeNotifyUrl(config.url);
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "text/plain; charset=utf-8",
        title: headerSafe(title),
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    /* The body is not read: a relay may echo the topic back. */
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) {
      const failed = `HTTP ${response.status}`;
      console.warn(`[notify] RECIPE_NOTIFY_URL (${where}) answered ${failed}`);
      return { failed };
    }
    return "sent";
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    const text = [
      error instanceof Error ? error.message : String(error),
      cause instanceof Error ? cause.message : undefined,
    ]
      .filter(Boolean)
      .join(": ");
    const failed = redactNotifyUrl(text, config.raw);
    console.warn(`[notify] RECIPE_NOTIFY_URL (${where}) failed: ${failed}`);
    return { failed };
  }
}

/** Every channel a person is told on: the desktop, and the URL when set. */
export function notifyPerson(title: string, body: string): void {
  desktopNotify(title, body);
  void webhookNotify(title, body);
}
