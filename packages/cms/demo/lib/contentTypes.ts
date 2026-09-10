/**
 * Every content type the demo owns, in one list — the same registry shape each
 * production site declares (F21).
 *
 * The demo is where the engine proves its own features, so leaving it as the
 * last place that enumerates derived reads by hand would recreate exactly the
 * drift F21 exists to kill: whoever adds a third demo content type would have
 * to remember `reset-cache`, and the failure for forgetting is an
 * order-dependent suite rather than an error.
 *
 * Its own module, imported by no config — see recipe's `contentTypes.ts` for
 * why that matters where reference thunks are involved. Neither demo config
 * declares `references` today, so the rule is precautionary here rather than
 * load-bearing.
 */
import type { AnyContentTypeConfig } from "@discontent/cms/content/types";
import { bookmarkConfig } from "./bookmarks";
import { noteConfig } from "./notes";

export const demoContentTypes: AnyContentTypeConfig[] = [
  noteConfig,
  bookmarkConfig,
];

export default demoContentTypes;
