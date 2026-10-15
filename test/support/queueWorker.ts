/**
 * One queue client process for `test/queue.test.ts` (epic 37, 37b).
 *
 * `tsx queueWorker.ts '<json>'` — the JSON names the resource, this worker's
 * name, its tier and a log file. It joins the queue (`RECIPE_QUEUE_DIR`, from
 * the environment), appends `enter <name> <ms>` when granted, holds the
 * slot until `holdUntil` (a file) exists — at most 45 s, then it exits 3 —
 * or for `holdMs`, appends
 * `exit <name> <ms>` and lets go. With `pacer: <url>` it makes one
 * `SitePacer` request on the real clock instead (the polite gap from
 * `RECIPE_POLITE_GAP_MS`), so the gap is asserted across processes.
 */
import { appendFile, access } from "node:fs/promises";

interface WorkerSpec {
  resource?: string;
  name: string;
  tier?: "interactive" | "batch";
  log: string;
  holdUntil?: string;
  holdMs?: number;
  gapMs?: number;
  pacer?: string;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * A hold waiting for `holdUntil` gives up after this, and the worker exits
 * on its own: a test that failed before writing the file (or a runner killed
 * before its `afterEach` could kill the workers) never leaves one polling
 * forever. Under the tests' own 60 s timeout, but well over what the FIFO
 * test needs on a loaded machine (three more `tsx` starts while it holds).
 */
const HOLD_DEADLINE_MS = 45_000;

async function hold(spec: WorkerSpec): Promise<void> {
  await appendFile(spec.log, `enter ${spec.name} ${Date.now()}\n`);
  if (spec.holdUntil) {
    const deadline = Date.now() + HOLD_DEADLINE_MS;
    for (;;) {
      try {
        await access(spec.holdUntil);
        break;
      } catch {
        if (Date.now() > deadline) {
          process.stderr.write(
            `${spec.name}: gave up after ${HOLD_DEADLINE_MS / 1000} s\n`,
          );
          process.exit(3);
        }
        await sleep(20);
      }
    }
  } else {
    await sleep(spec.holdMs ?? 0);
  }
  await appendFile(spec.log, `exit ${spec.name} ${Date.now()}\n`);
}

async function main() {
  const spec = JSON.parse(process.argv[2]) as WorkerSpec;
  /* Loaded lazily: the pacer's imports cost a `tsx` start seconds. */
  if (spec.pacer) {
    const { SitePacer, realPacing } =
      await import("../../websites/recipe-website/editor/controller/curation/sitePacing");
    await new SitePacer(realPacing()).request(spec.pacer, () => hold(spec));
    return;
  }
  const { withResource } =
    await import("../../websites/recipe-website/editor/controller/jobs/queue");
  await withResource(
    spec.resource ?? "gpu",
    {
      tier: spec.tier ?? "interactive",
      ...(spec.gapMs ? { gapMs: spec.gapMs } : {}),
    },
    () => hold(spec),
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exit(1);
});
