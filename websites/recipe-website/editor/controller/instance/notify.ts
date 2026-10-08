/**
 * Tell Roger when sync needs a person (epic 28, D5): a desktop notification
 * on the workstation, once per new state, never per run.
 *
 * `notify-send` from the editor process — which runs in the desktop session,
 * so the session bus is in its environment. Best effort and silent when the
 * tool or the bus is missing (a headless start, CI).
 */
import { execFile } from "node:child_process";
import type { MirrorSyncState } from "@discontent/cms/git/syncState";

/** The states worth a notification, as a stable key (or `null`: all fine). */
export function attentionKey(state: MirrorSyncState): string | null {
  if (state.outcome === "conflict" || state.outcome === "mirror_dirty") {
    return `${state.remote}:${state.outcome}`;
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
  switch (state.outcome) {
    case "conflict":
      return {
        title: `Recipe sync with ${state.remote}: conflict`,
        body: "Both sides changed the same recipe. Open Content Sync on the workstation and Pull to resolve it.",
      };
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
