import { SubmitButton } from "@discontent/component-library/components/SubmitButton";
import { getContentDirectory } from "@discontent/cms/fs/getContentDirectory";
import clsx from "clsx";
import { getWorkstationName } from "recipe-website-common/config/role";
import {
  readPingState,
  workstationConfig,
} from "../../../../../controller/instance/pinger";
import { pingWorkstationAction } from "./mirrorActions";

/**
 * A mirror's view of its workstation (epic 28, D6): the workstation syncs
 * this editor; this shows whether the last "please sync" reached it and what
 * it answered, and offers to ask again.
 */
export async function WorkstationCard() {
  const name = getWorkstationName();
  const configured = workstationConfig() !== null;
  const ping = await readPingState(getContentDirectory());

  return (
    <section
      className="border border-border rounded-md p-4 my-3 bg-card/40"
      data-testid="workstation-card"
    >
      <h2 className="font-bold">Synced by {name}</h2>
      <p className="text-sm text-muted-foreground mb-2">
        {name} pulls this mirror&apos;s changes and pushes its own after every
        change on either side.
      </p>
      {!configured ? (
        <p className="text-sm text-warning">
          WORKSTATION_URL and WORKSTATION_SYNC_TOKEN are not set, so this mirror
          cannot ask {name} to sync; `pnpm deploy:pi --setup` sets them.
        </p>
      ) : (
        <>
          <p
            className={clsx(
              "text-sm",
              ping?.ok ? "text-success" : ping ? "text-warning" : undefined,
            )}
            data-testid="ping-state"
          >
            {ping
              ? `Last asked ${new Date(ping.at).toLocaleString()}: ` +
                (ping.ok
                  ? `${name} answered ${ping.outcome ?? "ok"}`
                  : (ping.message ?? `HTTP ${ping.status}`))
              : `Not asked yet.`}
          </p>
          {ping?.ok && ping.message && (
            <p className="text-sm whitespace-pre-wrap">{ping.message}</p>
          )}
          <form action={pingWorkstationAction} className="mt-2">
            <SubmitButton size="sm" pendingChildren="Asking…">
              Ask {name} to sync
            </SubmitButton>
          </form>
        </>
      )}
    </section>
  );
}
