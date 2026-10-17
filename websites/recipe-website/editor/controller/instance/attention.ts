/**
 * When to tell a person about a mirror's sync (epic 28 D5, epic 39 D5).
 *
 * - **Once per new state.** `attentionKey` names the state (a conflict since
 *   `<time>`, a dirty mirror, three failures in a row); a key that differs
 *   from the one last told is notified on every channel (`notifyPerson`: the
 *   desktop, and `RECIPE_NOTIFY_URL` when set). A state that clears is
 *   forgotten, so the next one is new again — and a conflict's key carries
 *   its `conflictSince`, so a new conflict is new even when the clearing
 *   between was never seen here (a sync another process ran).
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
 * by the instance's hourly timer (`REMINDER_CHECK_MS`, unref'd, inside the
 * instance's mutex), so a reminder comes even when nothing syncs, and a
 * state another process recorded (`recipes git sync`) is told too. The look
 * and the write are one step under the sync state's lock
 * (`updateMirrorState`), so a sync recording its attempt meanwhile — in this
 * process or another — is never overwritten, and two checks never both tell
 * the same new state.
 */
import {
  updateMirrorState,
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

/** The states a daily reminder repeats: a conflict, a dirty mirror. */
const REMINDED = /:(?:conflict(?::|$)|mirror_dirty$)/;

export type Notify = (title: string, body: string) => void;

export interface AttentionOptions {
  notify?: Notify;
  now?: Date;
}

export type AttentionOutcome = "notified" | "reminded" | "cleared" | null;

function reminderDue(
  key: string,
  record: NonNullable<MirrorSyncState["attention"]>,
  now: Date,
): boolean {
  if (!REMINDED.test(key)) return false;
  return now.getTime() - Date.parse(record.at) >= REMINDER_INTERVAL_MS;
}

/**
 * Look at one mirror's record and tell a person if it is due: a new state,
 * or a reminder. Answers what it did. Never throws.
 */
export async function noteAttention(
  contentDirectory: string,
  remote: string,
  { notify = notifyPerson, now = new Date() }: AttentionOptions = {},
): Promise<AttentionOutcome> {
  try {
    let outcome: AttentionOutcome = null;
    let message: { title: string; body: string } | undefined;
    const written = await updateMirrorState(
      contentDirectory,
      remote,
      (state) => {
        const key = attentionKey(state);
        const previous = state.attention;
        if (!key) {
          if (!previous) return undefined;
          outcome = "cleared";
          return { attention: undefined };
        }
        const at = now.toISOString();
        if (previous?.key !== key) {
          outcome = "notified";
          message = attentionText(state);
          return { attention: { key, since: at, at } };
        }
        if (reminderDue(key, previous, now)) {
          outcome = "reminded";
          /* The review's nit: "Since" is the conflict's own time. */
          message = reminderText(state, state.conflictSince ?? previous.since);
          return { attention: { ...previous, at } };
        }
        return undefined;
      },
    );
    if (!written) return null;
    if (message) notify(message.title, message.body);
    return outcome;
  } catch (error) {
    console.error("[sync] attention check failed:", error);
    return null;
  }
}
