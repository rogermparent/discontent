import "@testing-library/jest-dom";
import "@testing-library/jest-dom/vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect } from "vitest";

expect.extend(matchers);

/*
 * 34f: the import seats queue every request per site, 15 s apart
 * (`curation/sitePacing.ts`). The suites drive them with stubbed `fetch`
 * against example.com URLs, so the real clock's gap is 0 here; the pacing
 * itself is asserted with a fake clock in `importList.test.ts`.
 */
process.env.RECIPE_POLITE_GAP_MS ??= "0";

/*
 * Epic 37: every import runs as a job, which writes a record and a step log
 * to `RECIPE_JOBS_DIR` — never `editor/jobs/` from a test. Each test file
 * gets its own temp directory (children it spawns inherit it), removed when
 * the file is done.
 */
const jobsDir = mkdtempSync(join(tmpdir(), "discontent-jobs-"));
process.env.RECIPE_JOBS_DIR = jobsDir;
/*
 * 37b: the queue's state (slots, waiters, the GPU hooks) is machine-wide by
 * default; a test file's is its own, inside its jobs dir — and said
 * explicitly, so a child handed a trimmed environment can be handed it too.
 * No GPU hooks run under test unless a test sets them.
 */
process.env.RECIPE_QUEUE_DIR = join(jobsDir, "queue");
delete process.env.RECIPE_GPU_ACQUIRE_CMD;
delete process.env.RECIPE_GPU_RELEASE_CMD;
/*
 * 40a: the placement check reads the GPU's VRAM counters for a model on a
 * loopback URL — never this machine's real card from a test. A directory
 * that does not exist reads as "no counters"; a test that wants a reading
 * makes its own `card0/device/mem_info_vram_*` files.
 */
process.env.RECIPE_DRM_DIR = join(jobsDir, "no-drm");
/*
 * 46a: the importer's SSRF guard (`editor/controller/urlGuard.ts`) refuses
 * loopback and checks every name's addresses. The suites' fixture servers
 * listen on 127.0.0.1 (some reached as `localhost`), and their stubbed
 * fetches name hosts that never resolve (`example.com`, `x.test`). Under
 * vitest only (the guard reads these with `VITEST` or `TEST_MODE` set; the
 * children a test spawns inherit them), those two hosts are let through and
 * every name resolves to a documentation address (TEST-NET-3), so no test
 * does real DNS. The guard's own tests set their own
 * (`setFetchGuardTesting`) and check the refusals.
 */
process.env.RECIPE_TEST_FETCH_ALLOW ??= "127.0.0.1,localhost";
process.env.RECIPE_TEST_DNS ??= "*=203.0.113.10";
afterAll(() => {
  rmSync(jobsDir, { recursive: true, force: true });
});
