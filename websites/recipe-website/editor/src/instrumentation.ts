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
  /*
   * Epic 37 (D5): jobs a dead process left `queued`/`running` become
   * `interrupted`, and the store is pruned (D1). Housekeeping only.
   */
  try {
    const { maintainJobs } = await import("../controller/jobs/run");
    await maintainJobs();
  } catch (error) {
    console.error("[jobs] boot sweep failed:", error);
  }
  /*
   * 37b (D6 amended): with a GPU release hook set, the editor keeps it for
   * the machine — it closes a spell a CLI run began and did not outlive.
   */
  try {
    const { startGpuKeeper } = await import("../controller/jobs/gpuHooks");
    startGpuKeeper();
  } catch (error) {
    console.error("[queue] GPU keeper failed to start:", error);
  }
}
