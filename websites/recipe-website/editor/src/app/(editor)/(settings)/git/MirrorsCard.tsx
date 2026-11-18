import Link from "next/link";
import clsx from "clsx";
import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { SelectInput } from "@discontent/component-library/components/Form/inputs/Select";
import type {
  MirrorSyncState,
  SyncStateFile,
} from "@discontent/cms/git/syncState";
import { When } from "@/curator/time";
import { syncOutcomeWords } from "../../../../../controller/curation/syncWords";
import type { RemoteSummary } from "./types";
import {
  addMirrorAction,
  removeMirrorAction,
  syncMirrorNowAction,
} from "./mirrorActions";
import { CommandButton } from "./CommandButton";
import { UpkeepRow, type RowTone } from "./UpkeepRow";

function at(iso: string | undefined) {
  return iso ? <When epoch={Date.parse(iso)} /> : "never";
}

const OUTCOME_TONE: Record<string, "ok" | "warn" | "neutral"> = {
  nothing: "ok",
  synced: "ok",
  raced: "neutral",
  busy: "neutral",
};

function MirrorLine({
  name,
  entry,
  url,
}: {
  name: string;
  entry: MirrorSyncState | undefined;
  url?: string;
}) {
  const tone = entry ? (OUTCOME_TONE[entry.outcome] ?? "warn") : "neutral";
  return (
    <li
      className="flex flex-col gap-1 rounded-lg border p-3"
      data-testid={`mirror-${name}`}
    >
      <div className="flex flex-row flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono font-semibold">{name}</span>
        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {url}
        </span>
      </div>
      <p
        className={clsx(
          "text-sm",
          tone === "ok" && "text-success",
          tone === "warn" && "text-warning",
        )}
        data-testid="mirror-outcome"
      >
        {entry ? (
          <>
            Last sync {at(entry.lastAttempt)}: {syncOutcomeWords(entry.outcome)}
            {entry.pulled || entry.pushed
              ? ` (in ${entry.pulled ?? 0}, out ${entry.pushed ?? 0})`
              : ""}
          </>
        ) : (
          "Not synced yet."
        )}
      </p>
      {entry?.message && (
        <p className="text-sm whitespace-pre-wrap">{entry.message}</p>
      )}
      {entry && entry.outcome !== "nothing" && entry.outcome !== "synced" && (
        <p className="text-xs text-muted-foreground">
          Last success: {at(entry.lastSuccess)}
          {entry.consecutiveFailures > 0 &&
            ` · ${entry.consecutiveFailures} failure${entry.consecutiveFailures === 1 ? "" : "s"} in a row`}
        </p>
      )}
      {entry?.conflictSince && (
        <p className="text-xs" data-testid="mirror-conflict">
          Conflict standing since {at(entry.conflictSince)}
          {entry.conflictJob && (
            <>
              {" · "}
              <Link href={`/jobs/${entry.conflictJob}`} className="underline">
                the sync that hit it
              </Link>
            </>
          )}
          {" · "}
          {entry.standingSent?.error
            ? `${name}'s editor not told: ${entry.standingSent.error}`
            : entry.standingSent?.key?.startsWith("conflict:")
              ? `${name}'s editor was told`
              : `${name}'s editor hears of it on its next ping`}
        </p>
      )}
      <div className="mt-1 flex flex-row flex-wrap gap-2">
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
}

/**
 * The workstation's sync row (48d; epic 28's Mirrors card, D6): which
 * remotes it syncs on startup and after every change, what the last sync
 * did, Sync now, and adding or removing a mirror. With an upstream that is
 * not a mirror, its Sync (fetch, merge, push) is here too. A mirror's
 * `/git` shows `WorkstationCard` instead.
 */
export function MirrorsCard({
  remotes,
  mirrors,
  state,
  upstream,
  diverged,
  blocked,
}: {
  remotes: RemoteSummary[];
  mirrors: string[];
  state: SyncStateFile;
  upstream?: string;
  diverged: boolean;
  blocked: boolean;
}) {
  const addable = remotes.filter((remote) => !mirrors.includes(remote.name));
  const entries = mirrors.map((name) => state[name]);
  const failing = entries.some(
    (entry) => entry && (entry.consecutiveFailures > 0 || entry.conflictSince),
  );
  const last = entries
    .map((entry) => entry?.lastAttempt)
    .filter((iso): iso is string => Boolean(iso))
    .sort()
    .at(-1);
  let stateWord: string;
  let tone: RowTone;
  if (mirrors.length === 0) {
    stateWord = upstream ? "by hand" : "not set up";
    tone = "muted";
  } else if (failing) {
    stateWord = "needs a look";
    tone = "warn";
  } else {
    stateWord = "by itself";
    tone = "ok";
  }
  const named = mirrors.length > 0 ? mirrors.join(" and ") : undefined;
  return (
    <div data-testid="mirrors-card">
      <UpkeepRow
        title={named ? `Sync with ${named}` : "Sync"}
        state={stateWord}
        tone={tone}
        when={
          mirrors.length > 0
            ? `if ${named} was off or unreachable and you want its changes now, rather than at the next edit.`
            : upstream
              ? `when you want ${upstream}'s changes here, or this editor's there. Add the remote as a mirror below and it syncs by itself.`
              : undefined
        }
        actions={
          upstream && mirrors.length === 0 ? (
            <CommandButton command="sync" disabled={blocked} pending="Syncing…">
              {diverged ? "Sync (will merge)" : "Sync"}
            </CommandButton>
          ) : undefined
        }
      >
        <p className="text-sm text-muted-foreground">
          {mirrors.length > 0 ? (
            <>
              When this editor starts, after every change here, and when {named}{" "}
              pings after a change there.
              {last && <> Last ran {at(last)}.</>}
            </>
          ) : upstream ? (
            <>
              Fetches {upstream}, brings its changes in (merging if both sides
              moved), then sends this editor&apos;s.
            </>
          ) : (
            "A mirror is synced by itself: on start, after every change on either side."
          )}
        </p>
        {mirrors.length === 0 && <p className="text-sm">No mirrors yet.</p>}
        {mirrors.length > 0 && (
          <ul className="mt-1 flex flex-col gap-2">
            {mirrors.map((name) => (
              <MirrorLine
                key={name}
                name={name}
                entry={state[name]}
                url={remotes.find((remote) => remote.name === name)?.fetchUrl}
              />
            ))}
          </ul>
        )}
        {addable.length > 0 && (
          <form
            action={addMirrorAction}
            className="mt-1 flex flex-row flex-wrap items-end gap-2"
          >
            <SelectInput
              label="Add a remote as a mirror"
              name="remote"
              id="mirrors-add-remote"
              className="mb-0 w-auto text-sm"
              options={addable.map((remote) => ({
                value: remote.name,
                label: remote.name,
              }))}
            />
            <SubmitButton size="sm" variant="secondary">
              Add mirror
            </SubmitButton>
          </form>
        )}
      </UpkeepRow>
    </div>
  );
}
