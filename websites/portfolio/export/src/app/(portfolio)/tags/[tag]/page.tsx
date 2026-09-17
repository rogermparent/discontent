import {
  generateTagStaticParams,
  tagRoute,
} from "@discontent/projects-collection/components/TagPage/routes";

/**
 * One tag's projects (24b). `Project.tags` was stored, indexed and printed on
 * every index row with nothing to click through to; this is the page it now
 * links at.
 */
export default tagRoute;

export const generateStaticParams = generateTagStaticParams;
