/**
 * When to tell a person about a mirror's sync (epic 28 D5, epic 39 D5).
 *
 * - **Once per new state.** `attentionKey` names the state (a conflict, a
 *   dirty mirror, three failures in a row); a key that differs from the one
 *   last told is notified on every channel (`notifyPerson`: the desktop, and
 *   `RECIPE_NOTIFY_URL` when set). A state that clears is forgotten, so the
 *   next one is new again.
 * - **A daily reminder while a conflict or a dirty mirror stands** — the
 *   two states only a person can end. Three failures in a row are not
 *   repeated: that is usually the Pi switched off, and a daily nag about it
 *   is noise.
 * - **Persisted**, as `attention: {key, since, at}` on the mirror's record in
 *   `.git/discontent-sync.json`: a restart neither notifies again a state
 *   already told (28c kept the last key in memory, so every restart did)
 *   nor resets the reminder's clock.
 *
 * Checked after every sync the running instance makes (`runMirrorSync`) and
 * by the instance's hourly timer (`REMINDER_CHECK_MS`, unref'd), so a
 * reminder comes even when nothing syncs, and a state another process
 * recorded (`recipes git sync`) is told too. One check at a time in this
 * process, so the two never both tell the same new state.
 */
import {
  patchMirrorState,
  readSyncState,
  type MirrorSyncState,
} from "@discontent/cms/git/syncState";
import {
  attentionKey,
  attentionText,
  notifyPerson,
  reminderText,
} from "./notify";

export const REMINDER_INTERVAL_MS = 24 * 60 * 60_000;
export const REMINDER_CHECK_MS = 60 * 60_000;

/** The states a daily reminder repeats. */
const REMINDED = [":conflict", ":mirror_dirty"];

export type Notify = (title: string, body: string) => void;

export interface AttentionOptions {
  notify?: Notify;
  now?: Date;
}

export type AttentionOutcome = "notified" | "reminded" | "cleared" | null;

let checks: Promise<unknown> = Promise.resolve();

function reminderDue(
  key: string,
  record: NonNullable<MirrorSyncState["attention"]>,
  now: Date,
): boolean {
  if (!REMINDED.some((suffix) => key.endsWith(suffix))) return false;
  return now.getTime() - Date.parse(record.at) >= REMINDER_INTERVAL_MS;
}

/**
 * Look at one mirror's record and tell a person if it is due: a new state,
 * or a reminder. Answers what it did. Never throws.
 */
export function noteAttention(
  contentDirectory: string,
  remote: string,
  { notify = notifyPerson, now = new Date() }: AttentionOptions = {},
): Promise<AttentionOutcome> {
  const result = checks.then(async (): Promise<AttentionOutcome> => {
    const state = (await readSyncState(contentDirectory))[remote];
    if (!state) return null;
    const key = attentionKey(state);
    const previous = state.attention;
    if (!key) {
      if (!previous) return null;
      await patchMirrorState(contentDirectory, remote, {
        attention: undefined,
      });
      return "cleared";
    }
    if (previous?.key !== key) {
      const { title, body } = attentionText(state);
      notify(title, body);
      const at = now.toISOString();
      await patchMirrorState(contentDirectory, remote, {
        attention: { key, since: at, at },
      });
      return "notified";
    }
    if (reminderDue(key, previous, now)) {
      const { title, body } = reminderText(state, previous.since);
      notify(title, body);
      await patchMirrorState(contentDirectory, remote, {
        attention: { ...previous, at: now.toISOString() },
      });
      return "reminded";
    }
    return null;
  });
  checks = result.catch(() => undefined);
  return result.catch((error) => {
    console.error("[sync] attention check failed:", error);
    return null;
  });
}
