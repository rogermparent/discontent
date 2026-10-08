/**
 * Next's server-start hook. Starts the instance's background work (epic 28:
 * the ref watcher, D12's reindex, the workstation's sync runner, a mirror's
 * pings) — see `controller/instance/start.ts`.
 *
 * Node runtime only, and never while building: `next build` loads this file
 * too, and a build must not start watching or syncing anything.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startInstance } = await import("../controller/instance/start");
  try {
    await startInstance();
  } catch (error) {
    console.error("[instance] failed to start:", error);
  }
}
