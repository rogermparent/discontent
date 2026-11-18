import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { getWorkstationName } from "recipe-website-common/config/role";
import { When } from "@/curator/time";
import {
  workstationConfig,
  type PingState,
} from "../../../../../controller/instance/pinger";
import { syncOutcomeWords } from "../../../../../controller/curation/syncWords";
import { pingWorkstationAction } from "./mirrorActions";
import { CommandButton } from "./CommandButton";
import { UpkeepRow } from "./UpkeepRow";

/**
 * A mirror's sync row (48d; epic 28's "Synced by" card, D6): the workstation
 * syncs this editor; this shows whether the last "please sync" reached it
 * and what it answered, offers to ask again, and the mirror's own Pull from
 * the workstation (a fast-forward, when this editor has nothing waiting).
 */
export function WorkstationCard({
  ping,
  upstream,
  ahead,
  blocked,
}: {
  ping: PingState | null;
  upstream?: string;
  ahead: number;
  blocked: boolean;
}) {
  const name = getWorkstationName();
  const configured = workstationConfig() !== null;
  return (
    <div data-testid="workstation-card">
      <UpkeepRow
        title={`Synced by ${name}`}
        state={
          !configured
            ? "can't ask yet"
            : ping?.ok
              ? "by itself"
              : ping
                ? "last ask failed"
                : "by itself"
        }
        tone={!configured || (ping && !ping.ok) ? "warn" : "ok"}
        when={`if ${name} was off when a change was made here, and you want it there now rather than at the next change.`}
        actions={
          <>
            {configured && (
              <form action={pingWorkstationAction}>
                <SubmitButton pendingChildren="Asking…">
                  Ask {name} to sync
                </SubmitButton>
              </form>
            )}
            <CommandButton
              command="pull"
              variant="outline"
              disabled={blocked || !upstream || ahead > 0}
              pending="Pulling…"
            >
              Pull from {name}
            </CommandButton>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {name} pulls this mirror&apos;s changes and pushes its own after every
          change on either side; this editor pings it after each change here.
        </p>
        {!configured ? (
          <p className="text-sm text-warning">
            WORKSTATION_URL and WORKSTATION_SYNC_TOKEN are not set, so this
            mirror cannot ask {name} to sync; `pnpm deploy:pi --setup` sets
            them.
          </p>
        ) : (
          <>
            <p
              className={
                ping?.ok
                  ? "text-sm text-success"
                  : ping
                    ? "text-sm text-warning"
                    : "text-sm"
              }
              data-testid="ping-state"
            >
              {ping ? (
                <>
                  Last asked <When epoch={Date.parse(ping.at)} />:{" "}
                  {ping.ok
                    ? `${name} answered: ${ping.outcome ? syncOutcomeWords(ping.outcome) : "ok"}`
                    : (ping.message ?? `HTTP ${ping.status}`)}
                </>
              ) : (
                "Not asked yet."
              )}
            </p>
            {ping?.ok && ping.message && (
              <p className="text-sm whitespace-pre-wrap">{ping.message}</p>
            )}
          </>
        )}
      </UpkeepRow>
    </div>
  );
}
