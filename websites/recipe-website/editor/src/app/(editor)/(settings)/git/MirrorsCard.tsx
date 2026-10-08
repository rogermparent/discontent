import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import { readSyncState } from "@discontent/cms/git/syncState";
import clsx from "clsx";
import { readSettings } from "@/settings";
import type { RemoteSummary } from "./types";
import {
  addMirrorAction,
  removeMirrorAction,
  syncMirrorNowAction,
} from "./mirrorActions";

function when(iso: string | undefined): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString();
}

const OUTCOME_TONE: Record<string, "ok" | "warn" | "neutral"> = {
  nothing: "ok",
  synced: "ok",
  raced: "neutral",
};

/**
 * The workstation's mirrors (epic 28, D6): which remotes it syncs on
 * startup and after every change, what the last sync did, "Sync now", and
 * adding or removing a mirror. A mirror's own `/git` shows `WorkstationCard`
 * instead.
 */
export async function MirrorsCard({ remotes }: { remotes: RemoteSummary[] }) {
  const contentDirectory = getContentDirectory();
  const [settings, state] = await Promise.all([
    readSettings(),
    readSyncState(contentDirectory),
  ]);
  const mirrors = settings.mirrors ?? [];
  const addable = remotes.filter((remote) => !mirrors.includes(remote.name));

  return (
    <section
      className="border border-border rounded-md p-4 my-3 bg-card/40"
      data-testid="mirrors-card"
    >
      <h2 className="font-bold">Mirrors</h2>
      <p className="text-sm text-muted-foreground mb-2">
        Synced automatically when this editor starts and after every change here
        or on the mirror.
      </p>
      {mirrors.length === 0 && <p className="text-sm my-2">No mirrors yet.</p>}
      <ul className="flex flex-col gap-3">
        {mirrors.map((name) => {
          const entry = state[name];
          const tone = entry
            ? (OUTCOME_TONE[entry.outcome] ?? "warn")
            : "neutral";
          const url = remotes.find((remote) => remote.name === name)?.fetchUrl;
          return (
            <li
              key={name}
              className="rounded border border-border p-3"
              data-testid={`mirror-${name}`}
            >
              <div className="flex flex-row flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono font-bold">{name}</span>
                <span className="text-xs text-muted-foreground">{url}</span>
              </div>
              <p
                className={clsx(
                  "text-sm my-1",
                  tone === "ok" && "text-success",
                  tone === "warn" && "text-warning",
                )}
                data-testid="mirror-outcome"
              >
                {entry
                  ? `Last sync ${when(entry.lastAttempt)}: ${entry.outcome}` +
                    (entry.pulled || entry.pushed
                      ? ` (in ${entry.pulled ?? 0}, out ${entry.pushed ?? 0})`
                      : "")
                  : "Not synced yet."}
              </p>
              {entry?.message && (
                <p className="text-sm whitespace-pre-wrap">{entry.message}</p>
              )}
              {entry &&
                entry.outcome !== "nothing" &&
                entry.outcome !== "synced" && (
                  <p className="text-xs text-muted-foreground">
                    Last success: {when(entry.lastSuccess)}
                    {entry.consecutiveFailures > 0 &&
                      ` · ${entry.consecutiveFailures} failure${entry.consecutiveFailures === 1 ? "" : "s"} in a row`}
                  </p>
                )}
              {entry?.outcome === "conflict" && (
                <p className="text-sm my-1">
                  Both sides changed the same file. Use <b>Pull</b> above: the
                  merge stops for you to resolve, then commit — the next sync
                  sends it to {name}.
                </p>
              )}
              <div className="flex flex-row gap-2 mt-2">
                <form action={syncMirrorNowAction}>
                  <input type="hidden" name="remote" value={name} />
                  <SubmitButton size="sm" pendingChildren="Syncing…">
                    Sync now
                  </SubmitButton>
                </form>
                <form action={removeMirrorAction}>
                  <input type="hidden" name="remote" value={name} />
                  <SubmitButton size="sm" variant="outline">
                    Remove
                  </SubmitButton>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      {addable.length > 0 && (
        <form action={addMirrorAction} className="flex flex-row gap-2 mt-3">
          <label className="text-sm flex flex-row items-center gap-2">
            Add a remote as a mirror
            <select
              name="remote"
              className="border border-border rounded px-2 py-1 bg-background"
            >
              {addable.map((remote) => (
                <option key={remote.name} value={remote.name}>
                  {remote.name}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton size="sm" variant="secondary">
            Add mirror
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
