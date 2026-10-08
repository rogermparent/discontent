/**
 * A mirror asking the workstation to sync it (epic 28, D4).
 *
 * After any HEAD move on the mirror — its editor's commits, a shell commit, a
 * push the workstation just made — and at startup, the mirror POSTs the
 * workstation's `/api/git/sync` with `WORKSTATION_SYNC_TOKEN`. It does not
 * try to tell a local commit from an incoming push: a redundant ping costs
 * the workstation one fetch that ends in `nothing`, and `nothing` pushes
 * nothing, so it cannot loop.
 *
 * Fire-and-forget with a generous timeout (the workstation's run may merge
 * and reindex). The last result is kept in `.git/discontent-ping.json` for the
 * mirror's `/git`. If the workstation is down, nothing is retried here: its
 * own startup sync catches up.
 */
import { readFile, writeFile } from "fs/promises";
import { isAbsolute, join } from "path";
import simpleGit from "simple-git";

const PING_STATE = "discontent-ping.json";

export interface PingState {
  at: string;
  ok: boolean;
  /** HTTP status, when there was a response. */
  status?: number;
  /** The workstation's sync outcome, when it answered. */
  outcome?: string;
  message?: string;
}

async function statePath(contentDirectory: string): Promise<string> {
  const raw = String(
    await simpleGit({ baseDir: contentDirectory }).raw([
      "rev-parse",
      "--git-path",
      PING_STATE,
    ]),
  ).trim();
  return isAbsolute(raw) ? raw : join(contentDirectory, raw);
}

export async function readPingState(
  contentDirectory: string,
): Promise<PingState | null> {
  try {
    return JSON.parse(
      await readFile(await statePath(contentDirectory), "utf8"),
    );
  } catch {
    return null;
  }
}

async function writePingState(contentDirectory: string, state: PingState) {
  try {
    await writeFile(
      await statePath(contentDirectory),
      `${JSON.stringify(state, null, 2)}\n`,
    );
  } catch {
    /* A lost status line is fine. */
  }
}

export function workstationConfig(): { url: string; token: string } | null {
  const url = process.env.WORKSTATION_URL?.replace(/\/+$/, "");
  const token = process.env.WORKSTATION_SYNC_TOKEN;
  return url && token ? { url, token } : null;
}

export async function pingWorkstation(
  contentDirectory: string,
  { timeoutMs = 120_000 }: { timeoutMs?: number } = {},
): Promise<PingState> {
  const config = workstationConfig();
  const at = new Date().toISOString();
  if (!config) {
    const state = {
      at,
      ok: false,
      message: "WORKSTATION_URL and WORKSTATION_SYNC_TOKEN are not set.",
    };
    await writePingState(contentDirectory, state);
    return state;
  }
  let state: PingState;
  try {
    const response = await fetch(`${config.url}/api/git/sync`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await response.json().catch(() => ({}))) as {
      outcome?: string;
      message?: string;
      error?: { message?: string };
    };
    state = {
      at,
      ok: response.ok,
      status: response.status,
      ...(body.outcome ? { outcome: body.outcome } : {}),
      ...(body.message || body.error?.message
        ? { message: body.message ?? body.error?.message }
        : {}),
    };
  } catch (error) {
    state = {
      at,
      ok: false,
      message: `${new URL(config.url).hostname} not reached: ${(error as Error).message}`,
    };
  }
  await writePingState(contentDirectory, state);
  return state;
}
