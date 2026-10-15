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
afterAll(() => {
  rmSync(jobsDir, { recursive: true, force: true });
});
