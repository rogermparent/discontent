/**
 * Expire the editor's rendered pages and derived tags from background work
 * (epic 28): the sync runner's merges and D12's reindex run outside any
 * request, where Next's `revalidateTag`/`revalidatePath` have no store to act
 * on. So they ask the editor itself, over loopback, at
 * `/api/internal/refresh`, guarded by a secret that exists only in this
 * process's memory (minted on first use, on `globalThis` so the route
 * handler's bundle sees the same one).
 */
import { randomBytes } from "crypto";

interface RefreshGlobal {
  __discontentInternalSecret?: string;
}

export function internalSecret(): string {
  const g = globalThis as RefreshGlobal;
  g.__discontentInternalSecret ??= randomBytes(32).toString("hex");
  return g.__discontentInternalSecret;
}

/** The secret if one was minted in this process, else `undefined`. */
export function existingInternalSecret(): string | undefined {
  return (globalThis as RefreshGlobal).__discontentInternalSecret;
}

export function internalBaseUrl(): string {
  return (
    process.env.EDITOR_INTERNAL_URL ??
    `http://127.0.0.1:${process.env.PORT ?? "3000"}`
  );
}

/** Best effort: a failure is logged, never thrown — the data is already right. */
export async function refreshEditor(): Promise<void> {
  try {
    const response = await fetch(`${internalBaseUrl()}/api/internal/refresh`, {
      method: "POST",
      headers: { "x-discontent-internal": internalSecret() },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.warn(`[sync] editor refresh answered ${response.status}`);
    }
  } catch (error) {
    console.warn("[sync] editor refresh failed:", (error as Error).message);
  }
}
