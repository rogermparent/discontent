import "@testing-library/jest-dom";
import "@testing-library/jest-dom/vitest";
import * as matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";

expect.extend(matchers);

/*
 * 34f: the import seats queue every request per site, 15 s apart
 * (`curation/sitePacing.ts`). The suites drive them with stubbed `fetch`
 * against example.com URLs, so the real clock's gap is 0 here; the pacing
 * itself is asserted with a fake clock in `importList.test.ts`.
 */
process.env.RECIPE_POLITE_GAP_MS ??= "0";
