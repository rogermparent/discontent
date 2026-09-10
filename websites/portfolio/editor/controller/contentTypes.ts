/**
 * Every content type this site owns, in one list. Portfolio's half of the
 * registry recipe's `contentTypes.ts` documents — see that file for why it is
 * its own module and why it lives in the editor package.
 *
 * Portfolio has **no production writer** of the derived-path ignore list, and
 * that is correct rather than a gap: it has no content-git at all — no
 * `simpleGit`, no git UI — and `commitContentChanges` no-ops when the content
 * directory is not a repository. Only the Playwright harness inits git, for
 * fixtures. So this list has one fewer consumer here than it does on recipe.
 */
import type { AnyContentTypeConfig } from "@discontent/cms/content/types";
import { pageContentConfig } from "@discontent/pages-collection/controller/pageContentConfig";
import { projectContentConfig } from "@discontent/projects-collection/controller/projectContentConfig";

export const portfolioContentTypes: AnyContentTypeConfig[] = [
  projectContentConfig,
  pageContentConfig,
];

export default portfolioContentTypes;
